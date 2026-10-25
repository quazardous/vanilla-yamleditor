import { createYamlEditor, type JsonSchema } from '../src/index'
import '../src/styles.css'

const content = `# Availability filters, by store
filters:
  # Paris: the flagship
  paris:
    enabled: true   # live since March
    min_stock: 3
    channel: web
    tags: [summer, outlet]

  lyon:
    enabled: false
    min_stock: 1
    channel: store
    skus:
    - A1
    - "B2"
    note: 'it''s fine'
`

const schema: JsonSchema = {
  type: 'object',
  properties: {
    filters: {
      title: 'Filters',
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['enabled'],
        properties: {
          enabled: { type: 'boolean', title: 'Enabled' },
          min_stock: { type: 'integer', title: 'Minimum stock', minimum: 0, maximum: 1000, description: 'Units kept back' },
          channel: { enum: ['web', 'store', 'both'], title: 'Channel' },
          tags: { type: 'array', items: { type: 'string', minLength: 2 }, title: 'Tags' },
          skus: { type: 'array', items: { type: 'string', pattern: '^[A-Z][0-9]+$' }, title: 'SKUs' },
          note: { type: 'string', title: 'Note', format: 'textarea' },
        },
        additionalProperties: false,
      },
    },
  },
}

const out = document.getElementById('out')!
const target = document.getElementById('editor')!
const editor = createYamlEditor({
  target,
  props: {
    content,
    schema,
    onChange: (text, status) => {
      out.textContent = `${text}\n---\n${JSON.stringify({ syntaxErrors: status.syntaxErrors.length, problems: status.problems }, null, 2)}`
    },
  },
})
;(window as unknown as { editor: typeof editor }).editor = editor
out.textContent = editor.get()

document.getElementById('readonly')!.addEventListener('change', (e) => editor.updateProps({ readOnly: (e.target as HTMLInputElement).checked }))
document.getElementById('dark')!.addEventListener('change', (e) => {
  const on = (e.target as HTMLInputElement).checked
  document.body.classList.toggle('theme-dark', on)
  target.classList.toggle('vye-theme-dark', on)
})
document.getElementById('problem')!.addEventListener('click', () =>
  editor.updateProps({ problems: [{ path: ['filters', 'lyon', 'channel'], message: 'Server: no store channel for Lyon this week' }] })
)
