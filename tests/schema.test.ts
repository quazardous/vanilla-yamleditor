import { describe, it, expect } from 'vitest'
import { defaultFor, schemaAt, validate, type JsonSchema } from '../src/schema'

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
