# <img src="docs/logo.svg" alt="" width="40" align="center"> vanilla-yamleditor

[![demo](https://img.shields.io/badge/demo-yamleditor.davidberlioz.net-3b82f6)](https://yamleditor.davidberlioz.net)

A YAML editor for the browser, without a framework. It has three modes:

- **text**: CodeMirror 6 with YAML colouring, folding, and errors at their line;
- **tree**: the document as YAML-like nested lines: `key: value`, values coloured by type and edited in place, chevrons to fold, `{n}` / `[n]` on the collections, comments on their line;
- **form**: the document as a form, with a labelled control per value (checkbox, select, number with bounds, text), the schema's titles and help.

Both the tree and the form take their controls from a JSON Schema when you give one. Their edits **keep the file as it was written**: comments, blank lines, key order, quoting and indentation. Each edit patches only the text of the value it changes, so a configuration file reviewed in git shows a one-line diff for a one-field change.

```sh
npm install https://github.com/quazardous/vanilla-yamleditor/releases/download/v0.2.1/quazardous-vanilla-yamleditor-0.2.1.tgz
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
| `readOnly` | no editing in any mode |
| `mainMenuBar` | show the mode switch (default `true`) |
| `labels` | the interface texts, to translate |
| `schemaMessages` | the validation messages, to translate |
| `translate` | `(text) => text`: applied to the schema's `title` and `description`, so they can be i18n tokens |
| `onChange` | `(text, status)` after each edit by the user |
| `onChangeMode` | `(mode)` |
| `onError` | `(error)`: a refused edit, such as renaming a key to one that exists |

Switching to the tree or form mode is refused while the text has syntax errors: the editor stays on the text and shows them.

## Schema

A subset of JSON Schema, enough for configuration files:

- `type` (one or a list, `'null'` included), `enum`, `const`, `default`;
- `title` and `description`, which become the label and the help (in the tree: a tooltip on the key);
- `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`;
- `minLength`, `maxLength`, `pattern`, and `format: 'textarea'`;
- `properties`, `required` and `additionalProperties`. A schema here turns the map into a table of free keys;
- `items`, `minItems`, `maxItems`;
- local `$ref` (`#/$defs/…`, `#/definitions/…`).

In the tree and the form, a declared property that is missing shows as an "add" button. A required property cannot be removed. A new entry starts from its `default`, or from an empty value of its type that includes its required keys. To get a full validator (Ajv…), pass it as `validator`.

Comments written in the file show under their field as help, next to the schema's `description`.

## Editing without the UI

The text edits are exported, so a script can change a file the same way:

```js
import { setValue, addKey, addItem, deleteAt, renameKey, parseYaml } from '@quazardous/vanilla-yamleditor'

let text = setValue(text, ['filters', 'paris', 'min_stock'], 5)
text = addKey(text, ['filters'], 'nice', { enabled: true })
```

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
