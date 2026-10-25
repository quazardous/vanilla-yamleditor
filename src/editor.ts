/**
 * createYamlEditor: the two modes around one text.
 *
 * The text is the single source of truth. The text mode edits it directly;
 * the tree mode edits it through model.ts patches. Switching to the tree is
 * refused while the text has syntax errors, which then show at their line.
 */
import { YamlEditError, cssPath, locate, parseYaml, pathKey, rangeAt, toPath, type ParsedYaml, type YamlPath, type YamlSyntaxError } from './model'
import { defaultSchemaMessages, validate, type JsonSchema, type SchemaMessages, type YamlProblem, type YamlProblemInput } from './schema'
import { TextMode, type TextMarker } from './text-mode'
import { TreeMode, type TreeLabels } from './tree-mode'

export type YamlEditorMode = 'text' | 'tree'

export interface YamlEditorLabels extends TreeLabels {
  text: string
  tree: string
  modes: string
  syntaxBlocked: string
  syntaxErrors: (n: number) => string
}

export const defaultLabels: YamlEditorLabels = {
  text: 'Text',
  tree: 'Tree',
  modes: 'View',
  syntaxBlocked: 'Fix the syntax errors before switching to the tree view',
  syntaxErrors: (n) => (n === 1 ? '1 syntax error' : `${n} syntax errors`),
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
  /** Default: 'tree' when the text parses, else 'text'. */
  mode?: YamlEditorMode
  /** A JSON Schema (subset, see schema.ts): the tree's fields and the built-in validation. */
  schema?: JsonSchema
  /** Extra checks, run on every valid change. */
  validator?: (value: unknown, parsed: ParsedYaml) => YamlProblemInput[]
  /** Problems found elsewhere (a server check): shown like the others. */
  problems?: YamlProblemInput[]
  readOnly?: boolean
  /** Show the mode switch. Default true. */
  mainMenuBar?: boolean
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
  /** False when refused (tree mode while the text has syntax errors). */
  setMode(mode: YamlEditorMode): boolean
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
  let mode: YamlEditorMode = p.mode ?? (parsed.errors.length ? 'text' : 'tree')
  if (mode === 'tree' && parsed.errors.length) mode = 'text'

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

  const tabs: Record<YamlEditorMode, HTMLButtonElement> = {
    text: document.createElement('button'),
    tree: document.createElement('button'),
  }
  for (const m of ['text', 'tree'] as const) {
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
    if (parsed.errors.length) return outside(p.problems)
    const out: YamlProblem[] = []
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
    modes.setAttribute('aria-label', labels.modes)
    for (const m of ['text', 'tree'] as const) {
      tabs[m].textContent = labels[m]
      tabs[m].setAttribute('aria-selected', String(mode === m))
      tabs[m].classList.toggle('vye-tab-active', mode === m)
    }
    const blocked = parsed.errors.length > 0
    tabs.tree.setAttribute('aria-disabled', String(blocked))
    tabs.tree.title = blocked ? labels.syntaxBlocked : ''
    status.textContent = blocked ? labels.syntaxErrors(parsed.errors.length) : ''
    status.classList.toggle('vye-status-error', blocked)
    textHost.hidden = mode !== 'text'
    treeHost.hidden = mode !== 'tree'
  }

  function renderMarkers() {
    const markers: TextMarker[] = parsed.errors.map((e) => ({ from: e.from, to: e.to, message: e.message, severity: 'error' }))
    if (!parsed.errors.length) {
      for (const problem of problems) {
        const range = rangeAt(parsed.doc, problem.path)
        markers.push({ from: range?.from ?? 0, to: range?.to ?? 0, message: problem.message, severity: problem.severity ?? 'error' })
      }
    }
    textMode.setMarkers(markers)
  }

  function renderTree() {
    if (mode !== 'tree' || parsed.errors.length) return
    // A problem on a missing entry shows on its deepest existing parent, naming what is missing
    const byPath = new Map<string, string[]>()
    for (const problem of problems) {
      let depth = problem.path.length
      while (depth > 0 && !locate(parsed.doc, problem.path.slice(0, depth))) depth--
      const key = pathKey(problem.path.slice(0, depth))
      const missing = problem.path.slice(depth)
      const message = missing.length ? `${pathKey(missing)}: ${problem.message}` : problem.message
      byPath.set(key, [...(byPath.get(key) ?? []), message])
    }
    treeMode.render({
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

  /** After the text changed: parse, check, redraw, tell. */
  function refresh(notify: boolean) {
    parsed = parseYaml(text)
    problems = computeProblems()
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
      refresh(false)
    },
    getMode: () => mode,
    setMode(next) {
      if (next === mode) return true
      if (next === 'tree' && parsed.errors.length) {
        status.textContent = labels.syntaxBlocked
        textMode.reveal(parsed.errors[0].from)
        return false
      }
      mode = next
      renderChrome()
      renderTree()
      p.onChangeMode?.(mode)
      return true
    },
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
