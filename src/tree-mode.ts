/**
 * The tree and form modes: the document as nested entries, in two looks.
 *
 * - tree: technical, close to the YAML itself: the real keys, `key: value` on
 *   one line, values coloured by type and edited in place, `{n}` / `[n]` on the
 *   collections, comments as `# …` on the line.
 * - form: a form: schema titles as labels, help under each field, framed inputs.
 *
 * The schema, when there is one, gives each value its control (select for an
 * enum, checkbox, number with bounds, text or textarea); without one the
 * values' own types do. Every gesture is an edit of the text (see model.ts), so
 * comments and formatting stay.
 */
import { addItem, addKey, commentAt, cssPath, deleteAt, isAliasAt, pathKey, renameKey, setValue, type ParsedYaml, type YamlPath } from './model'
import { defaultFor, schemaAt, typesOf, valueType, type JsonSchema, type JsonSchemaType } from './schema'

export interface TreeLabels {
  addItem: string
  addKey: string
  newKey: string
  remove: string
  rename: string
  empty: string
  alias: string
  count: (n: number) => string
}

export type TreeVariant = 'tree' | 'form'

export interface TreeContext {
  variant: TreeVariant
  parsed: ParsedYaml
  schema?: JsonSchema
  /** Problem messages by path key. */
  problems: Map<string, string[]>
  readOnly: boolean
  labels: TreeLabels
  /** Turn a schema `title` into the text shown (i18n tokens). */
  translate: (text: string) => string
  /** Apply an edit to the current text. */
  edit: (change: (text: string) => string) => void
}

type Attrs = Record<string, string | boolean | number | undefined>

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, attrs: Attrs = {}, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue
    node.setAttribute(k, v === true ? '' : String(v))
  }
  if (text !== undefined) node.textContent = text
  return node
}

