/**
 * createYamlEditor: three modes around one text.
 *
 * A YamlDocument (document.ts), a bar (the mode buttons and a status) and two
 * views (views.ts): the text, and the tree / form. The text is the single
 * source of truth: the text view edits it directly, the tree and form views
 * through model.ts patches. Switching to them is refused while the text has
 * syntax errors, which then show at their line. `editor.document` takes more
 * views, mounted anywhere (docs/linked-views.md).
 */
import { createYamlDocument, defaultDocumentLabels, type YamlDocument, type YamlDocumentLabels, type YamlStatus } from './document'
import type { ParsedYaml, YamlPath } from './model'
import type { JsonSchema, SchemaMessages, YamlProblemInput } from './schema'
import { defaultViewLabels, mountTextView, mountTreeView, type YamlViewLabels } from './views'

export type YamlEditorMode = 'text' | 'tree' | 'form'

export interface YamlEditorLabels extends YamlViewLabels, YamlDocumentLabels {
  text: string
  tree: string
  form: string
  modes: string
  syntaxBlocked: string
  syntaxErrors: (n: number) => string
  warnings: (n: number) => string
}

export const defaultLabels: YamlEditorLabels = {
  text: 'Text',
  tree: 'Tree',
  form: 'Form',
  modes: 'View',
  syntaxBlocked: 'Fix the syntax errors before switching to the tree or form view',
  syntaxErrors: (n) => (n === 1 ? '1 syntax error' : `${n} syntax errors`),
  warnings: (n) => (n === 1 ? '1 warning' : `${n} warnings`),
  ...defaultDocumentLabels,
  ...defaultViewLabels,
}

export type YamlEditorStatus = YamlStatus

export interface YamlEditorProps {
  /** The YAML text. */
  content?: string
  /** The view to start in. Default, among `modes`: 'form' with a schema, 'tree' without, else the other structured one, else 'text'; 'text' while the text does not parse. */
  mode?: YamlEditorMode
  /**
   * The views offered, in the order of their buttons. Default all three. While
   * the text does not parse the text view shows anyway: it is the only way to fix it.
   */
  modes?: YamlEditorMode[]
  /** A JSON Schema (subset, see schema.ts): the tree and form controls and the built-in validation. */
  schema?: JsonSchema
  /** Extra checks, run on every valid change. */
  validator?: (value: unknown, parsed: ParsedYaml) => YamlProblemInput[]
  /** Problems found elsewhere (a server check): shown like the others. */
  problems?: YamlProblemInput[]
  /** Warn on valid YAML that is likely a typo, such as `key ::`. Default true. */
  lint?: boolean
  readOnly?: boolean
  /** Show the bar: the mode buttons and the status (syntax errors, warnings). Default true. */
  mainMenuBar?: boolean
  /** Show the mode buttons in the bar (hidden anyway with a single mode). Default true. */
  modeSwitch?: boolean
  labels?: Partial<YamlEditorLabels>
  schemaMessages?: Partial<SchemaMessages>
  /** Turn schema titles and descriptions into the text shown (i18n tokens). */
  translate?: (text: string) => string
  onChange?: (content: string, status: YamlEditorStatus) => void
  onChangeMode?: (mode: YamlEditorMode) => void
  /** A refused edit (e.g. renaming to an existing key). Default: console.warn. */
  onError?: (error: Error) => void
}

export interface YamlEditor {
  /** The editor's document: mount more views on it, anywhere (docs/linked-views.md). */
  readonly document: YamlDocument
  get(): string
  /** Replace the content; undo starts over. */
  set(content: string): void
  /** Replace the content as an edit; undo can bring the old one back. */
  update(content: string): void
  updateProps(props: Partial<YamlEditorProps>): void
  getMode(): YamlEditorMode
  /** False when refused: a mode not in `modes`, or tree / form while the text has syntax errors. */
  setMode(mode: YamlEditorMode): boolean
  /** The views offered (`modes`), for a host that draws its own buttons. */
  getModes(): YamlEditorMode[]
  /** Would setMode(mode) be accepted now? */
  canSetMode(mode: YamlEditorMode): boolean
  status(): YamlEditorStatus
  /** Show the entry at a path: its line in text mode, its field in tree mode. */
  revealPath(path: YamlPath): void
  focus(): void
  destroy(): void
}

