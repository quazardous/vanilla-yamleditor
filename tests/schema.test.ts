import { describe, it, expect } from 'vitest'
import { choicesOf, defaultFor, schemaAt, validate, type JsonSchema } from '../src/schema'

const SCHEMA: JsonSchema = {
  $defs: { store: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' }, min: { type: 'integer', minimum: 0, default: 2 } }, additionalProperties: false } },
  type: 'object',
  properties: {
    stores: { type: 'object', additionalProperties: { $ref: '#/$defs/store' } },
    tags: { type: 'array', items: { type: 'string', pattern: '^[a-z]+$' }, maxItems: 2 },
    mode: { enum: ['a', 'b'] },
    ratio: { type: ['number', 'null'], exclusiveMaximum: 1 },
  },
}

describe('validate', () => {
  it('passes a valid value', () => {
    expect(validate({ stores: { paris: { enabled: true, min: 1 } }, tags: ['x'], mode: 'a', ratio: null }, SCHEMA)).toEqual([])
  })

  it('gives each problem the path of the value at fault', () => {
    const problems = validate({ stores: { paris: { min: -1, extra: 1 } }, tags: ['ok', 'NO', 'z'], mode: 'c', ratio: 1 }, SCHEMA)
    expect(problems.map((p) => [p.path.join('.'), p.message])).toEqual([
      ['stores.paris', '"enabled" is required'],
      ['stores.paris.min', 'Must be ≥ 0'],
      ['stores.paris.extra', '"extra" is not allowed here'],
      ['tags', 'At most 2 items'],
      ['tags.1', 'Must match ^[a-z]+$'],
      ['mode', 'Must be one of: "a", "b"'],
      ['ratio', 'Must be < 1'],
    ])
  })

  it('checks types, an integer being a number', () => {
    expect(validate(3, { type: 'number' })).toEqual([])
    expect(validate(3.5, { type: 'integer' })[0].message).toBe('Must be integer')
    expect(validate('x', { type: ['boolean', 'null'] })[0].message).toBe('Must be boolean | null')
  })

  it('takes translated messages', () => {
    expect(validate(-1, { minimum: 0 }, { ...defaultMessagesFr })[0].message).toBe('≥ 0 attendu')
  })
})

const defaultMessagesFr = { ...(await import('../src/schema')).defaultSchemaMessages, minimum: (n: number) => `≥ ${n} attendu` }

describe('schemaAt / defaultFor', () => {
  it('follows properties, additionalProperties, items and $ref', () => {
    expect(schemaAt(SCHEMA, ['stores', 'lyon', 'min'])).toMatchObject({ type: 'integer', minimum: 0 })
    expect(schemaAt(SCHEMA, ['tags', 0])).toMatchObject({ type: 'string' })
    expect(schemaAt(SCHEMA, ['nope'])).toBeUndefined()
  })

  it('starts a new entry from the default, or an empty value with the required keys', () => {
    expect(defaultFor(schemaAt(SCHEMA, ['stores', 'lyon']), SCHEMA)).toEqual({ enabled: false })
    expect(defaultFor(schemaAt(SCHEMA, ['stores', 'lyon', 'min']))).toBe(2)
    expect(defaultFor({ enum: ['x', 'y'] })).toBe('x')
    expect(defaultFor(undefined)).toBe('')
  })
})

describe('choices', () => {
  it('labels an enum with x-enumLabels, or reads a oneOf of consts', () => {
    expect(choicesOf({ enum: ['a', 'b'], 'x-enumLabels': ['A', 'B'] })).toEqual([{ value: 'a', title: 'A' }, { value: 'b', title: 'B' }])
    expect(choicesOf({ oneOf: [{ const: 'amazon:fr', title: 'Amazon France' }, { const: 'soko', title: 'Soko' }] })).toEqual([
      { value: 'amazon:fr', title: 'Amazon France', description: undefined },
      { value: 'soko', title: 'Soko', description: undefined },
    ])
    expect(choicesOf({ type: 'string' })).toBeNull()
  })

  it('checks a oneOf of consts like an enum, and starts from its first value', () => {
    const s: JsonSchema = { oneOf: [{ const: 'x', title: 'X' }, { const: 'y' }] }
    expect(validate('y', s)).toEqual([])
    expect(validate('z', s)[0].message).toBe('Must be one of: "x", "y"')
    expect(defaultFor(s)).toBe('x')
  })
})

const TASK: JsonSchema = {
  type: 'object',
  properties: { tasks: { type: 'array', items: { $ref: '#/$defs/task' } } },
  $defs: {
    task: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      discriminator: { propertyName: 'kind' },
      oneOf: [
        { title: 'Cron', properties: { kind: { const: 'cron' }, schedule: { type: 'string', examples: ['*/5 * * * *'] } }, required: ['schedule'] },
        { title: 'Export', properties: { kind: { const: 'export' }, target: { enum: ['s3', 'ftp'] } }, required: ['target'] },
      ],
    },
  },
}

