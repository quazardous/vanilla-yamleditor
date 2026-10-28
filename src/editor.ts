/**
 * createYamlEditor: three modes around one text.
 *
 * The text is the single source of truth. The text mode edits it directly;
 * the tree and form modes edit it through model.ts patches. Switching to them
 * is refused while the text has syntax errors, which then show at their line.
 */
import { YamlEditError, cssPath, lintYaml, locate, parseYaml, pathKey, rangeAt, toPath, type ParsedYaml, type YamlLint, type YamlPath, type YamlSyntaxError } from './model'
import { defaultSchemaMessages, validate, type JsonSchema, type SchemaMessages, type YamlProblem, type YamlProblemInput } from './schema'
import { TextMode, type TextMarker } from './text-mode'
import { TreeMode, type TreeLabels, type TreeProblem } from './tree-mode'

export type YamlEditorMode = 'text' | 'tree' | 'form'

export interface YamlEditorLabels extends TreeLabels {
  text: string
  tree: string
  form: string
  modes: string
  syntaxBlocked: string
  syntaxErrors: (n: number) => string
  warnings: (n: number) => string
  /** `truc ::` is the key `truc :`. */
  colonKey: (key: string, suggestion: string) => string
  spacedKey: (key: string) => string
}

export const defaultLabels: YamlEditorLabels = {
  text: 'Text',
  tree: 'Tree',
  form: 'Form',
  modes: 'View',
  syntaxBlocked: 'Fix the syntax errors before switching to the tree or form view',
  syntaxErrors: (n) => (n === 1 ? '1 syntax error' : `${n} syntax errors`),
  warnings: (n) => (n === 1 ? '1 warning' : `${n} warnings`),
  colonKey: (key, suggestion) => `The key is "${key}": did you mean "${suggestion}:"?`,
  spacedKey: (key) => `The key "${key}" starts or ends with a space`,
  addItem: 'Add item',
  addKey: 'Add',
  newKey: 'new key',
  remove: 'Remove',
  rename: 'Key name',
  empty: '(empty)',
  alias: 'An alias: edit it in the text view',
  count: (n) => (n === 1 ? '1 entry' : `${n} entries`),
}

