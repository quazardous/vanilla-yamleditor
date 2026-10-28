/**
 * A JSON Schema subset: what drives the tree mode's fields and the built-in
 * validation. Enough for configuration files; a full validator (Ajv…) can
 * be plugged in through the `validator` prop instead.
 *
 * Supported: type (one or a list, 'null' included), enum, const, default,
 * title, description, minimum / maximum / exclusiveMinimum / exclusiveMaximum,
 * multipleOf, minLength / maxLength / pattern, format: 'textarea',
 * properties / required / additionalProperties, items / minItems / maxItems,
 * readOnly, deprecated, examples, local $ref (#/$defs/…, #/definitions/…).
 *
 * Labelled choices: `oneOf` / `anyOf` of `{ const, title }`, or `enum` with a
 * parallel `x-enumLabels`. Variants: `allOf` (merged), `if` / `then` / `else`,
 * and `oneOf` / `anyOf` of object schemas, picked by `discriminator.propertyName`
 * (OpenAPI style) or else by the first branch the value matches: see effective().
 */
import type { YamlPath } from './model'

export type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null'

export interface JsonSchema {
  $ref?: string
  $defs?: Record<string, JsonSchema>
  definitions?: Record<string, JsonSchema>
  type?: JsonSchemaType | JsonSchemaType[]
  enum?: unknown[]
  const?: unknown
  default?: unknown
  title?: string
  description?: string
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  multipleOf?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean | JsonSchema
  items?: JsonSchema
  minItems?: number
  maxItems?: number
  readOnly?: boolean
  deprecated?: boolean
  examples?: unknown[]
  /** Labels for `enum`, in the same order. */
  'x-enumLabels'?: string[]
  allOf?: JsonSchema[]
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  if?: JsonSchema
  then?: JsonSchema
  else?: JsonSchema
  /** For oneOf / anyOf: the property whose `const` names the branch. */
  discriminator?: { propertyName: string }
  [key: string]: unknown
}

/** A value a field can take, with its label. */
export interface Choice {
  value: unknown
  title?: string
  description?: string
}

export interface YamlProblem {
  path: YamlPath
  message: string
  severity?: 'error' | 'warning'
}

/** A problem as given to the editor: its path may also be a string such as `a.b[0]`. */
export type YamlProblemInput = Omit<YamlProblem, 'path'> & { path: YamlPath | string }

/** The validation messages; replace them to translate. */
export interface SchemaMessages {
  type: (expected: string) => string
  enum: (values: string) => string
  const: (value: string) => string
  minimum: (n: number) => string
  maximum: (n: number) => string
  exclusiveMinimum: (n: number) => string
  exclusiveMaximum: (n: number) => string
  multipleOf: (n: number) => string
  minLength: (n: number) => string
  maxLength: (n: number) => string
  pattern: (p: string) => string
  required: (key: string) => string
  additional: (key: string) => string
  minItems: (n: number) => string
  maxItems: (n: number) => string
  /** No branch of a oneOf / anyOf matches; `variants` are their titles. */
  oneOf: (variants: string) => string
  /** A warning: the entry is there but deprecated. */
  deprecated: (key: string) => string
}

export const defaultSchemaMessages: SchemaMessages = {
  type: (t) => `Must be ${t}`,
  enum: (v) => `Must be one of: ${v}`,
  const: (v) => `Must be ${v}`,
  minimum: (n) => `Must be ≥ ${n}`,
  maximum: (n) => `Must be ≤ ${n}`,
  exclusiveMinimum: (n) => `Must be > ${n}`,
  exclusiveMaximum: (n) => `Must be < ${n}`,
  multipleOf: (n) => `Must be a multiple of ${n}`,
  minLength: (n) => `At least ${n} characters`,
  maxLength: (n) => `At most ${n} characters`,
  pattern: (p) => `Must match ${p}`,
  required: (k) => `"${k}" is required`,
  additional: (k) => `"${k}" is not allowed here`,
  minItems: (n) => `At least ${n} items`,
  maxItems: (n) => `At most ${n} items`,
  oneOf: (v) => `Must match one of: ${v}`,
  deprecated: (k) => `"${k}" is deprecated`,
}

