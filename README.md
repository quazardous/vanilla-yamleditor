# <img src="docs/logo.svg" alt="" width="40" align="center"> vanilla-yamleditor

[![demo](https://img.shields.io/badge/demo-yamleditor.davidberlioz.net-3b82f6)](https://yamleditor.davidberlioz.net)

A YAML editor for the browser, without a framework. It has three modes:

- **text**: CodeMirror 6 with YAML colouring, folding, and errors at their line;
- **tree**: the document as YAML-like nested lines: `key: value`, values coloured by type and edited in place, chevrons to fold, `{n}` / `[n]` on the collections, comments on their line;
- **form**: the document as a form, with a labelled control per value (checkbox, select, number with bounds, text), the schema's titles and help.

Both the tree and the form take their controls from a JSON Schema when you give one. Their edits **keep the file as it was written**: comments, blank lines, key order, quoting and indentation. Each edit patches only the text of the value it changes, so a configuration file reviewed in git shows a one-line diff for a one-field change.

```sh
npm install https://github.com/quazardous/vanilla-yamleditor/releases/download/v0.5.1/quazardous-vanilla-yamleditor-0.5.1.tgz
```

Each [GitHub Release](https://github.com/quazardous/vanilla-yamleditor/releases) carries the package tarball, built and ready.

```js
import { createYamlEditor } from '@quazardous/vanilla-yamleditor'
import '@quazardous/vanilla-yamleditor/styles.css'

const editor = createYamlEditor({
  target: document.getElementById('editor'),
  props: {
    content: yamlText,
    schema, // optional JSON Schema
    onChange: (text, { value, syntaxErrors, problems }) => save(text),
  },
})
```

The API follows [vanilla-jsoneditor](https://github.com/josdejong/svelte-jsoneditor): `get()`, `set(content)` (a new document, undo starts over), `update(content)` (an edit, undo keeps it), `updateProps(props)`, `getMode()`, `setMode(mode)`, `status()`, `revealPath(path)`, `focus()`, `destroy()`.

## Props

| Prop | |
|---|---|
| `content` | the YAML text |
| `mode` | `'text'`, `'tree'` or `'form'`; default: form with a schema, tree without, text while the text does not parse |
| `schema` | a JSON Schema, see below: the tree and form controls and the built-in validation |
| `validator` | `(value, parsed) => [{ path, message }]`: extra checks |
| `problems` | `[{ path, message, severity? }]` found elsewhere (a server check), shown like the others |
| `lint` | warn on valid YAML that is likely a typo (default `true`), see below |
| `readOnly` | no editing in any mode |
| `mainMenuBar` | show the mode switch (default `true`) |
| `labels` | the interface texts, to translate |
| `schemaMessages` | the validation messages, to translate |
| `translate` | `(text) => text`: applied to the schema's `title` and `description`, so they can be i18n tokens |
| `onChange` | `(text, status)` after each edit by the user |
| `onChangeMode` | `(mode)` |
| `onError` | `(error)`: a refused edit, such as renaming a key to one that exists |

Besides syntax errors, the editor warns (`severity: 'warning'`, in `status().problems`, never blocking) on valid YAML that was hardly meant: `port :: 8080` is the key `port :`, since a `:` only ends a key before a space or the end of the line; a quoted key with spaces around it. The messages are in `labels` (`colonKey`, `spacedKey`).

Switching to the tree or form mode is refused while the text has syntax errors: the editor stays on the text and shows them.

## Schema

A subset of JSON Schema, enough for configuration files:

- `type` (one or a list, `'null'` included), `enum`, `const`, `default`;
- `title` and `description`, which become the label and the help (in the tree: a tooltip on the key);
- `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`;
- `minLength`, `maxLength`, `pattern`, and `format: 'textarea'`;
- `properties`, `required` and `additionalProperties`. A schema here turns the map into a table of free keys;
- `items`, `minItems`, `maxItems`;
- `readOnly` (the value is shown, not editable, and the entry cannot be removed or renamed; it applies below it too), `deprecated` (struck through, and a warning while the entry is there), `examples` (the first one as the input's placeholder);
- local `$ref` (`#/$defs/…`, `#/definitions/…`).

**Labelled choices.** A select shows the values of an `enum`, or of a `oneOf` (or `anyOf`) of `const`s with their `title`s, which go through `translate`:

```js
{ oneOf: [{ const: 'amazon:fr', title: 'Amazon France' }, { const: 'soko', title: 'Soko' }] }
{ enum: ['amazon:fr', 'soko'], 'x-enumLabels': ['Amazon France', 'Soko'] } // the same
```

The form shows the titles; the tree shows `amazon:fr — Amazon France`.

**Variants.** `allOf` is merged. `if` / `then` / `else` applies the branch the value takes. A `oneOf` (or `anyOf`) of object schemas uses the branch named by a `discriminator`, as in OpenAPI, or else the first branch the value matches:

```js
{
  type: 'object',
  properties: { name: { type: 'string' } },
  discriminator: { propertyName: 'kind' },
  oneOf: [
    { title: 'Cron', properties: { kind: { const: 'cron' }, schedule: { type: 'string' } }, required: ['schedule'] },
    { title: 'Export', properties: { kind: { const: 'export' }, target: { enum: ['s3', 'ftp'] } }, required: ['target'] },
  ],
}
```

The discriminator becomes a select of the branches (by title); choosing another one shows that branch's fields. A new entry starts in the first branch, with its required keys.

In the tree and the form, a declared property that is missing shows as an "add" button. A required property cannot be removed. A new entry starts from its `default`, or from an empty value of its type that includes its required keys. To get a full validator (Ajv…), pass it as `validator`.

Comments written in the file show under their field as help, next to the schema's `description`.

## Editing without the UI

The text edits are exported, so a script can change a file the same way:

```js
import { setValue, addKey, addItem, deleteAt, renameKey, parseYaml } from '@quazardous/vanilla-yamleditor'

let text = setValue(text, ['filters', 'paris', 'min_stock'], 5)
text = addKey(text, ['filters'], 'nice', { enabled: true })
```

## Diff

`createYamlDiff` compares two YAML texts, side by side or unified, with the YAML colouring: added and removed lines, the words that changed in a line, long unchanged stretches folded. Above it, the **keys that changed** (`filters.paris.min_stock`), from the two parsed documents: a comment or a layout change shows in the lines, not in the keys. A click on a key shows it. Read only; for a review before saving, or a conflict.

```js
import { createYamlDiff } from '@quazardous/vanilla-yamleditor'

const diff = createYamlDiff({ target, props: { original: savedText, modified: editor.get() } })
diff.summary() // { identical, added, removed, changes, paths: [['filters', 'paris', 'min_stock']] }
```

| Prop | |
|---|---|
| `original`, `modified` | the two texts |
| `view` | `'split'` (default) or `'unified'` |
| `collapseUnchanged` | fold long unchanged stretches (default `true`) |
| `mainMenuBar` | the bar: views, previous / next change, summary, changed keys (default `true`) |
| `labels` | its texts, to translate |
| `onChangeView` | `(view)` |

Methods: `update({ original?, modified? })`, `updateProps(props)`, `summary()`, `next()`, `previous()`, `revealPath(path)`, `destroy()`. `changedPaths(a, b)` gives the changed keys of two plain values.

## Theming

The look is set by `--vye-*` CSS variables (colours, radius, fonts, syntax tokens), on `.vye` or any ancestor. `.vye-theme-dark` switches to the dark set.

## Development

```sh
npm install
npm run dev     # playground on http://localhost:5181
npm test
npm run build
```

MIT
