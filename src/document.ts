/**
 * createYamlDocument: one YAML text, its reading and its problems, with no UI.
 *
 * The single source of truth that views subscribe to (views.ts): the text
 * view edits the whole text, the tree and form views edit it through
 * model.ts patches, and every change reaches every view. createYamlEditor is
 * a document, a bar and two views; a host can mount more views on the same
 * document, anywhere (see docs/linked-views.md).
 */
import { YamlEditError, lintYaml, parseYaml, toPath, type ParsedYaml, type YamlLint, type YamlSyntaxError } from './model'
import { defaultSchemaMessages, validate, type JsonSchema, type SchemaMessages, type YamlProblem, type YamlProblemInput } from './schema'

export interface YamlStatus {
  /** The plain value; undefined while there are syntax errors. */
  value: unknown
  syntaxErrors: YamlSyntaxError[]
  /** Warnings, schema, validator and external problems together. */
  problems: YamlProblem[]
}

/** The messages of the typo warnings (see lintYaml). */
export interface YamlDocumentLabels {
  /** `truc ::` is the key `truc :`. */
  colonKey: (key: string, suggestion: string) => string
  spacedKey: (key: string) => string
}

export const defaultDocumentLabels: YamlDocumentLabels = {
  colonKey: (key, suggestion) => `The key is "${key}": did you mean "${suggestion}:"?`,
  spacedKey: (key) => `The key "${key}" starts or ends with a space`,
}

export interface YamlDocumentProps {
  /** The YAML text. */
  content?: string
  /** A JSON Schema (subset, see schema.ts): the tree and form controls and the built-in validation. */
  schema?: JsonSchema
  /** Extra checks, run on every valid change. */
  validator?: (value: unknown, parsed: ParsedYaml) => YamlProblemInput[]
  /** Problems found elsewhere (a server check): shown like the others. */
  problems?: YamlProblemInput[]
  /** Warn on valid YAML that is likely a typo, such as `key ::`. Default true. */
  lint?: boolean
  labels?: Partial<YamlDocumentLabels>
  schemaMessages?: Partial<SchemaMessages>
  /** Turn schema titles and descriptions into the text shown (i18n tokens), in every view. */
  translate?: (text: string) => string
  /** After each edit by the user, in any view. */
  onChange?: (content: string, status: YamlStatus) => void
  /** A refused edit (e.g. renaming to an existing key). Default: console.warn. */
  onError?: (error: Error) => void
}

/**
 * What changed: `set` (a new document, undo starts over), `update` (the host
 * replaced the text as an edit), `input` / `edit` (a user, in a view: the
 * whole text, or a patch), `props`.
 */
export type YamlChangeKind = 'set' | 'update' | 'input' | 'edit' | 'props'

export interface YamlDocumentChange {
  kind: YamlChangeKind
  /** The view that made it, if any: a view skips its own echo. */
  source?: unknown
}

export interface YamlDocument {
  get(): string
  /** Replace the text: a new document, undo starts over. */
  set(content: string): void
  /** Replace the text as an edit: undo can bring the old one back. */
  update(content: string): void
  /** A user's edit of the whole text (the text view): tells onChange. */
  input(content: string, source?: unknown): void
  /** A user's patch (the tree and form views): tells onChange. False when it changed nothing or was refused. */
  edit(change: (text: string) => string, source?: unknown): boolean
  updateProps(props: Partial<YamlDocumentProps>): void
  props(): Readonly<YamlDocumentProps>
  parsed(): ParsedYaml
  status(): YamlStatus
  /** The typo warnings with their spans; they are the first `lints().length` problems. */
  lints(): YamlLint[]
  /** Called after every change; returns the way to stop. */
  subscribe(listener: (change: YamlDocumentChange) => void): () => void
  /** Drop every subscriber. */
  destroy(): void
}

export function createYamlDocument(props: YamlDocumentProps = {}): YamlDocument {
  let p: YamlDocumentProps = { ...props }
  let text = p.content ?? ''
  let parsed = parseYaml(text)
  let problems: YamlProblem[] = []
  let lints: YamlLint[] = []
  const listeners = new Set<(change: YamlDocumentChange) => void>()

  function computeProblems(): YamlProblem[] {
    const labels = { ...defaultDocumentLabels, ...p.labels }
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

  const status = (): YamlStatus => ({ value: parsed.value, syntaxErrors: parsed.errors, problems })

  /** The text (or the props) changed: read, check, tell the views, and onChange for a user's edit. */
  function changed(change: YamlDocumentChange) {
    parsed = parseYaml(text)
    problems = computeProblems()
    for (const listener of [...listeners]) listener(change)
    if (change.kind === 'input' || change.kind === 'edit') p.onChange?.(text, status())
  }

  problems = computeProblems()

  return {
    get: () => text,
    set(content) {
      text = content
      changed({ kind: 'set' })
    },
    update(content) {
      text = content
      changed({ kind: 'update' })
    },
    input(content, source) {
      if (content === text) return
      text = content
      changed({ kind: 'input', source })
    },
    edit(change, source) {
      let next: string
      try {
        next = change(text)
      } catch (err) {
        if (err instanceof YamlEditError) {
          ;(p.onError ?? console.warn)(err)
          return false
        }
        throw err
      }
      if (next === text) return false
      text = next
      changed({ kind: 'edit', source })
      return true
    },
    updateProps(next) {
      const { content, ...rest } = next
      p = { ...p, ...rest }
      if (content !== undefined && content !== text) {
        text = content
        changed({ kind: 'update' })
      } else changed({ kind: 'props' })
    },
    props: () => p,
    parsed: () => parsed,
    status,
    lints: () => lints,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    destroy() {
      listeners.clear()
    },
  }
}