function resolve(schema: JsonSchema | undefined, root: JsonSchema): JsonSchema | undefined {
  let s = schema
  for (let guard = 0; s?.$ref && guard < 32; guard++) {
    const m = /^#\/(\$defs|definitions)\/(.+)$/.exec(s.$ref)
    const target = m ? (root[m[1]] as Record<string, JsonSchema> | undefined)?.[decodeURIComponent(m[2])] : undefined
    if (!target) return { ...s, $ref: undefined }
    const { $ref: _ref, ...rest } = s
    s = { ...target, ...rest }
  }
  return s
}

export function typesOf(schema: JsonSchema | undefined): JsonSchemaType[] {
  if (!schema?.type) return []
  return Array.isArray(schema.type) ? schema.type : [schema.type]
}

/** The type of a plain value, in schema terms. */
export function valueType(value: unknown): JsonSchemaType {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'object') return 'object'
  return 'string'
}

const matchesType = (value: unknown, t: JsonSchemaType) => {
  const vt = valueType(value)
  return vt === t || (t === 'number' && vt === 'integer')
}

const show = (v: unknown) => JSON.stringify(v)
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

/** The choices of a field: its enum (labelled by x-enumLabels), or a oneOf / anyOf of consts. Null when it is free. */
export function choicesOf(schema: JsonSchema | undefined): Choice[] | null {
  if (!schema) return null
  if (schema.enum) {
    const labels = schema['x-enumLabels']
    return schema.enum.map((value, i) => ({ value, title: Array.isArray(labels) ? labels[i] : undefined }))
  }
  const branches = schema.oneOf ?? schema.anyOf
  if (branches?.length && branches.every((b) => b?.const !== undefined)) return branches.map((b) => ({ value: b.const, title: b.title, description: b.description }))
  return null
}

/** Two schemas as one: b's keywords win, but a keeps its title and help (a branch's names its variant), properties merged, required joined. */
function merge(a: JsonSchema, b: JsonSchema): JsonSchema {
  const out: JsonSchema = { ...a, ...b, title: a.title ?? b.title, description: a.description ?? b.description }
  if (out.title === undefined) delete out.title
  if (out.description === undefined) delete out.description
  if (a.properties || b.properties) {
    out.properties = { ...a.properties }
    for (const [key, prop] of Object.entries(b.properties ?? {})) out.properties[key] = a.properties?.[key] ? { ...a.properties[key], ...prop } : prop
  }
  if (a.required || b.required) out.required = [...new Set([...(a.required ?? []), ...(b.required ?? [])])]
  return out
}

/** A variant's schema without its title and help: they name the variant, not the field. */
const unnamed = (s: JsonSchema | undefined): JsonSchema => {
  const { title: _t, description: _d, ...rest } = s ?? {}
  return rest
}

/** Set by effective() when no branch of a oneOf / anyOf fits the value: their titles, for the message. */
const NO_VARIANT = 'x-noVariant'

/** The value a branch gives its discriminator. */
function tagOf(branch: JsonSchema, prop: string, root: JsonSchema): unknown {
  const s = resolve(branch.properties?.[prop], root)
  return s?.const !== undefined ? s.const : s?.enum?.[0]
}

/**
 * The schema that applies to a value: $ref resolved, allOf merged, the then or
 * else of an if, and the branch of a oneOf / anyOf: the one its discriminator
 * names, else the first the value matches. The discriminator itself becomes a
 * choice between the branches. A oneOf of consts stays as it is: a choice list.
 */
