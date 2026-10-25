/**
 * A JSON Schema subset: what drives the tree mode's fields and the built-in
 * validation. Enough for configuration files; a full validator (Ajv…) can
 * be plugged in through the `validator` prop instead.
 *
 * Supported: type (one or a list, 'null' included), enum, const, default,
 * title, description, minimum / maximum / exclusiveMinimum / exclusiveMaximum,
 * multipleOf, minLength / maxLength / pattern, format: 'textarea',
 * properties / required / additionalProperties, items / minItems / maxItems,
 * and local $ref (#/$defs/…, #/definitions/…).
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
  [key: string]: unknown
}

export interface YamlProblem {
  path: YamlPath
  message: string
  severity?: 'error' | 'warning'
}

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

/** The schema of the value at a path, $refs resolved; undefined when the schema says nothing there. */
export function schemaAt(root: JsonSchema | undefined, path: YamlPath): JsonSchema | undefined {
  if (!root) return undefined
  let s = resolve(root, root)
  for (const seg of path) {
    if (!s) return undefined
    if (typeof seg === 'number') s = resolve(s.items, root)
    else {
      const prop = s.properties?.[seg]
      s = resolve(prop ?? (typeof s.additionalProperties === 'object' ? s.additionalProperties : undefined), root)
    }
  }
  return s
}

/** The value a new entry starts with: the schema's default, else an empty value of its type. */
export function defaultFor(schema: JsonSchema | undefined, root?: JsonSchema): unknown {
  const s = root ? resolve(schema, root) : schema
  if (!s) return ''
  if (s.default !== undefined) return structuredClone(s.default)
  if (s.const !== undefined) return s.const
  if (s.enum?.length) return s.enum[0]
  const t = typesOf(s).find((x) => x !== 'null') ?? typesOf(s)[0]
  switch (t) {
    case 'object': {
      // Required properties come along, so the new entry is valid as far as it can be
      const out: Record<string, unknown> = {}
      for (const key of s.required ?? []) out[key] = defaultFor(s.properties?.[key], root)
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
  const walk = (v: unknown, schema: JsonSchema | undefined, path: YamlPath) => {
    const s = resolve(schema, root)
    if (!s) return
    const types = typesOf(s)
    if (types.length && !types.some((t) => matchesType(v, t))) {
      problems.push({ path, message: messages.type(types.join(' | ')) })
      return
    }
    if (s.enum && !s.enum.some((e) => show(e) === show(v))) problems.push({ path, message: messages.enum(s.enum.map(show).join(', ')) })
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
  walk(value, root, [])
  return problems
}
