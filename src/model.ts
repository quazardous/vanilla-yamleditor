/**
 * The YAML model: parse a text, and edit it at a path without touching the
 * rest of it.
 *
 * Every edit is a text patch on the span of the node it changes: comments,
 * blank lines, key order, quoting and indentation elsewhere stay byte for
 * byte. (Re-stringifying the `yaml` Document would normalise them: inline
 * comment spacing, flow padding, sequence indentation.) Only a new or
 * replaced value is generated, in the style detected from the document.
 */
import {
  Document,
  LineCounter,
  Scalar,
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  type Node,
  type Pair,
  type YAMLMap,
  type YAMLSeq,
} from 'yaml'

export type YamlPath = (string | number)[]

export interface YamlSyntaxError {
  message: string
  /** Offsets in the text. */
  from: number
  to: number
  /** 1-based. */
  line: number
  col: number
}

export interface ParsedYaml {
  text: string
  doc: Document.Parsed
  errors: YamlSyntaxError[]
  /** The plain value; undefined while the text has syntax errors. */
  value: unknown
}

export function parseYaml(text: string): ParsedYaml {
  const lineCounter = new LineCounter()
  const doc = parseDocument(text, { lineCounter, prettyErrors: false })
  const errors = doc.errors.map((e) => {
    const [from, to] = e.pos
    const { line, col } = lineCounter.linePos(from)
    return { message: e.message.split('\n')[0], from, to: Math.max(to, from), line, col }
  })
  let value: unknown
  if (!errors.length) {
    try {
      value = doc.toJS({ maxAliasCount: 1000 })
    } catch (err) {
      errors.push({ message: (err as Error).message, from: 0, to: 0, line: 1, col: 1 })
    }
  }
  return { text, doc, errors, value }
}

/** A path from outside: an array, or a string such as `a.b[0].c` or `/a/b/0`. */
export function toPath(path: unknown): YamlPath {
  if (Array.isArray(path)) return path.map((s) => (typeof s === 'number' ? s : /^\d+$/.test(String(s)) ? Number(s) : String(s)))
  if (typeof path !== 'string' || !path) return []
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split(/[./]/)
    .filter(Boolean)
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s))
}

