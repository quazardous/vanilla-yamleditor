[README](../README.md) · [Editor](editor.md) · [Schema](schema.md) · [Diff](diff.md) · [Scripting](scripting.md) · [Theming](theming.md) · [Linked views](linked-views.md)

# The editor

`createYamlEditor({ target, props })` mounts the editor in `target`: a bar (the view buttons and a status) above one of the three views, text, tree or form, on one YAML text.

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

The API follows [vanilla-jsoneditor](https://github.com/josdejong/svelte-jsoneditor): `get()`, `set(content)` (a new document, undo starts over), `update(content)` (an edit, undo keeps it), `updateProps(props)`, `getMode()`, `setMode(mode)`, `getModes()`, `canSetMode(mode)`, `status()`, `revealPath(path)`, `focus()`, `destroy()`.

## Views

- **text**: CodeMirror 6 with YAML colouring, folding, and errors at their line;
- **tree**: the document as YAML-like nested lines: `key: value`, values coloured by type and edited in place, chevrons to fold, `{n}` / `[n]` on the collections, comments on their line;
- **form**: the document as a form, with a labelled control per value (checkbox, select, number with bounds, text), the schema's titles and help.

Both the tree and the form take their controls from a JSON Schema when you give one: labelled choices, variants, read-only and deprecated fields (see [Schema](schema.md)). Their edits **keep the file as it was written**: comments, blank lines, key order, quoting and indentation. Each edit patches only the text of the value it changes, so a configuration file reviewed in git shows a one-line diff for a one-field change.

For several views of the same document at once, in elements of your own, see [Advanced: linked views](linked-views.md).

## Props

| Prop | |
|---|---|
| `content` | the YAML text |
| `mode` | the view to start in: `'text'`, `'tree'` or `'form'`; default: form with a schema, tree without (among `modes`), text while the text does not parse |
| `modes` | the views offered, in the order of their buttons, such as `['text', 'form']` (default all three) |
| `schema` | a JSON Schema, see below: the tree and form controls and the built-in validation |
| `validator` | `(value, parsed) => [{ path, message }]`: extra checks |
| `problems` | `[{ path, message, severity? }]` found elsewhere (a server check), shown like the others |
| `lint` | warn on valid YAML that is likely a typo (default `true`), see below |
| `readOnly` | no editing in any mode |
| `mainMenuBar` | show the bar: mode buttons and status (default `true`) |
| `modeSwitch` | show the mode buttons in the bar (default `true`; hidden anyway with a single mode) |
| `labels` | the interface texts, to translate |
| `schemaMessages` | the validation messages, to translate |
| `translate` | `(text) => text`: applied to the schema's `title` and `description`, so they can be i18n tokens |
| `onChange` | `(text, status)` after each edit by the user |
| `onChangeMode` | `(mode)` |
| `onError` | `(error)`: a refused edit, such as renaming a key to one that exists |

Besides syntax errors, the editor warns (`severity: 'warning'`, in `status().problems`, never blocking) on valid YAML that was hardly meant: `port :: 8080` is the key `port :`, since a `:` only ends a key before a space or the end of the line; a quoted key with spaces around it. The messages are in `labels` (`colonKey`, `spacedKey`).

Switching to the tree or form mode is refused while the text has syntax errors: the editor stays on the text and shows them. A text that stops parsing (an `update()` from the host, say) shows as text, even when `modes` does not offer it, since that is the only way to fix it; once it parses, the editor goes back to an offered view.

**Your own buttons.** With `modeSwitch: false` (or `mainMenuBar: false` for no bar at all), drive the views from the host: `getModes()` lists the ones offered, `canSetMode(mode)` says whether one can be shown now (refused: a mode not offered, or tree / form while the text does not parse), `setMode(mode)` shows it, `onChangeMode` tells when it changed, and `onChange` gives the syntax errors with each edit.

```js
const editor = createYamlEditor({ target, props: { content, schema, modes: ['form', 'text'], modeSwitch: false } })
formButton.onclick = () => editor.setMode('form')
textButton.onclick = () => editor.setMode('text')
```