export interface YamlEditorStatus {
  /** The plain value; undefined while there are syntax errors. */
  value: unknown
  syntaxErrors: YamlSyntaxError[]
  /** Schema, validator and external problems together. */
  problems: YamlProblem[]
}

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
  let text = p.content ?? ''
  let parsed = parseYaml(text)
  let problems: YamlProblem[] = []
  /** The warnings of lintYaml, first in `problems`, marked at their own span. */
  let lints: YamlLint[] = []
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
  let mode: YamlEditorMode = p.mode && allowed().includes(p.mode) ? p.mode : defaultMode()
  if (parsed.errors.length) mode = 'text'

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
  const textHost = document.createElement('div')
  textHost.className = 'vye-text'
  const treeHost = document.createElement('div')
  treeHost.className = 'vye-tree-host'
  body.append(textHost, treeHost)
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

  const textMode = new TextMode({
    parent: textHost,
    text,
    readOnly: !!p.readOnly,
    onChange: (next) => {
      text = next
      refresh(true)
    },
  })
  const treeMode = new TreeMode(treeHost)

  function computeProblems(): YamlProblem[] {
    // Paths from a validator or a server may come as strings
    const outside = (list: YamlProblemInput[] | undefined): YamlProblem[] => (list ?? []).map((pb) => ({ ...pb, path: toPath(pb.path) }))
    lints = []
    if (parsed.errors.length) return outside(p.problems)
    const out: YamlProblem[] = []
    if (p.lint !== false) {
      lints = lintYaml(parsed.doc)
      for (const lint of lints) {
        const message = lint.kind === 'colonKey' ? labels.colonKey(lint.key, lint.suggestion!) : labels.spacedKey(lint.key)
        out.push({ path: lint.path, message, severity: 'warning' })
      }
    }
    if (p.schema) out.push(...validate(parsed.value, p.schema, { ...defaultSchemaMessages, ...p.schemaMessages }))
    if (p.validator) {
      try {
        out.push(...outside(p.validator(parsed.value, parsed)))
      } catch (err) {
        ;(p.onError ?? console.warn)(err as Error)
      }
    }
    out.push(...outside(p.problems))
    return out
  }

  function currentStatus(): YamlEditorStatus {
    return { value: parsed.value, syntaxErrors: parsed.errors, problems }
  }

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
    const blocked = parsed.errors.length > 0
    for (const m of ['tree', 'form'] as const) {
      tabs[m].setAttribute('aria-disabled', String(blocked))
      tabs[m].title = blocked ? labels.syntaxBlocked : ''
    }
    const warnings = blocked ? 0 : problems.filter((pb) => pb.severity === 'warning').length
    status.textContent = blocked ? labels.syntaxErrors(parsed.errors.length) : warnings ? labels.warnings(warnings) : ''
    status.classList.toggle('vye-status-error', blocked)
    status.classList.toggle('vye-status-warning', !blocked && warnings > 0)
    textHost.hidden = mode !== 'text'
    treeHost.hidden = mode === 'text'
  }

  function renderMarkers() {
    const markers: TextMarker[] = parsed.errors.map((e) => ({ from: e.from, to: e.to, message: e.message, severity: 'error' }))
    if (!parsed.errors.length) {
      // A suspicious key: underline the key itself
      lints.forEach((lint, i) => markers.push({ from: lint.from, to: lint.to, message: problems[i].message, severity: 'warning' }))
      for (const problem of problems.slice(lints.length)) {
        const range = rangeAt(parsed.doc, problem.path)
        markers.push({ from: range?.from ?? 0, to: range?.to ?? 0, message: problem.message, severity: problem.severity ?? 'error' })
      }
    }
    textMode.setMarkers(markers)
  }

  function renderTree() {
    if (mode === 'text' || parsed.errors.length) return
    // A problem on a missing entry shows on its deepest existing parent, naming what is missing
    const byPath = new Map<string, TreeProblem[]>()
    for (const problem of problems) {
      let depth = problem.path.length
      while (depth > 0 && !locate(parsed.doc, problem.path.slice(0, depth))) depth--
      const key = pathKey(problem.path.slice(0, depth))
      const missing = problem.path.slice(depth)
      const message = missing.length ? `${pathKey(missing)}: ${problem.message}` : problem.message
      byPath.set(key, [...(byPath.get(key) ?? []), { message, severity: problem.severity ?? 'error' }])
    }
    treeMode.render({
      variant: mode,
      parsed,
      schema: p.schema,
      problems: byPath,
      readOnly: !!p.readOnly,
      labels,
      translate: p.translate ?? ((s) => s),
      edit: (change) => {
        let next: string
        try {
          next = change(text)
        } catch (err) {
          if (err instanceof YamlEditError) return (p.onError ?? console.warn)(err)
          throw err
        }
        if (next === text) return
        text = next
        textMode.setText(next)
        refresh(true)
      },
    })
  }

  /** Show another view and tell (no checks: see setMode). */
  function switchTo(next: YamlEditorMode) {
    if (next === mode) return
    mode = next
    renderChrome()
    renderTree()
    p.onChangeMode?.(mode)
  }

  /** After the text changed: parse, check, redraw, tell. */
  function refresh(notify: boolean) {
    parsed = parseYaml(text)
    problems = computeProblems()
    // A text that does not parse shows as text, the only way to fix it; once it
    // parses, back to an offered view if the text view is not one
    if (parsed.errors.length && mode !== 'text') switchTo('text')
    else if (!parsed.errors.length && !allowed().includes(mode)) switchTo(defaultMode())
    renderChrome()
    renderMarkers()
    renderTree()
    if (notify) p.onChange?.(text, currentStatus())
  }

  const api: YamlEditor = {
    get: () => text,
    set(content) {
      text = content
      textMode.setText(content, true)
      refresh(false)
    },
    update(content) {
      text = content
      textMode.setText(content)
      refresh(false)
    },
    updateProps(next) {
      const before = p
      p = { ...p, ...next }
      labels = { ...defaultLabels, ...p.labels }
      if (next.readOnly !== undefined && next.readOnly !== before.readOnly) textMode.setReadOnly(!!p.readOnly)
      if (next.content !== undefined && next.content !== text) return api.update(next.content)
      if (next.mode && next.mode !== mode) api.setMode(next.mode)
      // The current view no longer offered: the default one (refresh does it, or keeps the text while it does not parse)
      refresh(false)
    },
    getMode: () => mode,
    setMode(next) {
      if (next === mode) return true
      if (!allowed().includes(next)) return false
      if (next !== 'text' && parsed.errors.length) {
        status.textContent = labels.syntaxBlocked
        textMode.reveal(parsed.errors[0].from)
        return false
      }
      switchTo(next)
      return true
    },
    getModes: () => [...allowed()],
    canSetMode: (next) => allowed().includes(next) && (next === 'text' || !parsed.errors.length),
    status: currentStatus,
    revealPath(path) {
      if (mode === 'text' || parsed.errors.length) {
        const range = rangeAt(parsed.doc, path)
        if (range) textMode.reveal(range.from)
        return
      }
      const row = treeHost.querySelector<HTMLElement>(`[data-path="${cssPath(pathKey(path))}"]`)
      row?.scrollIntoView({ block: 'nearest' })
      row?.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
    },
    focus() {
      if (mode === 'text') textMode.focus()
      else treeHost.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
    },
    destroy() {
      textMode.destroy()
      treeMode.destroy()
      root.remove()
    },
  }

  refresh(false)
  return api
}