export function effective(schema: JsonSchema | undefined, value: unknown, root: JsonSchema, depth = 0): JsonSchema | undefined {
  const s = resolve(schema, root)
  if (!s || depth > 16) return s
  const { allOf, anyOf, oneOf, if: cond, then: yes, else: no, discriminator, ...base } = s
  if (!allOf && !anyOf && !oneOf && !cond) return s
  // Kept on the result, so it can be made effective again for another value (defaultFor, schemaAt)
  const variants: JsonSchema = Object.fromEntries(Object.entries({ allOf, anyOf, oneOf, if: cond, then: yes, else: no, discriminator }).filter(([, v]) => v !== undefined))
  let out: JsonSchema = base
  for (const part of allOf ?? []) out = merge(out, effective(part, value, root, depth + 1) ?? {})
  if (cond) {
    const branch = matches(value, cond, root) ? yes : no
    if (branch) out = merge(out, unnamed(effective(branch, value, root, depth + 1)))
  }
  const branches = (oneOf ?? anyOf ?? []).map((b) => resolve(b, root)).filter((b): b is JsonSchema => !!b)
  if (!branches.length) return { ...out, ...variants }
  if (branches.every((b) => b.const !== undefined)) return { ...out, ...variants }

  const prop = discriminator?.propertyName
  const pick = prop
    ? branches.find((b) => isObject(value) && show(tagOf(b, prop, root)) === show(value[prop]))
    : branches.find((b) => matches(value, b, root))
  if (pick) out = merge(out, unnamed(effective(pick, value, root, depth + 1)))
  if (prop) {
    // The discriminator: a choice of every branch, labelled by the branch's title
    const choice: JsonSchema = { oneOf: branches.map((b) => ({ const: tagOf(b, prop, root), title: b.title, description: b.description })).filter((c) => c.const !== undefined) }
    const { const: _c, enum: _e, ...current } = out.properties?.[prop] ?? {}
    out = { ...out, properties: { ...out.properties, [prop]: { ...current, ...choice } }, required: [...new Set([...(out.required ?? []), prop])] }
  } else if (!pick) {
    out = { ...out, [NO_VARIANT]: branches.map((b, i) => b.title ?? `#${i + 1}`) }
  }
  return { ...out, ...variants }
}

/** Does a value pass a schema? (for if, and for picking a branch) */
function matches(value: unknown, schema: JsonSchema, root: JsonSchema): boolean {
  const problems: YamlProblem[] = []
  check(value, schema, root, defaultSchemaMessages, [], problems)
  return !problems.some((p) => p.severity !== 'warning')
}

const childOf = (value: unknown, seg: string | number) => (value !== null && typeof value === 'object' ? (value as Record<string | number, unknown>)[seg] : undefined)

/**
 * The schema of the value at a path, $refs resolved and variants picked from
 * `value` (the whole document) when given; undefined when the schema says
 * nothing there.
 */
export function schemaAt(root: JsonSchema | undefined, path: YamlPath, value?: unknown): JsonSchema | undefined {
  if (!root) return undefined
  let v = value
  let s = effective(root, v, root)
  for (const seg of path) {
    if (!s) return undefined
    v = childOf(v, seg)
    if (typeof seg === 'number') s = effective(s.items, v, root)
    else {
      const prop = s.properties?.[seg]
      s = effective(prop ?? (typeof s.additionalProperties === 'object' ? s.additionalProperties : undefined), v, root)
    }
  }
  return s
}

/** The value a new entry starts with: the schema's default, else an empty value of its type. */
export function defaultFor(schema: JsonSchema | undefined, root?: JsonSchema): unknown {
  const top = root ?? schema ?? {}
  const s = effective(schema, undefined, top)
  if (!s) return ''
  if (s.default !== undefined) return structuredClone(s.default)
  if (s.const !== undefined) return s.const
  const choices = choicesOf(s)
  if (choices?.length) return choices[0].value
  const objectLike = !!(s.properties || s.required || s.discriminator || s.oneOf || s.anyOf)
  const t = typesOf(s).find((x) => x !== 'null') ?? typesOf(s)[0] ?? (objectLike ? 'object' : undefined)
  switch (t) {
    case 'object': {
      // Required properties come along, so the new entry is valid as far as it can be;
      // a second pass adds those of the variant the first one chose (its discriminator)
      const out: Record<string, unknown> = {}
      for (let pass = 0; pass < 2; pass++) {
        const now = effective(schema, out, top) ?? {}
        for (const key of now.required ?? []) if (!(key in out)) out[key] = defaultFor(now.properties?.[key], top)
      }
      return out
    }
    case 'array':
      return []
    case 'number':
    case 'integer':
      return s.minimum ?? 0
    case 'boolean':
      return false
    case 'null':
      return null
    default:
      return ''
  }
}

