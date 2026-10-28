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
  it('opens in form mode with schema-driven controls', () => {
    const { target } = mount()
    expect(target.querySelector('.vye')!.getAttribute('data-mode')).toBe('form')
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
    expect(editor.setMode('form')).toBe(false)
    expect(target.querySelector('.vye-tab-form')!.getAttribute('aria-disabled')).toBe('true')
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

describe('modes', () => {
  const tabs = (target: HTMLElement) => [...target.querySelectorAll<HTMLElement>('.vye-modes .vye-tab')].map((t) => t.textContent)

  it('offers only the modes given, in their order', () => {
    const { target, editor } = mount({ modes: ['form', 'text'] })
    expect(tabs(target)).toEqual(['Form', 'Text'])
    expect(editor.getModes()).toEqual(['form', 'text'])
    expect(editor.getMode()).toBe('form')
    expect(editor.canSetMode('tree')).toBe(false)
    expect(editor.setMode('tree')).toBe(false)
    expect(editor.getMode()).toBe('form')
    expect(editor.setMode('text')).toBe(true)
  })

  it('the default view comes from the modes offered', () => {
    expect(mount({ schema: undefined, modes: ['text', 'form'] }).editor.getMode()).toBe('form')
    editor!.destroy()
    expect(mount({ modes: ['text', 'tree'] }).editor.getMode()).toBe('tree')
    editor!.destroy()
    expect(mount({ mode: 'tree', modes: ['text', 'form'] }).editor.getMode()).toBe('form')
  })

  it('modeSwitch: false hides the buttons, the status stays; one mode hides them too', () => {
    const { target, editor } = mount({ modeSwitch: false })
    expect(target.querySelector<HTMLElement>('.vye-modes')!.hidden).toBe(true)
    expect(target.querySelector<HTMLElement>('.vye-menu')!.hidden).toBe(false)
    // Driven by code
    expect(editor.setMode('text')).toBe(true)
    editor.updateProps({ modeSwitch: true, modes: ['form'] })
    expect(target.querySelector<HTMLElement>('.vye-modes')!.hidden).toBe(true)
    expect(editor.getMode()).toBe('form')
  })

  it('a text that does not parse shows as text, even when text is not offered; back once it parses', () => {
    const onChangeMode = vi.fn()
    const { editor } = mount({ modes: ['form'], onChangeMode })
    expect(editor.canSetMode('text')).toBe(false)
    editor.update('a: [1\n')
    expect(editor.getMode()).toBe('text')
    expect(editor.canSetMode('form')).toBe(false)
    editor.update(CONTENT)
    expect(editor.getMode()).toBe('form')
    expect(onChangeMode.mock.calls.map((c) => c[0])).toEqual(['text', 'form'])
  })
})

describe('tree mode', () => {
  it('is the default without a schema; form stays one click away', () => {
    const { target, editor } = mount({ schema: undefined })
    expect(editor.getMode()).toBe('tree')
    expect(target.querySelector('.vye-tree')!.classList.contains('vye-view-tree')).toBe(true)
    expect([...target.querySelectorAll('.vye-tab')].map((t) => t.textContent)).toEqual(['Text', 'Tree', 'Form'])
    expect(editor.setMode('form')).toBe(true)
    expect(target.querySelector('.vye-tree')!.classList.contains('vye-view-form')).toBe(true)
  })

  it('shows the real keys, `key: value` on a line, sizes and comments', () => {
    const { target } = mount({ mode: 'tree' })
    const head = (path: string) => row(target, path).querySelector<HTMLElement>(':scope > .vye-entry-head')!
    // The real key, the schema title on hover
    expect(head('stores.paris.min_stock').querySelector('.vye-key')!.textContent).toBe('min_stock')
    expect(head('stores.paris.min_stock').querySelector('.vye-key')!.getAttribute('title')).toBe('Minimum stock')
    expect(head('stores.paris.min_stock').querySelector('.vye-colon')!.textContent).toBe(':')
    expect(head('stores.paris.min_stock').querySelector('input')!.classList.contains('vye-t-number')).toBe(true)
    expect(head('stores.paris').querySelector('.vye-count')!.textContent).toBe('{3}')
    // The comment on its line, no help line under it
    expect(head('stores.paris.enabled').querySelector('.vye-comment')!.textContent).toBe('# live')
    expect(row(target, 'stores.paris.enabled').querySelector('.vye-hint')).toBeNull()
    expect(head('stores.paris.enabled').querySelector('.vye-bool')!.textContent).toBe('true')
    // The add buttons name the keys; the form names the titles
    expect(row(target, 'stores.paris').querySelector('[data-role="add:note"]')!.textContent).toBe('+ note')
  })

  it('a multi-line value: its row is aligned on top', () => {
    const { target } = mount({ mode: 'tree', schema: undefined, content: 'note: |\n  a\n  b\nn: 1\n' })
    expect(row(target, 'note').querySelector('.vye-entry-head')!.classList.contains('vye-entry-head-multiline')).toBe(true)
    expect(row(target, 'n').querySelector('.vye-entry-head')!.classList.contains('vye-entry-head-multiline')).toBe(false)
  })

  it('edits in place, through the same patches', () => {
    const { target, editor } = mount({ mode: 'tree', schema: undefined, content: 'a: 1 # one\nlist: [x, y]\n' })
    expect(row(target, 'list').querySelector('.vye-count')!.textContent).toBe('[2]')
    change(row(target, 'a').querySelector<HTMLInputElement>('[data-role="value"]')!, '2')
    change(row(target, 'list[1]').querySelector<HTMLInputElement>('[data-role="value"]')!, 'z')
    expect(editor.get()).toBe('a: 2 # one\nlist: [x, z]\n')
  })
})

describe('schema: choices, variants, read only', () => {
  const S: JsonSchema = {
    type: 'object',
    properties: {
      market: { title: 'Market', oneOf: [{ const: 'amazon:fr', title: 'Amazon France' }, { const: 'soko', title: 'Soko' }] },
      id: { type: 'string', readOnly: true },
      old: { type: 'string', deprecated: true },
      task: {
        type: 'object',
        discriminator: { propertyName: 'kind' },
        oneOf: [
          { title: 'Cron', properties: { kind: { const: 'cron' }, schedule: { type: 'string', examples: ['*/5 * * * *'] } }, required: ['schedule'] },
          { title: 'Export', properties: { kind: { const: 'export' }, target: { enum: ['s3', 'ftp'] } }, required: ['target'] },
        ],
      },
    },
  }
  const CONTENT2 = 'market: soko\nid: abc\nold: x\ntask:\n  kind: cron\n  schedule: ""\n'
  const options = (target: HTMLElement, path: string) => [...row(target, path).querySelectorAll('option')].map((o) => o.textContent)

  it('labels the choices: the title in the form, value and title in the tree', () => {
    const { target, editor } = mount({ schema: S, content: CONTENT2, translate: (t) => t.toUpperCase() })
    expect(editor.getMode()).toBe('form')
    expect(options(target, 'market')).toEqual(['AMAZON FRANCE', 'SOKO'])
    editor.setMode('tree')
    expect(options(target, 'market')).toEqual(['amazon:fr — AMAZON FRANCE', 'soko — SOKO'])
    change(row(target, 'market').querySelector('select')!, '0')
    expect(editor.get()).toContain('market: amazon:fr\n')
  })

  it('a readOnly field: disabled, not removable, not renamable', () => {
    const { target } = mount({ schema: S, content: CONTENT2 })
    expect(row(target, 'id').querySelector<HTMLInputElement>('[data-role="value"]')!.disabled).toBe(true)
    expect(row(target, 'id').querySelector('.vye-remove')).toBeNull()
    expect(row(target, 'old').querySelector('.vye-remove')).not.toBeNull()
  })

  it('deprecated: struck through and a warning; examples as a placeholder', () => {
    const { target, editor } = mount({ schema: S, content: CONTENT2 })
    expect(row(target, 'old').querySelector('.vye-key')!.classList.contains('vye-deprecated')).toBe(true)
    expect(editor.status().problems).toContainEqual({ path: ['old'], message: '"old" is deprecated', severity: 'warning' })
    expect(row(target, 'task.schedule').querySelector<HTMLInputElement>('[data-role="value"]')!.placeholder).toBe('*/5 * * * *')
  })

  it('switching the discriminator switches the fields', () => {
    const { target, editor } = mount({ schema: S, content: CONTENT2 })
    expect(options(target, 'task.kind')).toEqual(['Cron', 'Export'])
    // The field keeps its own label (its key here); the branch's title names the variant only
    expect(row(target, 'task').querySelector('.vye-key')!.textContent).toBe('task')
    change(row(target, 'task.kind').querySelector('select')!, '1')
    expect(editor.get()).toContain('  kind: export\n')
    // The export branch now: target is required and offered, schedule is not declared any more
    expect(editor.status().problems.map((p) => p.message)).toContain('"target" is required')
    expect(row(target, 'task').querySelector('[data-role="add:target"]')).not.toBeNull()
    expect(row(target, 'task').querySelector('[data-role="add:schedule"]')).toBeNull()
  })
})

describe('warnings', () => {
  it('flags a key that is valid but likely a typo, without blocking', () => {
    const { target, editor } = mount({ schema: undefined, content: 'truc ::\nok: 1\n" x": 2\n' })
    const problems = editor.status().problems
    expect(problems).toEqual([
      { path: ['truc :'], message: 'The key is "truc :": did you mean "truc:"?', severity: 'warning' },
      { path: [' x'], message: 'The key " x" starts or ends with a space', severity: 'warning' },
    ])
    expect(editor.getMode()).toBe('tree')
    const row = target.querySelector<HTMLElement>('[data-path="truc :"]')!
    expect(row.classList.contains('vye-warned')).toBe(true)
    expect(row.classList.contains('vye-invalid')).toBe(false)
    expect(row.querySelector('.vye-problem-warning')!.textContent).toBe(problems[0].message)
    expect(target.querySelector('.vye-status')!.textContent).toBe('2 warnings')
    expect(target.querySelector('.vye-status')!.classList.contains('vye-status-warning')).toBe(true)
  })

  it('leaves real colons alone, and can be turned off', () => {
    const { editor } = mount({ schema: undefined, content: 'a::b: 1\nurl: http://x\nlist:\n  - k: v\n' })
    expect(editor.status().problems).toEqual([])
    editor.update('truc ::\n')
    expect(editor.status().problems).toHaveLength(1)
    editor.updateProps({ lint: false })
    expect(editor.status().problems).toEqual([])
  })
})

describe('an empty document', () => {
  it('offers to start it instead of a null field, in tree and form', () => {
    const { target, editor } = mount({ schema: undefined, content: '' })
    expect(target.querySelector('[data-role="value"]')).toBeNull()
    expect(target.querySelector('.vye-empty')!.textContent).toBe('(empty)')
    const input = target.querySelector<HTMLInputElement>('.vye-new-key')!
    input.value = 'name'
    target.querySelector<HTMLButtonElement>('[data-role="add-key"]')!.click()
    expect(editor.get()).toBe('name: ""\n')
    editor.set('')
    editor.setMode('form')
    target.querySelector<HTMLButtonElement>('[data-role="add"]')!.click()
    expect(editor.get()).toBe('- ""\n')
  })

  it('keeps the comments of a document that has nothing else', () => {
    const { target, editor } = mount({ schema: undefined, content: '# settings\n' })
    target.querySelector<HTMLInputElement>('.vye-new-key')!.value = 'a'
    target.querySelector<HTMLButtonElement>('[data-role="add-key"]')!.click()
    expect(editor.get()).toBe('# settings\na: ""\n')
  })

  it('a schema for a map: its properties to add, by key in the tree', () => {
    const { target } = mount({ content: '', mode: 'tree' })
    const add = target.querySelector<HTMLButtonElement>('[data-role="add:stores"]')!
    expect(add.textContent).toBe('+ stores')
    expect(target.querySelector('.vye-add-row [data-role="add"]')).toBeNull()
  })
})

describe('problem paths', () => {
  it('accepts string paths, and puts a missing entry on its parent', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    editor = createYamlEditor({ target, props: { content: CONTENT, problems: [{ path: 'stores.paris.skus[0]', message: 'needs a SKU' }, { path: '', message: 'whole file' }] } })
    expect(target.querySelector('[data-path="stores.paris"] .vye-problem')!.textContent).toBe('skus[0]: needs a SKU')
    expect(target.querySelector('.vye-problem-root')!.textContent).toBe('whole file')
    expect(editor.status().problems[0].path).toEqual(['stores', 'paris', 'skus', 0])
  })
})
