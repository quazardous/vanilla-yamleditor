import { describe, it, expect, afterEach } from 'vitest'
import { changedPaths, createYamlDiff, type YamlDiff } from '../src/index'

const BEFORE = `# stores
stores:
  paris:
    enabled: true   # live
    min_stock: 3
  lyon:
    enabled: false
`

let diff: YamlDiff | null = null
afterEach(() => {
  diff?.destroy()
  diff = null
  document.body.replaceChildren()
})

function mount(original: string, modified: string, view?: 'split' | 'unified') {
  const target = document.createElement('div')
  document.body.appendChild(target)
  diff = createYamlDiff({ target, props: { original, modified, view } })
  return { target, diff }
}

describe('changedPaths', () => {
  it('lists changed scalars, added and removed keys and items, not comments', () => {
    expect(changedPaths({ a: 1, b: { c: 2 }, l: [1, 2] }, { a: 1, b: { c: 3, d: 4 }, l: [1] })).toEqual([['b', 'c'], ['b', 'd'], ['l', 1]])
    expect(changedPaths({ a: 1 }, { a: 1 })).toEqual([])
    expect(changedPaths(1, 2)).toEqual([[]])
  })
})

describe('createYamlDiff', () => {
  it('no difference', () => {
    const { target, diff } = mount(BEFORE, BEFORE)
    expect(diff.summary()).toEqual({ identical: true, added: 0, removed: 0, changes: 0, paths: [] })
    expect(target.querySelector('.vye-status')!.textContent).toBe('No difference')
    expect(target.querySelector<HTMLButtonElement>('.vye-diff-next')!.disabled).toBe(true)
  })

  it('a changed value: one line each side, and its key', () => {
    const { target, diff } = mount(BEFORE, BEFORE.replace('min_stock: 3', 'min_stock: 7'))
    expect(diff.summary()).toMatchObject({ identical: false, added: 1, removed: 1, changes: 1, paths: [['stores', 'paris', 'min_stock']] })
    expect(target.querySelector('.vye-status')!.textContent).toBe('+1 −1 · 1 key changed')
    expect([...target.querySelectorAll('.vye-diff-path')].map((c) => c.textContent)).toEqual(['stores.paris.min_stock'])
    // Side by side: the two texts, before and after
    expect(target.querySelectorAll('.cm-mergeViewEditor').length).toBe(2)
  })

  it('a key added and one removed', () => {
    const after = BEFORE.replace('  lyon:\n    enabled: false\n', '  nice:\n    enabled: true\n')
    const { diff } = mount(BEFORE, after)
    expect(diff.summary().paths).toEqual([['stores', 'lyon'], ['stores', 'nice']])
    expect(diff.summary().added).toBe(2)
    expect(diff.summary().removed).toBe(2)
  })

  it('a comment alone: lines change, no key does', () => {
    const { target, diff } = mount(BEFORE, BEFORE.replace('# live', '# live since March'))
    expect(diff.summary()).toMatchObject({ added: 1, removed: 1, paths: [] })
    expect(target.querySelector('.vye-diff-paths')!.hasAttribute('hidden')).toBe(true)
  })

  it('a side that does not parse: the lines still, no keys', () => {
    const { target, diff } = mount(BEFORE, 'stores: [1\n')
    expect(diff.summary().paths).toBeNull()
    expect(target.querySelector('.vye-status')!.textContent).toContain('Keys not compared')
  })

  it('unified view, switching, and update', () => {
    const { target, diff } = mount(BEFORE, BEFORE.replace('min_stock: 3', 'min_stock: 7'), 'unified')
    expect(target.querySelector('.vye-diff')!.getAttribute('data-view')).toBe('unified')
    expect(target.querySelectorAll('.cm-mergeViewEditor').length).toBe(0)
    target.querySelector<HTMLButtonElement>('.vye-tab-split')!.click()
    expect(target.querySelectorAll('.cm-mergeViewEditor').length).toBe(2)
    diff.update({ modified: BEFORE })
    expect(diff.summary().identical).toBe(true)
  })
})