/** Check a value against a schema; every problem carries the path of the value at fault. */
export function validate(value: unknown, root: JsonSchema, messages: SchemaMessages = defaultSchemaMessages): YamlProblem[] {
  const problems: YamlProblem[] = []
  check(value, root, root, { ...defaultSchemaMessages, ...messages }, [], problems)
  return problems
}

function check(value: unknown, schema: JsonSchema, root: JsonSchema, messages: SchemaMessages, at: YamlPath, problems: YamlProblem[]): void {
  const walk = (v: unknown, sub: JsonSchema | undefined, path: YamlPath) => {
    const s = effective(sub, v, root)
    if (!s) return
    if (s.deprecated && path.length) problems.push({ path, message: messages.deprecated(String(path[path.length - 1])), severity: 'warning' })
    const types = typesOf(s)
    if (types.length && !types.some((t) => matchesType(v, t))) {
      problems.push({ path, message: messages.type(types.join(' | ')) })
      return
    }
    const variants = s[NO_VARIANT] as string[] | undefined
    if (variants) problems.push({ path, message: messages.oneOf(variants.join(', ')) })
    const choices = choicesOf(s)
    if (choices && !choices.some((c) => show(c.value) === show(v))) problems.push({ path, message: messages.enum(choices.map((c) => show(c.value)).join(', ')) })
    if (s.const !== undefined && show(s.const) !== show(v)) problems.push({ path, message: messages.const(show(s.const)) })
    if (typeof v === 'number') {
      if (s.minimum !== undefined && v < s.minimum) problems.push({ path, message: messages.minimum(s.minimum) })
      if (s.maximum !== undefined && v > s.maximum) problems.push({ path, message: messages.maximum(s.maximum) })
      if (s.exclusiveMinimum !== undefined && v <= s.exclusiveMinimum) problems.push({ path, message: messages.exclusiveMinimum(s.exclusiveMinimum) })
      if (s.exclusiveMaximum !== undefined && v >= s.exclusiveMaximum) problems.push({ path, message: messages.exclusiveMaximum(s.exclusiveMaximum) })
      if (s.multipleOf && Math.abs(v / s.multipleOf - Math.round(v / s.multipleOf)) > 1e-9) problems.push({ path, message: messages.multipleOf(s.multipleOf) })
    }
    if (typeof v === 'string') {
      if (s.minLength !== undefined && v.length < s.minLength) problems.push({ path, message: messages.minLength(s.minLength) })
      if (s.maxLength !== undefined && v.length > s.maxLength) problems.push({ path, message: messages.maxLength(s.maxLength) })
      if (s.pattern) {
        try {
          if (!new RegExp(s.pattern, 'u').test(v)) problems.push({ path, message: messages.pattern(s.pattern) })
        } catch {
          // An invalid pattern in the schema checks nothing
        }
      }
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) problems.push({ path, message: messages.minItems(s.minItems) })
      if (s.maxItems !== undefined && v.length > s.maxItems) problems.push({ path, message: messages.maxItems(s.maxItems) })
      if (s.items) v.forEach((item, i) => walk(item, s.items, [...path, i]))
    } else if (v !== null && typeof v === 'object') {
      const obj = v as Record<string, unknown>
      for (const key of s.required ?? []) if (!(key in obj)) problems.push({ path, message: messages.required(key) })
      for (const [key, item] of Object.entries(obj)) {
        const prop = s.properties?.[key]
        if (prop) walk(item, prop, [...path, key])
        else if (s.additionalProperties === false) problems.push({ path: [...path, key], message: messages.additional(key) })
        else if (typeof s.additionalProperties === 'object') walk(item, s.additionalProperties, [...path, key])
      }
    }
  }
  walk(value, schema, at)
}