/** A path key inside a `[data-path="…"]` selector (CSS.escape where the platform has it). */
export function cssPath(key: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(key) : key.replace(/["\\]/g, '\\$&')
}

/** A path as a stable string: `filters.paris.tags[0]`. */
export function pathKey(path: YamlPath): string {
  return path.reduce<string>((acc, seg) => (typeof seg === 'number' ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : String(seg)), '')
}

export function keyOf(node: unknown): unknown {
  return isScalar(node) ? node.value : node
}

interface Located {
  /** The node at the path; null for a key with no value (`key:`). */
  node: Node | null
  /** The pair holding it, when its parent is a map. */
  pair?: Pair
  parent?: YAMLMap | YAMLSeq
  index?: number
}

/** The node at a path, or null when the path does not exist. Aliases are not followed. */
export function locate(doc: Document, path: YamlPath): Located | null {
  let cur: Located = { node: (doc.contents as Node | null) ?? null }
  for (const seg of path) {
    const node = cur.node
    if (isMap(node)) {
      const index = node.items.findIndex((p) => String(keyOf(p.key)) === String(seg))
      if (index < 0) return null
      const pair = node.items[index]
      cur = { node: (pair.value as Node | null) ?? null, pair, parent: node, index }
    } else if (isSeq(node)) {
      const index = typeof seg === 'number' ? seg : Number(seg)
      if (!Number.isInteger(index) || index < 0 || index >= node.items.length) return null
      cur = { node: (node.items[index] as Node | null) ?? null, parent: node, index }
    } else {
      return null
    }
  }
  return cur
}

/** The text span of the node at a path (its key line for a map entry), for markers. */
export function rangeAt(doc: Document, path: YamlPath): { from: number; to: number } | null {
  // The deepest existing node: a problem on a missing key points at its parent
  for (let depth = path.length; depth >= 0; depth--) {
    const loc = locate(doc, path.slice(0, depth))
    if (!loc) continue
    const start = isNodeWithRange(loc.pair?.key) ? loc.pair!.key.range![0] : loc.node?.range?.[0]
    const end = loc.node?.range?.[1] ?? (isNodeWithRange(loc.pair?.key) ? loc.pair!.key.range![1] : undefined)
    if (start !== undefined && end !== undefined) return { from: start, to: Math.max(end, start) }
  }
  return null
}

function isNodeWithRange(n: unknown): n is Node & { range: [number, number, number] } {
  return !!n && typeof n === 'object' && Array.isArray((n as Node).range)
}

// -----------------------------------------------------------------------------
// Style detection and generated text
// -----------------------------------------------------------------------------

interface Style {
  indent: number
  indentSeq: boolean
}

const lineStart = (text: string, pos: number) => text.lastIndexOf('\n', pos - 1) + 1
const column = (text: string, pos: number) => pos - lineStart(text, pos)
/** The offset just past the end of the line holding pos (after its newline). */
function lineEndIncl(text: string, pos: number): number {
  const nl = text.indexOf('\n', pos)
  return nl < 0 ? text.length : nl + 1
}

/** Indent step and sequence indentation, read from the document; yaml's defaults otherwise. */
export function detectStyle(text: string, doc: Document): Style {
  let indent = 0
  let indentSeq: boolean | null = null
  const walk = (node: unknown) => {
    if (indent && indentSeq !== null) return
    if (isMap(node) && !node.flow) {
      for (const pair of node.items) {
        const key = pair.key as Node | null
        const value = pair.value as Node | null
        if (key?.range && value?.range && !(value as YAMLMap).flow) {
          if (isMap(value) && value.items[0] && !indent) {
            const child = value.items[0].key as Node | null
            if (child?.range) indent = column(text, child.range[0]) - column(text, key.range[0])
          }
          if (isSeq(value) && indentSeq === null) {
            const dash = text.lastIndexOf('-', value.range[0])
            indentSeq = column(text, dash) > column(text, key.range[0])
          }
        }
        walk(value)
      }
    } else if (isSeq(node) && !node.flow) {
      node.items.forEach(walk)
    }
  }
  walk(doc.contents)
  return { indent: indent > 0 ? indent : 2, indentSeq: indentSeq ?? true }
}

function stringifyOptions(style: Style) {
  return { lineWidth: 0, minContentWidth: 0, indent: style.indent, indentSeq: style.indentSeq, flowCollectionPadding: false }
}

/** A scalar as it would be written, keeping a quoted style when the value allows it. */
export function scalarText(value: unknown, type?: Scalar['type']): string {
  if (typeof value === 'string' && !value.includes('\n')) {
    if (type === Scalar.QUOTE_DOUBLE) return JSON.stringify(value)
    if (type === Scalar.QUOTE_SINGLE) return `'${value.replace(/'/g, "''")}'`
  }
  if (typeof value === 'string' && value.includes('\n')) return JSON.stringify(value)
  return new Document(value).toString({ lineWidth: 0 }).replace(/\n$/, '')
}

/** What follows `key:` for a value: ` scalar`, or a newline and indented lines. */
function mapValueText(value: unknown, keyCol: number, style: Style, flow = false): string {
  const doc = new Document({ k: value })
  const node = doc.get('k', true)
  if (flow && (isMap(node) || isSeq(node))) node.flow = true
  const out = doc.toString(stringifyOptions(style)).replace(/\n$/, '').slice(2)
  return reindent(out, keyCol)
}

/** What follows `- ` for a sequence item. */
function seqValueText(value: unknown, dashCol: number, style: Style): string {
  const out = new Document([value]).toString({ ...stringifyOptions(style), indentSeq: false }).replace(/\n$/, '').slice(2)
  return reindent(out, dashCol + 2)
}

/** Shift the continuation lines of generated text to a column. */
function reindent(out: string, col: number): string {
  return out
    .split('\n')
    .map((l, i) => (i === 0 || !l ? l : ' '.repeat(col) + l))
    .join('\n')
}

// -----------------------------------------------------------------------------
// Edits: each takes a text and returns the new text
// -----------------------------------------------------------------------------

export class YamlEditError extends Error {}

function parsedOrThrow(text: string): ParsedYaml {
  const parsed = parseYaml(text)
  if (parsed.errors.length) throw new YamlEditError(`The YAML has syntax errors: ${parsed.errors[0].message}`)
  return parsed
}

const isPlainCollection = (v: unknown) => v !== null && typeof v === 'object'

/** Set the value at a path; missing keys and parents are created. */
export function setValue(text: string, path: YamlPath, value: unknown): string {
  const { doc } = parsedOrThrow(text)
  const loc = locate(doc, path)
  if (!loc) {
    if (!path.length) return replaceRoot(text, doc, value)
    const parentPath = path.slice(0, -1)
    const last = path[path.length - 1]
    const parent = locate(doc, parentPath)
    if (!parent || (parent.node !== null && !isMap(parent.node) && !isSeq(parent.node))) {
      return setValue(text, parentPath, typeof last === 'number' ? [value] : { [last]: value })
    }
    return isSeq(parent.node) ? addItem(text, parentPath, value) : addKey(text, parentPath, String(last), value)
  }
  const node = loc.node
  if (
    isScalar(node) &&
    node.range &&
    !isPlainCollection(value) &&
    node.type !== Scalar.BLOCK_LITERAL &&
    node.type !== Scalar.BLOCK_FOLDED &&
    !(typeof value === 'string' && value.includes('\n'))
  ) {
    // Keep a quoted style only for a string staying a string
    const type = typeof value === 'string' && typeof node.value === 'string' ? node.type : undefined
    return text.slice(0, node.range[0]) + scalarText(value, type) + text.slice(node.range[1])
  }
  return replaceValue(text, doc, path, loc, value)
}

function replaceRoot(text: string, doc: Document, value: unknown): string {
  const style = detectStyle(text, doc)
  const out = new Document(value).toString(stringifyOptions(style))
  const node = doc.contents as Node | null
  if (!node?.range) return out
  return text.slice(0, node.range[0]) + out.replace(/\n$/, '') + text.slice(node.range[1])
}

function replaceValue(text: string, doc: Document, path: YamlPath, loc: Located, value: unknown): string {
  const style = detectStyle(text, doc)
  const { parent, pair, node } = loc
  if (!parent) return replaceRoot(text, doc, value)
  if (parent.flow) {
    // A flow collection is regenerated whole, still in flow style
    const parentValue = (parent as YAMLMap).toJSON()
    if (Array.isArray(parentValue)) parentValue[loc.index!] = value
    else (parentValue as Record<string, unknown>)[String(path[path.length - 1])] = value
    return replaceFlow(text, doc, path.slice(0, -1), parentValue, style)
  }
  if (pair) {
    const key = pair.key as Node
    const colon = text.indexOf(':', key.range![1])
    const end = node?.range ? node.range[1] : colon + 1
    return text.slice(0, colon + 1) + mapValueText(value, column(text, key.range![0]), style) + text.slice(end)
  }
  // A block sequence item
  const start = node!.range![0]
  const dash = text.lastIndexOf('-', start - 1)
  return text.slice(0, dash + 2) + seqValueText(value, column(text, dash), style) + text.slice(node!.range![1])
}

function replaceFlow(text: string, doc: Document, path: YamlPath, value: unknown, style: Style): string {
  const loc = locate(doc, path)!
  const node = loc.node!
  const generated = mapValueText(value, 0, style, true).trimStart()
  return text.slice(0, node.range![0]) + generated + text.slice(node.range![1])
}

/** The span of a block map entry or sequence item: its comment lines above, through its last line. */
function entrySpan(text: string, loc: Located): [number, number] {
  const head = loc.pair ? (loc.pair.key as Node) : null
  const startPos = head?.range ? head.range[0] : text.lastIndexOf('-', loc.node!.range![0] - 1)
  const endPos = loc.node?.range ? loc.node.range[1] : head!.range![1]
  let start = lineStart(text, startPos)
  // Comment lines right above, at the same column, belong to the entry
  const col = column(text, startPos)
  while (start > 0) {
    const prev = lineStart(text, start - 1)
    const line = text.slice(prev, start - 1)
    if (line.trim().startsWith('#') && line.length - line.trimStart().length === col) start = prev
    else break
  }
  // Up to the end of the value's last line (a trailing comment included)
  return [start, lineEndIncl(text, Math.max(endPos - 1, startPos))]
}

/** Remove the entry at a path. The last entry of a collection leaves it empty: `{}` / `[]`. */
export function deleteAt(text: string, path: YamlPath): string {
  if (!path.length) return ''
  const { doc } = parsedOrThrow(text)
  const loc = locate(doc, path)
  if (!loc || !loc.parent) return text
  const style = detectStyle(text, doc)
  const parentPath = path.slice(0, -1)
  if (loc.parent.flow || loc.parent.items.length === 1) {
    const parentValue = (loc.parent as YAMLMap).toJSON()
    if (Array.isArray(parentValue)) parentValue.splice(loc.index!, 1)
    else delete (parentValue as Record<string, unknown>)[String(keyOf(loc.pair!.key))]
    if (loc.parent.flow) return replaceFlow(text, doc, parentPath, parentValue, style)
    const parentLoc = locate(doc, parentPath)!
    return replaceValue(text, doc, parentPath, parentLoc, parentValue)
  }
  const [start, end] = entrySpan(text, loc)
  return text.slice(0, start) + text.slice(end)
}

/** Add a key to the map at a path (set it when it exists). */
export function addKey(text: string, mapPath: YamlPath, key: string, value: unknown): string {
  const { doc } = parsedOrThrow(text)
  const loc = locate(doc, mapPath)
  if (!loc) return setValue(text, mapPath, { [key]: value })
  const node = loc.node
  if (isMap(node) && node.items.some((p) => String(keyOf(p.key)) === key)) return setValue(text, [...mapPath, key], value)
  const style = detectStyle(text, doc)
  if (!isMap(node) || node.flow || !node.items.length) {
    const current = isMap(node) ? (node.toJSON() as Record<string, unknown>) : {}
    const next = { ...current, [key]: value }
    if (isMap(node) && node.flow && mapPath.length) return replaceFlow(text, doc, mapPath, next, style)
    return mapPath.length ? replaceValue(text, doc, mapPath, loc, next) : replaceRoot(text, doc, next)
  }
  const last = locate(doc, [...mapPath, String(keyOf(node.items[node.items.length - 1].key))])!
  const [, end] = entrySpan(text, last)
  const col = column(text, (node.items[0].key as Node).range![0])
  const prefix = end > 0 && text[end - 1] !== '\n' ? '\n' : ''
  const line = ' '.repeat(col) + scalarText(key) + ':' + mapValueText(value, col, style) + '\n'
  return text.slice(0, end) + prefix + line + text.slice(end)
}

/** Append an item to the sequence at a path. */
export function addItem(text: string, seqPath: YamlPath, value: unknown): string {
  const { doc } = parsedOrThrow(text)
  const loc = locate(doc, seqPath)
  if (!loc) return setValue(text, seqPath, [value])
  const node = loc.node
  const style = detectStyle(text, doc)
  if (!isSeq(node) || node.flow || !node.items.length) {
    const next = [...(isSeq(node) ? (node.toJSON() as unknown[]) : []), value]
    if (isSeq(node) && node.flow && seqPath.length) return replaceFlow(text, doc, seqPath, next, style)
    return seqPath.length ? replaceValue(text, doc, seqPath, loc, next) : replaceRoot(text, doc, next)
  }
  const last = locate(doc, [...seqPath, node.items.length - 1])!
  const [, end] = entrySpan(text, last)
  const first = node.items[0] as Node
  const dashCol = column(text, text.lastIndexOf('-', first.range![0] - 1))
  const prefix = end > 0 && text[end - 1] !== '\n' ? '\n' : ''
  const line = ' '.repeat(dashCol) + '- ' + seqValueText(value, dashCol, style) + '\n'
  return text.slice(0, end) + prefix + line + text.slice(end)
}

/** Rename a key of the map at a path, in place. */
export function renameKey(text: string, mapPath: YamlPath, from: string, to: string): string {
  if (from === to) return text
  const { doc } = parsedOrThrow(text)
  const loc = locate(doc, [...mapPath, from])
  if (!loc?.pair) return text
  if (isMap(loc.parent) && loc.parent.items.some((p) => String(keyOf(p.key)) === to)) {
    throw new YamlEditError(`The key "${to}" already exists`)
  }
  const key = loc.pair.key as Scalar
  return text.slice(0, key.range![0]) + scalarText(to, key.type) + text.slice(key.range![1])
}

const isBlockCollection = (node: unknown) => (isMap(node) || isSeq(node)) && !node.flow

/** The plain value at a path (aliases resolved). */
export function valueAt(value: unknown, path: YamlPath): unknown {
  let cur = value
  for (const seg of path) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string | number, unknown>)[seg]
  }
  return cur
}

/** Whether the node at a path is an alias (`*name`): shown, not edited. */
export function isAliasAt(doc: Document, path: YamlPath): boolean {
  const loc = locate(doc, path)
  return !!loc && isAlias(loc.node)
}

/** The comment written with the entry at a path: the lines above it and its end-of-line comment. */
export function commentAt(doc: Document, path: YamlPath): string | null {
  const loc = locate(doc, path)
  if (!loc) return null
  const parts = [
    // Above the first entry of a block collection, yaml keeps it on the collection
    loc.index === 0 && loc.parent && !loc.parent.flow && path.length > 1 ? loc.parent.commentBefore : undefined,
    (loc.pair?.key as Node | undefined)?.commentBefore,
    // On a block collection, the comment before is above its first entry: that entry's
    isBlockCollection(loc.node) ? undefined : loc.node?.commentBefore,
    isBlockCollection(loc.node) ? undefined : loc.node?.comment,
  ].filter((c): c is string => !!c && !!c.trim())
  return parts.length ? parts.map((c) => c.trim()).join('\n') : null
}
