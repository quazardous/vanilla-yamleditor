/**
 * createYamlDiff: two YAML texts compared, side by side or unified.
 *
 * A line diff (@codemirror/merge), which is what a reviewer reads: the
 * editor's edits only touch the lines they change. On top of it, the keys
 * that changed, from the two parsed documents: comments and layout do not
 * count there. Read only.
 */
import { EditorState, Text, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { syntaxHighlighting } from '@codemirror/language'
import { yaml } from '@codemirror/lang-yaml'
import { classHighlighter } from '@lezer/highlight'
import { Chunk, MergeView, goToNextChunk, goToPreviousChunk, unifiedMergeView } from '@codemirror/merge'
import { changedPaths, locate, parseYaml, pathKey, rangeAt, type YamlPath } from './model'

export type YamlDiffView = 'split' | 'unified'

export interface YamlDiffLabels {
  split: string
  unified: string
  views: string
  previous: string
  next: string
  original: string
  modified: string
  identical: string
  /** Lines added and removed. */
  lines: (added: number, removed: number) => string
  keys: (n: number) => string
  /** A side does not parse: the keys are not compared. */
  unparsable: string
}

export const defaultDiffLabels: YamlDiffLabels = {
  split: 'Side by side',
  unified: 'Unified',
  views: 'Diff view',
  previous: 'Previous change',
  next: 'Next change',
  original: 'Before',
  modified: 'After',
  identical: 'No difference',
  lines: (added, removed) => `+${added} −${removed}`,
  keys: (n) => (n === 1 ? '1 key changed' : `${n} keys changed`),
  unparsable: 'Keys not compared: a side does not parse',
}

export interface YamlDiffProps {
  /** The text before. */
  original?: string
  /** The text after. */
  modified?: string
  /** Default 'split'. */
  view?: YamlDiffView
  /** Fold long unchanged stretches. Default true. */
  collapseUnchanged?: boolean
  /** Show the bar: views, navigation, summary, changed keys. Default true. */
  mainMenuBar?: boolean
  labels?: Partial<YamlDiffLabels>
  onChangeView?: (view: YamlDiffView) => void
}

export interface YamlDiffSummary {
  identical: boolean
  /** Lines added and removed, and the number of changed stretches. */
  added: number
  removed: number
  changes: number
  /** The keys that changed; null when a side does not parse. */
  paths: YamlPath[] | null
}

export interface YamlDiff {
  /** New texts to compare. */
  update(next: { original?: string; modified?: string }): void
  updateProps(props: Partial<YamlDiffProps>): void
  summary(): YamlDiffSummary
  /** Move to the next or previous change. */
  next(): void
  previous(): void
  /** Show a key: in the text after, else (a removed key) before. */
  revealPath(path: YamlPath): void
  destroy(): void
}

/** How many lines a chunk covers on one side. */
function lineCount(doc: Text, from: number, to: number, end: number): number {
  if (to <= from) return 0
  return doc.lineAt(end).number - doc.lineAt(from).number + 1
}

const readOnly: Extension = [EditorState.readOnly.of(true), EditorView.editable.of(false)]
const yamlView = (): Extension[] => [lineNumbers(), yaml(), syntaxHighlighting(classHighlighter), EditorView.lineWrapping, readOnly]

export function createYamlDiff({ target, props = {} }: { target: HTMLElement; props?: YamlDiffProps }): YamlDiff {
  let p: YamlDiffProps = { ...props }
  let labels: YamlDiffLabels = { ...defaultDiffLabels, ...p.labels }
  let original = p.original ?? ''
  let modified = p.modified ?? ''
  let view: YamlDiffView = p.view ?? 'split'
  let summary: YamlDiffSummary

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
    const node = document.createElement(tag)
    node.className = cls
    if (text !== undefined) node.textContent = text
    return node
  }
  const root = el('div', 'vye vye-diff')
  const menu = el('div', 'vye-menu')
  menu.setAttribute('role', 'toolbar')
  const views = el('div', 'vye-modes')
  views.setAttribute('role', 'tablist')
  const tabs = {} as Record<YamlDiffView, HTMLButtonElement>
  for (const v of ['split', 'unified'] as const) {
    const tab = (tabs[v] = el('button', `vye-tab vye-tab-${v}`))
    tab.type = 'button'
    tab.setAttribute('role', 'tab')
    tab.addEventListener('click', () => setView(v))
    views.appendChild(tab)
  }
  const nav = (dir: 'previous' | 'next', glyph: string) => {
    const b = el('button', `vye-diff-nav vye-diff-${dir}`, glyph)
    b.type = 'button'
    b.addEventListener('click', () => api[dir]())
    return b
  }
  const prev = nav('previous', '↑')
  const next = nav('next', '↓')
  const status = el('span', 'vye-status')
  status.setAttribute('role', 'status')
  menu.append(views, prev, next, status)
  const paths = el('div', 'vye-diff-paths')
  const heads = el('div', 'vye-diff-heads')
  const before = el('span', 'vye-diff-head')
  const after = el('span', 'vye-diff-head')
  heads.append(before, after)
  const host = el('div', 'vye-diff-host')
  root.append(menu, paths, heads, host)
  target.appendChild(root)

  let merge: MergeView | null = null
  let unified: EditorView | null = null

  /** The editor that holds the text after (where navigation happens). */
  const afterView = () => merge?.b ?? unified

  function compute(): YamlDiffSummary {
    const a = Text.of(original.split(/\r?\n/))
    const b = Text.of(modified.split(/\r?\n/))
    const chunks = Chunk.build(a, b, { scanLimit: 500 })
    const pa = parseYaml(original)
    const pb = parseYaml(modified)
    return {
      identical: original === modified,
      added: chunks.reduce((n, c) => n + lineCount(b, c.fromB, c.toB, c.endB), 0),
      removed: chunks.reduce((n, c) => n + lineCount(a, c.fromA, c.toA, c.endA), 0),
      changes: chunks.length,
      paths: pa.errors.length || pb.errors.length ? null : changedPaths(pa.value, pb.value),
    }
  }

  function build() {
    merge?.destroy()
    unified?.destroy()
    merge = unified = null
    host.replaceChildren()
    const collapse = p.collapseUnchanged === false ? undefined : { margin: 3, minSize: 4 }
    if (view === 'split') {
      merge = new MergeView({ a: { doc: original, extensions: yamlView() }, b: { doc: modified, extensions: yamlView() }, parent: host, gutter: true, collapseUnchanged: collapse })
    } else {
      unified = new EditorView({
        parent: host,
        state: EditorState.create({ doc: modified, extensions: [...yamlView(), unifiedMergeView({ original, gutter: true, mergeControls: false, collapseUnchanged: collapse })] }),
      })
    }
  }

  function renderChrome() {
    root.dataset.view = view
    menu.hidden = paths.hidden = p.mainMenuBar === false
    views.setAttribute('aria-label', labels.views)
    for (const v of ['split', 'unified'] as const) {
      tabs[v].textContent = labels[v]
      tabs[v].setAttribute('aria-selected', String(view === v))
      tabs[v].classList.toggle('vye-tab-active', view === v)
    }
    prev.title = labels.previous
    prev.setAttribute('aria-label', labels.previous)
    next.title = labels.next
    next.setAttribute('aria-label', labels.next)
    prev.disabled = next.disabled = summary.changes === 0
    heads.hidden = view !== 'split'
    before.textContent = labels.original
    after.textContent = labels.modified

    const s = summary
    status.textContent = s.identical ? labels.identical : [labels.lines(s.added, s.removed), s.paths ? labels.keys(s.paths.length) : labels.unparsable].join(' · ')
    // The changed keys, each one a way to it
    paths.replaceChildren()
    for (const path of s.paths ?? []) {
      const chip = el('button', 'vye-diff-path', pathKey(path) || '(document)')
      chip.type = 'button'
      chip.addEventListener('click', () => api.revealPath(path))
      paths.appendChild(chip)
    }
    paths.hidden = p.mainMenuBar === false || !s.paths?.length
  }

  function refresh() {
    summary = compute()
    build()
    renderChrome()
  }

  function setView(v: YamlDiffView) {
    if (v === view) return
    view = v
    build()
    renderChrome()
    p.onChangeView?.(v)
  }

  const api: YamlDiff = {
    update(nextTexts) {
      if (nextTexts.original !== undefined) original = nextTexts.original
      if (nextTexts.modified !== undefined) modified = nextTexts.modified
      refresh()
    },
    updateProps(nextProps) {
      p = { ...p, ...nextProps }
      labels = { ...defaultDiffLabels, ...p.labels }
      if (nextProps.original !== undefined) original = nextProps.original
      if (nextProps.modified !== undefined) modified = nextProps.modified
      if (nextProps.view) view = nextProps.view
      refresh()
    },
    summary: () => summary,
    next() {
      const v = afterView()
      if (v) goToNextChunk({ state: v.state, dispatch: v.dispatch })
    },
    previous() {
      const v = afterView()
      if (v) goToPreviousChunk({ state: v.state, dispatch: v.dispatch })
    },
    revealPath(path) {
      // A removed key is only in the text before: shown there in the split view
      const pb = parseYaml(modified)
      const removed = !locate(pb.doc, path) && view === 'split'
      const v = removed ? merge!.a : afterView()
      const range = rangeAt((removed ? parseYaml(original) : pb).doc, path)
      if (!v || !range) return
      v.dispatch({ selection: { anchor: Math.min(range.from, v.state.doc.length) }, scrollIntoView: true })
    },
    destroy() {
      merge?.destroy()
      unified?.destroy()
      root.remove()
    },
  }

  refresh()
  return api
}