export function createYamlEditor({ target, props = {} }: { target: HTMLElement; props?: YamlEditorProps }): YamlEditor {
  let p: YamlEditorProps = { ...props }
  let labels: YamlEditorLabels = { ...defaultLabels, ...p.labels }
  const doc = createYamlDocument(documentProps(p))
  const ALL_MODES: YamlEditorMode[] = ['text', 'tree', 'form']
  /** The modes offered: `modes` as given (known ones, once each), else all. */
  const allowed = (): YamlEditorMode[] => {
    const list = [...new Set((p.modes ?? []).filter((m) => ALL_MODES.includes(m)))]
    return list.length ? list : ALL_MODES
  }
  /** The view to fall back on: a structured one when offered (form first with a schema, tree first without), else text. */
  const defaultMode = (): YamlEditorMode => {
    const offered = allowed()
    const order: YamlEditorMode[] = p.schema ? ['form', 'tree', 'text'] : ['tree', 'form', 'text']
    return order.find((m) => offered.includes(m))!
  }
  const broken = () => doc.parsed().errors.length > 0
  let mode: YamlEditorMode = p.mode && allowed().includes(p.mode) ? p.mode : defaultMode()
  if (broken()) mode = 'text'

  const root = document.createElement('div')
  root.className = 'vye'
  const menu = document.createElement('div')
  menu.className = 'vye-menu'
  menu.setAttribute('role', 'toolbar')
  const modes = document.createElement('div')
  modes.className = 'vye-modes'
  modes.setAttribute('role', 'tablist')
  const status = document.createElement('span')
  status.className = 'vye-status'
  status.setAttribute('role', 'status')
  menu.append(modes, status)
  const body = document.createElement('div')
  body.className = 'vye-body'
  root.append(menu, body)
  target.appendChild(root)

  const tabs = {} as Record<YamlEditorMode, HTMLButtonElement>
  for (const m of ALL_MODES) {
    tabs[m] = document.createElement('button')
    const tab = tabs[m]
    tab.type = 'button'
    tab.className = `vye-tab vye-tab-${m}`
    tab.setAttribute('role', 'tab')
    tab.addEventListener('click', () => api.setMode(m))
    modes.appendChild(tab)
  }

  // The two views, inside the editor's own frame
  const textView = mountTextView(doc, body, { readOnly: !!p.readOnly, labels, frame: false })
  const treeView = mountTreeView(doc, body, { readOnly: !!p.readOnly, labels, frame: false, variant: mode === 'form' ? 'form' : 'tree' })

  function renderChrome() {
    root.classList.toggle('vye-readonly', !!p.readOnly)
    root.dataset.mode = mode
    menu.hidden = p.mainMenuBar === false
    // The buttons of the modes offered, in their order
    const offered = allowed()
    modes.replaceChildren(...offered.map((m) => tabs[m]))
    modes.hidden = p.modeSwitch === false || offered.length < 2
    modes.setAttribute('aria-label', labels.modes)
    for (const m of ALL_MODES) {
      tabs[m].textContent = labels[m]
      tabs[m].setAttribute('aria-selected', String(mode === m))
      tabs[m].classList.toggle('vye-tab-active', mode === m)
    }
    const parsed = doc.parsed()
    const blocked = parsed.errors.length > 0
    for (const m of ['tree', 'form'] as const) {
      tabs[m].setAttribute('aria-disabled', String(blocked))
      tabs[m].title = blocked ? labels.syntaxBlocked : ''
    }
    const warnings = blocked ? 0 : doc.status().problems.filter((pb) => pb.severity === 'warning').length
    status.textContent = blocked ? labels.syntaxErrors(parsed.errors.length) : warnings ? labels.warnings(warnings) : ''
    status.classList.toggle('vye-status-error', blocked)
    status.classList.toggle('vye-status-warning', !blocked && warnings > 0)
    textView.element.hidden = mode !== 'text'
    treeView.element.hidden = mode === 'text'
  }

  /** Show another view and tell (no checks: see setMode). */
  function switchTo(next: YamlEditorMode) {
    if (next === mode) return
    mode = next
    showMode()
    p.onChangeMode?.(mode)
  }

  /** The views for the current mode: the tree view draws only while shown. */
  function showMode() {
    if (mode !== 'text') treeView.setVariant(mode)
    treeView.setActive(mode !== 'text')
    renderChrome()
  }

  // After every change: a text that does not parse shows as text, the only way
  // to fix it; once it parses, back to an offered view if the text view is not one
  doc.subscribe(() => {
    if (broken() && mode !== 'text') switchTo('text')
    else if (!broken() && !allowed().includes(mode)) switchTo(defaultMode())
    else renderChrome()
  })

  const api: YamlEditor = {
    document: doc,
    get: () => doc.get(),
    set: (content) => doc.set(content),
    update: (content) => doc.update(content),
    updateProps(next) {
      const before = p
      p = { ...p, ...next }
      labels = { ...defaultLabels, ...p.labels }
      if (next.readOnly !== undefined && next.readOnly !== before.readOnly) {
        textView.setReadOnly(!!p.readOnly)
        treeView.setReadOnly(!!p.readOnly)
      }
      if (next.labels) {
        textView.setLabels(labels)
        treeView.setLabels(labels)
      }
      if (next.mode && next.mode !== mode) api.setMode(next.mode)
      // The document reads again, and its subscriber above fixes the view (one no longer offered, a broken text)
      doc.updateProps(documentProps(p, next))
    },
    getMode: () => mode,
    setMode(next) {
      if (next === mode) return true
      if (!allowed().includes(next)) return false
      if (next !== 'text' && broken()) {
        status.textContent = labels.syntaxBlocked
        textView.reveal(doc.parsed().errors[0].from)
        return false
      }
      switchTo(next)
      return true
    },
    getModes: () => [...allowed()],
    canSetMode: (next) => allowed().includes(next) && (next === 'text' || !broken()),
    status: () => doc.status(),
    revealPath(path) {
      if (mode === 'text' || broken()) textView.revealPath(path)
      else treeView.revealPath(path)
    },
    focus() {
      if (mode === 'text') textView.focus()
      else treeView.focus()
    },
    destroy() {
      textView.destroy()
      treeView.destroy()
      doc.destroy()
      root.remove()
    },
  }

  showMode()
  return api
}

/** The editor's props that belong to its document; `next`: only those given. */
function documentProps(p: YamlEditorProps, next: Partial<YamlEditorProps> = p) {
  const keys = ['content', 'schema', 'validator', 'problems', 'lint', 'schemaMessages', 'translate', 'onChange', 'onError'] as const
  const out: Record<string, unknown> = {}
  for (const key of keys) if (key in next) out[key] = p[key]
  if ('labels' in next || next === p) out.labels = { ...defaultLabels, ...p.labels }
  return out
}
