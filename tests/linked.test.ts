import { describe, it, expect, vi, afterEach } from 'vitest'
import { createYamlDocument, createYamlEditor, mountFormView, mountTextView, mountTreeView, type JsonSchema } from '../src/index'

const CONTENT = `# stores
stores:
  paris:
    enabled: true   # live
    min_stock: 3
`
const SCHEMA: JsonSchema = {
  type: 'object',
  properties: { stores: { type: 'object', additionalProperties: { type: 'object', properties: { enabled: { type: 'boolean', title: 'Enabled' }, min_stock: { type: 'integer', minimum: 0, title: 'Minimum stock' } } } } },
}

afterEach(() => document.body.replaceChildren())

function div() {
  const d = document.createElement('div')
  document.body.appendChild(d)
  return d
}
const row = (target: HTMLElement, path: string) => target.querySelector<HTMLElement>(`[data-path="${path}"]`)!
function change(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('change'))
}
const cmText = (target: HTMLElement) => target.querySelector('.cm-content')!.textContent

describe('linked views', () => {
  it('a text and a form on one document, in two places, in step', () => {
    const onChange = vi.fn()
    const doc = createYamlDocument({ content: CONTENT, schema: SCHEMA, onChange })
    const left = div()
    const right = div()
    const text = mountTextView(doc, left)
    const form = mountFormView(doc, right)
    expect(left.querySelector('.vye.vye-view .vye-text')).not.toBeNull()
    expect(right.querySelector('.vye-tree.vye-view-form')).not.toBeNull()
    // An edit in the form: the text follows, comments kept, onChange told
    change(row(right, 'stores.paris.min_stock').querySelector('input')!, '7')
    expect(doc.get()).toBe(CONTENT.replace('min_stock: 3', 'min_stock: 7'))
    expect(cmText(left)).toContain('min_stock: 7')
    expect(cmText(left)).toContain('# live')
    expect(onChange).toHaveBeenCalledOnce()
    // The host replaces the text: both views follow
    doc.update(CONTENT.replace('enabled: true', 'enabled: false'))
    expect(row(right, 'stores.paris.enabled').querySelector<HTMLInputElement>('input')!.checked).toBe(false)
    expect(cmText(left)).toContain('enabled: false')
    text.destroy()
    form.destroy()
  })

  it('a tree or form view says so while the text does not parse, then comes back', () => {
    const doc = createYamlDocument({ content: CONTENT })
    const target = div()
    mountTreeView(doc, target)
    doc.update('stores: [1\n')
    expect(target.querySelector<HTMLElement>('.vye-unparsable')!.hidden).toBe(false)
    expect(target.querySelector('.vye-unparsable')!.textContent).toMatch(/does not parse \(1 syntax error/)
    expect(target.querySelector<HTMLElement>('.vye-tree')!.hidden).toBe(true)
    doc.update(CONTENT)
    expect(target.querySelector<HTMLElement>('.vye-unparsable')!.hidden).toBe(true)
    expect(row(target, 'stores.paris.min_stock')).not.toBeNull()
  })

  it('destroying a view leaves the document and the other views', () => {
    const doc = createYamlDocument({ content: CONTENT })
    const a = div()
    const b = div()
    const tree = mountTreeView(doc, a)
    mountTreeView(doc, b)
    tree.destroy()
    expect(a.children.length).toBe(0)
    doc.update(CONTENT.replace('min_stock: 3', 'min_stock: 9'))
    expect(row(b, 'stores.paris.min_stock').querySelector<HTMLInputElement>('[data-role="value"]')!.value).toBe('9')
  })

  it("an editor's document takes more views", () => {
    const main = div()
    const side = div()
    const editor = createYamlEditor({ target: main, props: { content: CONTENT, schema: SCHEMA } })
    mountTextView(editor.document, side)
    change(row(main, 'stores.paris.min_stock').querySelector('input')!, '5')
    expect(cmText(side)).toContain('min_stock: 5')
    // And the other way: a host edit through the document shows in the editor
    editor.document.update(CONTENT.replace('min_stock: 3', 'min_stock: 8'))
    expect(row(main, 'stores.paris.min_stock').querySelector('input')!.value).toBe('8')
    expect(editor.get()).toContain('min_stock: 8')
    editor.destroy()
  })

  it('readOnly per view', () => {
    const doc = createYamlDocument({ content: CONTENT, schema: SCHEMA })
    const a = div()
    const b = div()
    mountFormView(doc, a, { readOnly: true })
    mountFormView(doc, b)
    expect(row(a, 'stores.paris.min_stock').querySelector('input')!.disabled).toBe(true)
    expect(row(b, 'stores.paris.min_stock').querySelector('input')!.disabled).toBe(false)
  })
})