/** An input as wide as its text (or its placeholder), following the typing. */
function fitWidth(input: HTMLInputElement) {
  const fit = () => (input.style.width = `calc(${Math.max((input.value || input.placeholder).length, 1)}ch + 0.6rem)`)
  fit()
  input.addEventListener('input', fit)
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const isCollection = (v: unknown) => v !== null && typeof v === 'object'

/** Default depth shown open; deeper collections start folded. */
const OPEN_DEPTH = 4

export class TreeMode {
  readonly root: HTMLElement
  private ctx!: TreeContext
  /** Folding the user chose, by path key: true = open. */
  private open = new Map<string, boolean>()

  constructor(parent: HTMLElement) {
    this.root = el('div', 'vye-tree', { role: 'tree' })
    parent.appendChild(this.root)
  }

  render(ctx: TreeContext): void {
    this.ctx = ctx
    this.root.className = `vye-tree vye-view-${ctx.variant}`
    // Keep the focus on the same control across the redraw
    const active = document.activeElement as HTMLElement | null
    const focus = active && this.root.contains(active) ? { path: active.closest<HTMLElement>('[data-path]')?.dataset.path, role: active.dataset.role } : null

    this.root.replaceChildren()
    // Problems on the document itself
    for (const message of ctx.problems.get('') ?? []) this.root.appendChild(el('div', 'vye-problem vye-problem-root', { role: 'alert' }, message))
    const value = ctx.parsed.value
    if (ctx.parsed.doc.contents == null) {
      // An empty document (or only comments): a way to start it, not a `null` field
      this.root.appendChild(this.renderEmpty(schemaAt(ctx.schema, [])))
    } else if (isCollection(value)) {
      this.root.appendChild(this.renderChildren(value, [], schemaAt(ctx.schema, [])))
    } else {
      this.root.appendChild(this.renderEntry(null, value, [], schemaAt(ctx.schema, []), false))
    }

    if (focus?.path !== undefined) {
      const row = this.root.querySelector<HTMLElement>(`[data-path="${cssPath(focus.path)}"]`)
      row?.querySelector<HTMLElement>(focus.role ? `[data-role="${focus.role}"]` : 'input, select, textarea, button')?.focus()
    }
  }

  private renderChildren(value: unknown, path: YamlPath, schema: JsonSchema | undefined): HTMLElement {
    const list = el('div', 'vye-children', { role: 'group' })
    const { readOnly, labels } = this.ctx
    if (Array.isArray(value)) {
      value.forEach((item, i) => list.appendChild(this.renderEntry(i, item, [...path, i], schemaAt(this.ctx.schema, [...path, i]), !readOnly)))
      if (!readOnly && (schema?.maxItems === undefined || value.length < schema.maxItems)) {
        const add = el('button', 'vye-add', { type: 'button', 'data-role': 'add' }, `+ ${labels.addItem}`)
        add.addEventListener('click', () => this.ctx.edit((t) => addItem(t, path, defaultFor(schema?.items, this.ctx.schema))))
        list.appendChild(el('div', 'vye-add-row', { 'data-path': pathKey(path) })).appendChild(add)
      }
    } else if (isObject(value)) {
      const required = new Set(schema?.required ?? [])
      for (const [key, item] of Object.entries(value)) {
        const declared = !!schema?.properties?.[key]
        const child = schemaAt(this.ctx.schema, [...path, key])
        list.appendChild(this.renderEntry(key, item, [...path, key], child, !readOnly && !required.has(key), !declared && !readOnly))
      }
      if (!readOnly) list.appendChild(this.renderAddKey(value, path, schema))
    }
    if (!list.children.length) list.appendChild(el('div', 'vye-empty', {}, labels.empty))
    return list
  }

  /** An empty document: start a map (keys) or, when the schema wants one, a list. */
  private renderEmpty(schema: JsonSchema | undefined): HTMLElement {
    const list = el('div', 'vye-children', { role: 'group' })
    list.appendChild(el('div', 'vye-empty', {}, this.ctx.labels.empty))
    if (this.ctx.readOnly) return list
    const types = typesOf(schema)
    if (!types.length || types.includes('object')) list.appendChild(this.renderAddKey({}, [], schema))
    if (!types.length || types.includes('array')) {
      const add = el('button', 'vye-add', { type: 'button', 'data-role': 'add' }, `+ ${this.ctx.labels.addItem}`)
      add.addEventListener('click', () => this.ctx.edit((t) => addItem(t, [], defaultFor(schema?.items, this.ctx.schema))))
      list.appendChild(el('div', 'vye-add-row', { 'data-path': '' })).appendChild(add)
    }
    return list
  }

  /** The schema's missing properties as buttons, and a free key field when other keys are allowed. */
  private renderAddKey(value: Record<string, unknown>, path: YamlPath, schema: JsonSchema | undefined): HTMLElement {
    const row = el('div', 'vye-add-row', { 'data-path': pathKey(path) })
    for (const [key, prop] of Object.entries(schema?.properties ?? {})) {
      if (key in value) continue
      // tree: the key itself, its title on hover; form: the title
      const title = this.ctx.translate(prop.title ?? key)
      const technical = this.ctx.variant === 'tree'
      const btn = el('button', 'vye-add', { type: 'button', 'data-role': `add:${key}`, title: technical && title !== key ? title : undefined }, `+ ${technical ? key : title}`)
      btn.addEventListener('click', () => this.ctx.edit((t) => addKey(t, path, key, defaultFor(prop, this.ctx.schema))))
      row.appendChild(btn)
    }
    // A free key: where the schema allows other keys (explicitly, when it declares properties)
    const extra = schema?.additionalProperties
    const freeKeys = schema?.properties ? extra === true || typeof extra === 'object' : extra !== false
    if (freeKeys) {
      const input = el('input', 'vye-new-key', { type: 'text', placeholder: this.ctx.labels.newKey, 'aria-label': this.ctx.labels.newKey, 'data-role': 'new-key' })
      const btn = el('button', 'vye-add', { type: 'button', 'data-role': 'add-key' }, `+ ${this.ctx.labels.addKey}`)
      const add = () => {
        const key = input.value.trim()
        if (!key || key in value) return input.focus()
        this.ctx.edit((t) => addKey(t, path, key, defaultFor(typeof extra === 'object' ? extra : undefined, this.ctx.schema)))
      }
      btn.addEventListener('click', add)
      input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), add()))
      row.append(input, btn)
    }
    return row
  }

  private renderEntry(key: string | number | null, value: unknown, path: YamlPath, schema: JsonSchema | undefined, removable: boolean, renamable = false): HTMLElement {
    const { problems, labels, translate, parsed } = this.ctx
    const id = pathKey(path)
    const messages = problems.get(id) ?? []
    const row = el('div', `vye-entry${messages.length ? ' vye-invalid' : ''}`, { 'data-path': id, role: 'treeitem' })
    const head = el('div', 'vye-entry-head')
    row.appendChild(head)

    const collection = isCollection(value)
    const isOpen = this.open.get(id) ?? path.length < OPEN_DEPTH
    if (collection) {
      row.setAttribute('aria-expanded', String(isOpen))
      const toggle = el('button', 'vye-toggle', { type: 'button', 'aria-label': String(key ?? ''), 'data-role': 'toggle' }, isOpen ? '▾' : '▸')
      toggle.addEventListener('click', () => {
        this.open.set(id, !isOpen)
        this.render(this.ctx)
      })
      head.appendChild(toggle)
    }

    const technical = this.ctx.variant === 'tree'
    if (technical && !collection) head.appendChild(el('span', 'vye-toggle-space'))

    if (key !== null) {
      if (renamable && typeof key === 'string') {
        const input = el('input', 'vye-key vye-key-input', { type: 'text', value: key, 'aria-label': labels.rename, 'data-role': 'key' })
        input.addEventListener('change', () => {
          const next = input.value.trim()
          if (!next || next === key) return void (input.value = key)
          this.ctx.edit((t) => renameKey(t, path.slice(0, -1), key, next))
        })
        if (technical) fitWidth(input)
        head.appendChild(input)
      } else if (technical) {
        // The real key; the schema's title and help on hover
        const help = [schema?.title, schema?.description].filter(Boolean).map((t) => translate(t!)).join(' — ')
        head.appendChild(el('span', `vye-key${typeof key === 'number' ? ' vye-index' : ''}`, { title: help || undefined }, String(key)))
      } else {
        const text = typeof key === 'number' ? `${key}` : translate(schema?.title ?? key)
        head.appendChild(el('span', `vye-key${typeof key === 'number' ? ' vye-index' : ''}`, { title: typeof key === 'string' ? key : undefined }, text))
      }
      if (technical) head.appendChild(el('span', 'vye-colon', {}, ':'))
    }

    if (isAliasAt(parsed.doc, path)) {
      head.appendChild(el('span', 'vye-alias', { title: labels.alias }, JSON.stringify(value)))
    } else if (collection) {
      const count = Array.isArray(value) ? value.length : Object.keys(value as object).length
      const summary = technical ? (Array.isArray(value) ? `[${count}]` : `{${count}}`) : labels.count(count)
      head.appendChild(el('span', 'vye-count', { title: technical ? labels.count(count) : undefined }, summary))
    } else {
      head.appendChild(this.renderControl(value, path, schema))
    }

    if (removable) {
      const remove = el('button', 'vye-remove', { type: 'button', 'aria-label': labels.remove, title: labels.remove, 'data-role': 'remove' }, '×')
      remove.addEventListener('click', () => this.ctx.edit((t) => deleteAt(t, path)))
      head.appendChild(remove)
    }

    const comment = commentAt(parsed.doc, path)
    if (technical) {
      // Before the remove button, which sits at the end of the line
      if (comment) head.insertBefore(el('span', 'vye-comment', {}, comment.split('\n').map((line) => `# ${line}`).join(' ')), head.querySelector('.vye-remove'))
    } else {
      const hint = [schema?.description ? translate(schema.description) : null, comment].filter(Boolean).join(' — ')
      if (hint) row.appendChild(el('div', 'vye-hint', {}, hint))
    }
    for (const message of messages) row.appendChild(el('div', 'vye-problem', { role: 'alert' }, message))

    if (collection && isOpen && !isAliasAt(parsed.doc, path)) row.appendChild(this.renderChildren(value, path, schema))
    return row
  }

  /** The input for a scalar: from the schema, else from the value's type. */
  private renderControl(value: unknown, path: YamlPath, schema: JsonSchema | undefined): HTMLElement {
    const readOnly = this.ctx.readOnly || !!schema?.readOnly
    const set = (v: unknown) => this.ctx.edit((t) => setValue(t, path, v))
    const types = typesOf(schema)
    const nullable = types.includes('null')
    const type: JsonSchemaType = types.find((t) => t !== 'null') ?? (value === null && !types.length ? 'string' : valueType(value))

    if (schema?.enum) {
      const select = el('select', 'vye-input vye-select', { disabled: readOnly, 'data-role': 'value' })
      const current = JSON.stringify(value)
      schema.enum.forEach((option, i) => {
        const opt = el('option', undefined, { value: String(i) }, option === null ? 'null' : String(option))
        if (JSON.stringify(option) === current) opt.selected = true
        select.appendChild(opt)
      })
      if (!schema.enum.some((o) => JSON.stringify(o) === current)) {
        const opt = el('option', undefined, { value: '', disabled: true }, String(value))
        opt.selected = true
        select.prepend(opt)
      }
      select.addEventListener('change', () => select.value !== '' && set(schema.enum![Number(select.value)]))
      if (this.ctx.variant === 'tree') select.classList.add(`vye-t-${value === null ? 'null' : valueType(value)}`)
      return select
    }

    if (type === 'boolean') {
      const box = el('input', 'vye-input vye-checkbox', { type: 'checkbox', disabled: readOnly, 'data-role': 'value' })
      box.checked = value === true
      box.addEventListener('change', () => set(box.checked))
      if (this.ctx.variant === 'form') return box
      // tree: the value written next to its box
      const label = el('label', 'vye-bool')
      label.append(box, el('span', `vye-t-${value === null ? 'null' : 'boolean'}`, {}, String(value)))
      return label
    }

    if (type === 'number' || type === 'integer') {
      const input = el('input', 'vye-input vye-number', {
        type: 'number',
        value: value === null || value === undefined ? '' : String(value),
        min: schema?.minimum,
        max: schema?.maximum,
        step: schema?.multipleOf ?? (type === 'integer' ? 1 : 'any'),
        disabled: readOnly,
        placeholder: nullable ? 'null' : undefined,
        'data-role': 'value',
      })
      input.addEventListener('change', () => {
        if (input.value.trim() === '') return nullable ? set(null) : void (input.value = String(value ?? ''))
        const n = Number(input.value)
        if (Number.isFinite(n)) set(type === 'integer' ? Math.trunc(n) : n)
      })
      return this.typed(input, value === null ? 'null' : 'number')
    }

    const text = value === null || value === undefined ? '' : String(value)
    const multiline = schema?.format === 'textarea' || text.includes('\n')
    const input = multiline
      ? el('textarea', 'vye-input vye-textarea', { rows: Math.min(Math.max(text.split('\n').length, 2), 12), disabled: readOnly, 'data-role': 'value' })
      : el('input', 'vye-input vye-string', { type: 'text', disabled: readOnly, placeholder: value === null ? 'null' : undefined, 'data-role': 'value' })
    input.value = text
    input.addEventListener('change', () => {
      if (input.value === '' && (nullable || (value === null && !types.length))) return set(null)
      set(input.value)
    })
    return this.typed(input, value === null ? 'null' : 'string')
  }

  /** tree: the value coloured by its type, and an input as wide as its text. */
  private typed(input: HTMLInputElement | HTMLTextAreaElement, type: string): HTMLElement {
    if (this.ctx.variant === 'form') return input
    input.classList.add(`vye-t-${type}`)
    if (input instanceof HTMLInputElement) fitWidth(input)
    return input
  }

  destroy(): void {
    this.root.remove()
  }
}
