/**
 * Views of a YamlDocument, to mount in any element: the text, the tree and
 * the form. Each one subscribes to the document and edits it, so every view
 * of the same document stays in step (see docs/linked-views.md).
 */
import type { YamlDocument } from './document'
import { cssPath, locate, pathKey, rangeAt, type YamlPath } from './model'
import { TextMode, type TextMarker } from './text-mode'
import { TreeMode, type TreeLabels, type TreeProblem, type TreeVariant } from './tree-mode'

export interface YamlViewLabels extends TreeLabels {
  /** The tree and the form, while the text does not parse. */
  unparsable: (syntaxErrors: number) => string
}

export const defaultViewLabels: YamlViewLabels = {
  addItem: 'Add item',
  addKey: 'Add',
  newKey: 'new key',
  remove: 'Remove',
  rename: 'Key name',
  empty: '(empty)',
  alias: 'An alias: edit it in the text view',
  count: (n) => (n === 1 ? '1 entry' : `${n} entries`),
  unparsable: (n) => `The document does not parse (${n === 1 ? '1 syntax error' : `${n} syntax errors`}): fix it in the text`,
}

export interface YamlViewOptions {
  readOnly?: boolean
  labels?: Partial<YamlViewLabels>
  /**
   * Draw the view in its own frame (`.vye`: border, theme variables). Default
   * true; createYamlEditor mounts its views without one, inside its own.
   */
  frame?: boolean
}

export interface YamlView {
  /** The element the view drew in `target`. */
  readonly element: HTMLElement
  /** Show the entry at a path: its line in the text, its field in the tree or the form. */
  revealPath(path: YamlPath): void
  focus(): void
  setReadOnly(readOnly: boolean): void
  setLabels(labels: Partial<YamlViewLabels>): void
  /** Stop following the document and remove the view; the document and its other views stay. */
  destroy(): void
}

export interface YamlTextView extends YamlView {
  /** Put the cursor at an offset of the text and bring it into view. */
  reveal(offset: number): void
}

export interface YamlTreeView extends YamlView {
  /** tree or form: the same entries in two looks. */
  setVariant(variant: TreeVariant): void
  /** Hidden by its host: no drawing until shown again. Default true. */
  setActive(active: boolean): void
}

function frameFor(target: HTMLElement, options: YamlViewOptions, cls: string): { element: HTMLElement; host: HTMLElement } {
  const host = document.createElement('div')
  host.className = cls
  if (options.frame === false) {
    target.appendChild(host)
    return { element: host, host }
  }
  const element = document.createElement('div')
  element.className = 'vye vye-view'
  element.appendChild(host)
  target.appendChild(element)
  return { element, host }
}

/** The text view: CodeMirror on the document's text, its errors and problems marked at their place. */
export function mountTextView(doc: YamlDocument, target: HTMLElement, options: YamlViewOptions = {}): YamlTextView {
  const { element, host } = frameFor(target, options, 'vye-text')
  let view: YamlTextView
  const text = new TextMode({ parent: host, text: doc.get(), readOnly: !!options.readOnly, onChange: (next) => doc.input(next, view) })

  function markers() {
    const parsed = doc.parsed()
    const { problems } = doc.status()
    const lints = doc.lints()
    const out: TextMarker[] = parsed.errors.map((e) => ({ from: e.from, to: e.to, message: e.message, severity: 'error' }))
    if (!parsed.errors.length) {
      // A suspicious key: underline the key itself
      lints.forEach((lint, i) => out.push({ from: lint.from, to: lint.to, message: problems[i].message, severity: 'warning' }))
      for (const problem of problems.slice(lints.length)) {
        const range = rangeAt(parsed.doc, problem.path)
        out.push({ from: range?.from ?? 0, to: range?.to ?? 0, message: problem.message, severity: problem.severity ?? 'error' })
      }
    }
    text.setMarkers(out)
  }

  const unsubscribe = doc.subscribe((change) => {
    if (change.source !== view) text.setText(doc.get(), change.kind === 'set')
    markers()
  })
  markers()

  view = {
    element,
    reveal: (offset) => text.reveal(offset),
    revealPath(path) {
      const range = rangeAt(doc.parsed().doc, path)
      if (range) text.reveal(range.from)
    },
    focus: () => text.focus(),
    setReadOnly: (readOnly) => text.setReadOnly(readOnly),
    setLabels: () => {},
    destroy() {
      unsubscribe()
      text.destroy()
      element.remove()
    },
  }
  return view
}

/** The tree or the form: the document's entries, edited through patches; a message while the text does not parse. */
export function mountTreeView(doc: YamlDocument, target: HTMLElement, options: YamlViewOptions & { variant?: TreeVariant } = {}): YamlTreeView {
  const { element, host } = frameFor(target, options, 'vye-tree-host')
  const tree = new TreeMode(host)
  const unparsable = document.createElement('div')
  unparsable.className = 'vye-unparsable'
  unparsable.setAttribute('role', 'status')
  host.appendChild(unparsable)
  let variant: TreeVariant = options.variant ?? 'tree'
  let readOnly = !!options.readOnly
  let labels: YamlViewLabels = { ...defaultViewLabels, ...options.labels }
  let active = true
  let view: YamlTreeView

  function render() {
    if (!active) return
    const parsed = doc.parsed()
    unparsable.hidden = !parsed.errors.length
    tree.root.hidden = parsed.errors.length > 0
    if (parsed.errors.length) {
      unparsable.textContent = labels.unparsable(parsed.errors.length)
      return
    }
    // A problem on a missing entry shows on its deepest existing parent, naming what is missing
    const byPath = new Map<string, TreeProblem[]>()
    for (const problem of doc.status().problems) {
      let depth = problem.path.length
      while (depth > 0 && !locate(parsed.doc, problem.path.slice(0, depth))) depth--
      const key = pathKey(problem.path.slice(0, depth))
      const missing = problem.path.slice(depth)
      const message = missing.length ? `${pathKey(missing)}: ${problem.message}` : problem.message
      byPath.set(key, [...(byPath.get(key) ?? []), { message, severity: problem.severity ?? 'error' }])
    }
    const { schema, translate } = doc.props()
    tree.render({
      variant,
      parsed,
      schema,
      problems: byPath,
      readOnly,
      labels,
      translate: translate ?? ((s) => s),
      edit: (change) => void doc.edit(change, view),
    })
  }

  const unsubscribe = doc.subscribe(render)
  render()

  view = {
    element,
    revealPath(path) {
      const row = host.querySelector<HTMLElement>(`[data-path="${cssPath(pathKey(path))}"]`)
      row?.scrollIntoView({ block: 'nearest' })
      row?.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
    },
    focus: () => host.querySelector<HTMLElement>('input, select, textarea, button')?.focus(),
    setReadOnly(next) {
      readOnly = next
      render()
    },
    setLabels(next) {
      labels = { ...defaultViewLabels, ...next }
      render()
    },
    setVariant(next) {
      if (next === variant) return
      variant = next
      render()
    },
    setActive(next) {
      if (next === active) return
      active = next
      render()
    },
    destroy() {
      unsubscribe()
      tree.destroy()
      element.remove()
    },
  }
  return view
}

/** The form view: mountTreeView in its form look (labels, help, framed inputs). */
export function mountFormView(doc: YamlDocument, target: HTMLElement, options: YamlViewOptions = {}): YamlTreeView {
  return mountTreeView(doc, target, { ...options, variant: 'form' })
}
