import { describe, it, expect } from 'vitest'
import { addItem, addKey, deleteAt, parseYaml, rangeAt, renameKey, setValue, commentAt, detectStyle, YamlEditError } from '../src/model'

const CONF = `# Availability filters
filters:
  # by store
  paris:
    enabled: true   # inline
    min_stock: 3
    tags: [a, b]

  lyon:
    enabled: false
    skus:
    - A1
    - "B2"
    note: 'it''s fine'
    block: |
      line one
      line two
`

/** Every line of `before` but the changed ones is still in `after`, in order. */
function changedLines(before: string, after: string) {
  const a = before.split('\n')
  const b = after.split('\n')
  return { removed: a.filter((l) => !b.includes(l)), added: b.filter((l) => !a.includes(l)) }
}

describe('parseYaml', () => {
  it('gives the value, or the syntax errors with their line', () => {
    expect(parseYaml(CONF).value).toMatchObject({ filters: { paris: { min_stock: 3, tags: ['a', 'b'] } } })
    const bad = parseYaml('a: 1\nb: [1, 2\nc: 3\n')
    expect(bad.value).toBeUndefined()
    expect(bad.errors.length).toBeGreaterThan(0)
    expect(bad.errors[0].line).toBeGreaterThanOrEqual(2)
  })
})

describe('setValue keeps the rest of the text', () => {
  it('changes a scalar in place, its comment kept', () => {
    const out = setValue(CONF, ['filters', 'paris', 'enabled'], false)
    expect(changedLines(CONF, out)).toEqual({ removed: ['    enabled: true   # inline'], added: ['    enabled: false   # inline'] })
  })

  it('keeps the quoting of a string', () => {
    const out = setValue(CONF, ['filters', 'lyon', 'note'], "it's better")
    expect(out).toContain("    note: 'it''s better'")
    expect(setValue(CONF, ['filters', 'lyon', 'skus', 1], 'B3')).toContain('    - "B3"')
  })

  it('drops the quotes when a string becomes a number', () => {
    expect(setValue(CONF, ['filters', 'lyon', 'skus', 1], 7)).toContain('    - 7\n')
  })

  it('quotes a string that would read as another type', () => {
    expect(parseYaml(setValue(CONF, ['filters', 'paris', 'min_stock'], 'true')).value).toMatchObject({ filters: { paris: { min_stock: 'true' } } })
  })

  it('replaces a block scalar', () => {
    const out = setValue(CONF, ['filters', 'lyon', 'block'], 'one\ntwo\nthree\n')
    expect(parseYaml(out).value).toMatchObject({ filters: { lyon: { block: 'one\ntwo\nthree\n' } } })
    expect(out.startsWith(CONF.slice(0, CONF.indexOf('    block:')))).toBe(true)
  })

  it('replaces a scalar with a collection, in the document style', () => {
    const out = setValue(CONF, ['filters', 'paris', 'min_stock'], { day: 3, night: 1 })
    expect(out).toContain('    min_stock:\n      day: 3\n      night: 1\n')
    expect(parseYaml(out).errors).toEqual([])
  })

  it('creates missing keys', () => {
    const out = setValue(CONF, ['filters', 'nice', 'enabled'], true)
    expect(parseYaml(out).value).toMatchObject({ filters: { nice: { enabled: true } } })
    expect(changedLines(CONF, out).removed).toEqual([])
  })

  it('edits inside a flow collection, still flow', () => {
    const out = setValue(CONF, ['filters', 'paris', 'tags', 1], 'c')
    expect(out).toContain('    tags: [a, c]')
  })
})

describe('structural edits', () => {
  it('adds a key after the last one, at its column', () => {
    const out = addKey(CONF, ['filters', 'paris'], 'max_stock', 10)
    expect(out).toContain('    tags: [a, b]\n    max_stock: 10\n\n  lyon:')
  })

  it('adds a collection value', () => {
    const out = addKey(CONF, ['filters'], 'nice', { enabled: true, skus: ['X'] })
    expect(parseYaml(out).value).toMatchObject({ filters: { nice: { enabled: true, skus: ['X'] } } })
    expect(changedLines(CONF, out).removed).toEqual([])
  })

  it('appends to a block sequence with its indentation', () => {
    const out = addItem(CONF, ['filters', 'lyon', 'skus'], 'C3')
    expect(out).toContain('    - "B2"\n    - C3\n')
  })

  it('appends to a flow sequence', () => {
    expect(addItem(CONF, ['filters', 'paris', 'tags'], 'z')).toContain('    tags: [a, b, z]')
  })

  it('deletes an entry with its comment lines, nothing else', () => {
    const out = deleteAt(CONF, ['filters', 'paris'])
    expect(out).toBe(CONF.replace('  # by store\n  paris:\n    enabled: true   # inline\n    min_stock: 3\n    tags: [a, b]\n', ''))
  })

  it('deletes a sequence item', () => {
    expect(deleteAt(CONF, ['filters', 'lyon', 'skus', 0])).toContain('    skus:\n    - "B2"\n')
  })

  it('leaves an empty collection when the last entry goes', () => {
    const once = deleteAt('a:\n  b: 1\n', ['a', 'b'])
    expect(parseYaml(once).value).toEqual({ a: {} })
  })

  it('renames a key in place', () => {
    const out = renameKey(CONF, ['filters'], 'lyon', 'lyon_2')
    expect(changedLines(CONF, out)).toEqual({ removed: ['  lyon:'], added: ['  lyon_2:'] })
    expect(() => renameKey(CONF, ['filters'], 'lyon', 'paris')).toThrow(YamlEditError)
  })

  it('refuses to edit a text with syntax errors', () => {
    expect(() => setValue('a: [1\n', ['a'], 2)).toThrow(YamlEditError)
  })

  it('fills an empty document', () => {
    expect(parseYaml(setValue('', ['a', 'b'], 1)).value).toEqual({ a: { b: 1 } })
    expect(parseYaml(addKey('# only a comment\n', [], 'a', 1)).value).toEqual({ a: 1 })
  })
})

describe('reading', () => {
  it('maps a path to its text span, the deepest existing node for a missing one', () => {
    const { doc } = parseYaml(CONF)
    const r = rangeAt(doc, ['filters', 'paris', 'min_stock'])!
    expect(CONF.slice(r.from, r.to)).toBe('min_stock: 3')
    const missing = rangeAt(doc, ['filters', 'paris', 'nope'])!
    expect(CONF.slice(missing.from, missing.from + 6)).toBe('paris:')
  })

  it('reads the comment of an entry', () => {
    const { doc } = parseYaml(CONF)
    expect(commentAt(doc, ['filters', 'paris'])).toBe('by store')
    expect(commentAt(doc, ['filters', 'paris', 'enabled'])).toBe('inline')
  })

  it('detects the indentation style', () => {
    const { doc } = parseYaml(CONF)
    expect(detectStyle(CONF, doc)).toEqual({ indent: 2, indentSeq: false })
  })
})
