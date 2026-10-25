import { describe, it, expect, vi, afterEach } from 'vitest'
import { createYamlEditor, type YamlEditor, type JsonSchema } from '../src/index'

const CONTENT = `# stores
stores:
  paris:
    enabled: true   # live
    min_stock: 3
    channel: web
`

const SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    stores: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['enabled'],
        properties: {
          enabled: { type: 'boolean', title: 'Enabled' },
          min_stock: { type: 'integer', minimum: 0, title: 'Minimum stock' },
          channel: { enum: ['web', 'store'], title: 'Channel' },
          note: { type: 'string', title: 'Note' },
        },
      },
    },
  },
}

let editor: YamlEditor | null = null
afterEach(() => {
  editor?.destroy()
  editor = null
  document.body.replaceChildren()
})

function mount(props: Parameters<typeof createYamlEditor>[0]['props'] = {}) {
  const target = document.createElement('div')
  document.body.appendChild(target)
  editor = createYamlEditor({ target, props: { content: CONTENT, schema: SCHEMA, ...props } })
  return { target, editor }
}

const row = (target: HTMLElement, path: string) => target.querySelector<HTMLElement>(`[data-path="${path}"]`)!
function change(input: HTMLInputElement | HTMLSelectElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('change'))
}

describe('createYamlEditor', () => {
  it('opens in tree mode with schema-driven controls', () => {
    const { target } = mount()
    expect(target.querySelector('.vye')!.getAttribute('data-mode')).toBe('tree')
    expect(row(target, 'stores.paris.enabled').querySelector('input')!.type).toBe('checkbox')
    expect(row(target, 'stores.paris.min_stock').querySelector('input')!.type).toBe('number')
    expect(row(target, 'stores.paris.channel').querySelector('select')).not.toBeNull()
    expect(row(target, 'stores.paris.min_stock').querySelector('.vye-key')!.textContent).toBe('Minimum stock')
    // The comment shows as help
    expect(row(target, 'stores.paris.enabled').querySelector('.vye-hint')!.textContent).toBe('live')
  })

  it('edits through the form, keeping the comments, and tells onChange', () => {
    const onChange = vi.fn()
    const { target, editor } = mount({ onChange })
    change(row(target, 'stores.paris.min_stock').querySelector('input')!, '7')
    change(row(target, 'stores.paris.channel').querySelector('select')!, '1')
    row(target, 'stores.paris.enabled').querySelector('input')!.click()
    expect(editor.get()).toBe(CONTENT.replace('min_stock: 3', 'min_stock: 7').replace('channel: web', 'channel: store').replace('enabled: true', 'enabled: false'))
    expect(onChange).toHaveBeenCalledTimes(3)
    expect(onChange.mock.calls[2][1].value).toEqual({ stores: { paris: { enabled: false, min_stock: 7, channel: 'store' } } })
  })

  it('adds a declared property and removes it', () => {
    const { target, editor } = mount()
    row(target, 'stores.paris').querySelector<HTMLButtonElement>('[data-role="add:note"]')!.click()
    expect(editor.get()).toContain('    note: ""\n')
    row(target, 'stores.paris.note').querySelector<HTMLButtonElement>('.vye-remove')!.click()
    expect(editor.get()).toBe(CONTENT)
  })

  it('a required property has no remove button', () => {
    const { target } = mount()
    expect(row(target, 'stores.paris.enabled').querySelector('.vye-remove')).toBeNull()
    expect(row(target, 'stores.paris.min_stock').querySelector('.vye-remove')).not.toBeNull()
  })

  it('adds and renames a free key', () => {
    const { target, editor } = mount()
    const add = row(target, 'stores')
    const input = add.querySelector<HTMLInputElement>(':scope > .vye-children > .vye-add-row .vye-new-key')!
    input.value = 'lyon'
    add.querySelector<HTMLButtonElement>(':scope > .vye-children > .vye-add-row [data-role="add-key"]')!.click()
    expect(editor.status().value).toMatchObject({ stores: { lyon: { enabled: false } } })
    change(row(target, 'stores.lyon').querySelector<HTMLInputElement>('.vye-key-input')!, 'nice')
    expect(editor.status().value).toMatchObject({ stores: { nice: { enabled: false } } })
  })

  it('shows schema, validator and external problems on the field', () => {
    const { target, editor } = mount({ validator: () => [{ path: ['stores', 'paris', 'channel'], message: 'not this week' }] })
    change(row(target, 'stores.paris.min_stock').querySelector('input')!, '-1')
    expect(row(target, 'stores.paris.min_stock').querySelector('.vye-problem')!.textContent).toBe('Must be ≥ 0')
    expect(row(target, 'stores.paris.channel').querySelector('.vye-problem')!.textContent).toBe('not this week')
    editor.updateProps({ problems: [{ path: ['stores', 'paris', 'enabled'], message: 'server says no' }] })
    expect(row(target, 'stores.paris.enabled').classList.contains('vye-invalid')).toBe(true)
    expect(editor.status().problems.map((p) => p.message)).toEqual(['Must be ≥ 0', 'not this week', 'server says no'])
  })

  it('refuses the tree mode while the text has syntax errors', () => {
    const onChangeMode = vi.fn()
    const { target, editor } = mount({ onChangeMode })
    expect(editor.setMode('text')).toBe(true)
    editor.update('a: [1\n')
    expect(editor.setMode('tree')).toBe(false)
    expect(editor.getMode()).toBe('text')
    expect(target.querySelector('.vye-status')!.textContent).toMatch(/syntax/)
    expect(target.querySelector('.vye-tab-tree')!.getAttribute('aria-disabled')).toBe('true')
    editor.update('a: [1]\n')
    expect(editor.setMode('tree')).toBe(true)
    expect(onChangeMode.mock.calls.map((c) => c[0])).toEqual(['text', 'tree'])
  })

  it('opens in text mode when the content does not parse', () => {
    const { editor } = mount({ content: 'a: [1\n' })
    expect(editor.getMode()).toBe('text')
    expect(editor.status().syntaxErrors.length).toBeGreaterThan(0)
  })

  it('read only: disabled controls, no add or remove', () => {
    const { target } = mount({ readOnly: true })
    expect(row(target, 'stores.paris.min_stock').querySelector('input')!.disabled).toBe(true)
    expect(target.querySelector('.vye-remove, .vye-add, .vye-new-key')).toBeNull()
  })

  it('reports a refused edit through onError', () => {
    const onError = vi.fn()
    const { target } = mount({ onError, content: 'stores:\n  paris: {enabled: true}\n  lyon: {enabled: true}\n' })
    change(row(target, 'stores.lyon').querySelector<HTMLInputElement>('.vye-key-input')!, 'paris')
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0][0].message).toMatch(/already exists/)
  })

  it('translates schema titles and the chrome', () => {
    const { target } = mount({ translate: (s) => `[${s}]`, labels: { text: 'Texte', tree: 'Arbre' } })
    expect(row(target, 'stores.paris.min_stock').querySelector('.vye-key')!.textContent).toBe('[Minimum stock]')
    expect(target.querySelector('.vye-tab-text')!.textContent).toBe('Texte')
  })
})

describe('problem paths', () => {
  it('accepts string paths, and puts a missing entry on its parent', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    editor = createYamlEditor({ target, props: { content: CONTENT, problems: [{ path: 'stores.paris.skus[0]' as never, message: 'needs a SKU' }, { path: '' as never, message: 'whole file' }] } })
    expect(target.querySelector('[data-path="stores.paris"] .vye-problem')!.textContent).toBe('skus[0]: needs a SKU')
    expect(target.querySelector('.vye-problem-root')!.textContent).toBe('whole file')
    expect(editor.status().problems[0].path).toEqual(['stores', 'paris', 'skus', 0])
  })
})