describe('variants', () => {
  it('oneOf + discriminator: the branch its tag names, the tag a choice of every branch', () => {
    const doc = { tasks: [{ name: 'a', kind: 'export', target: 's3' }] }
    expect(Object.keys(schemaAt(TASK, ['tasks', 0], doc)!.properties!)).toEqual(['name', 'kind', 'target'])
    expect(choicesOf(schemaAt(TASK, ['tasks', 0, 'kind'], doc))).toEqual([
      { value: 'cron', title: 'Cron', description: undefined },
      { value: 'export', title: 'Export', description: undefined },
    ])
    expect(schemaAt(TASK, ['tasks', 0, 'target'], doc)).toMatchObject({ enum: ['s3', 'ftp'] })
    expect(validate(doc, TASK)).toEqual([])
    expect(validate({ tasks: [{ name: 'a', kind: 'cron' }] }, TASK).map((p) => p.message)).toEqual(['"schedule" is required'])
    expect(validate({ tasks: [{ name: 'a', kind: 'nope' }] }, TASK).map((p) => [p.path.join('.'), p.message])).toEqual([['tasks.0.kind', 'Must be one of: "cron", "export"']])
  })

  it('a new entry starts in the first branch, with its required keys', () => {
    expect(defaultFor(schemaAt(TASK, ['tasks', 0]), TASK)).toEqual({ name: '', kind: 'cron', schedule: '' })
  })

  it('if / then / else on a discriminant', () => {
    const s: JsonSchema = {
      type: 'object',
      properties: { mode: { enum: ['fixed', 'ratio'] } },
      if: { properties: { mode: { const: 'ratio' } } },
      then: { properties: { ratio: { type: 'number', maximum: 1 } }, required: ['ratio'] },
      else: { properties: { amount: { type: 'integer' } }, required: ['amount'] },
    }
    expect(validate({ mode: 'ratio', ratio: 0.5 }, s)).toEqual([])
    expect(validate({ mode: 'ratio', ratio: 2 }, s)[0].message).toBe('Must be ≤ 1')
    expect(validate({ mode: 'fixed' }, s)[0].message).toBe('"amount" is required')
    expect(schemaAt(s, ['ratio'], { mode: 'ratio' })).toMatchObject({ maximum: 1 })
    expect(schemaAt(s, ['ratio'], { mode: 'fixed' })).toBeUndefined()
  })

  it('oneOf without a discriminator: the first branch that matches, else a message', () => {
    const s: JsonSchema = { oneOf: [{ title: 'A number', type: 'number' }, { title: 'A list', type: 'array' }] }
    expect(validate(3, s)).toEqual([])
    expect(validate('x', s)[0].message).toBe('Must match one of: A number, A list')
  })

  it('allOf is merged', () => {
    const s: JsonSchema = { allOf: [{ properties: { a: { type: 'string' } }, required: ['a'] }, { properties: { b: { type: 'integer' } }, required: ['b'] }] }
    expect(validate({ a: 'x' }, s).map((p) => p.message)).toEqual(['"b" is required'])
  })
})

describe('deprecated', () => {
  it('warns on an entry that is there, without blocking', () => {
    const s: JsonSchema = { type: 'object', properties: { old: { type: 'string', deprecated: true } } }
    expect(validate({ old: 'x' }, s)).toEqual([{ path: ['old'], message: '"old" is deprecated', severity: 'warning' }])
    expect(validate({}, s)).toEqual([])
  })
})
