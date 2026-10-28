[README](../README.md) · [Editor](editor.md) · [Schema](schema.md) · [Diff](diff.md) · [Scripting](scripting.md) · [Theming](theming.md) · [Linked views](linked-views.md)

# Advanced: linked views

`createYamlEditor` is the way in: one element, a bar, one view at a time. When a page needs **several views of the same document at once**, in places of its own (the text in a side panel and the form in the main one, say), build them from the two pieces the editor is made of:

- **a document**, `createYamlDocument`: the text, its reading, its problems, the edits; no UI;
- **views**, `mountTextView`, `mountTreeView`, `mountFormView`: each one draws the document in an element of your choice, edits it, and follows every change.

```js
import { createYamlDocument, mountTextView, mountFormView } from '@quazardous/vanilla-yamleditor'
import '@quazardous/vanilla-yamleditor/styles.css'

const doc = createYamlDocument({
  content: yamlText,
  schema,
  onChange: (text, status) => save(text), // an edit by the user, in any view
})
const text = mountTextView(doc, document.getElementById('side'))
const form = mountFormView(doc, document.getElementById('main'))
```

An edit in the form shows in the text at once (as an edit: undo in the text takes it back), and the other way round. Comments and layout are kept, as everywhere.

## The document

`createYamlDocument(props)` takes the editor's document props: `content`, `schema`, `validator`, `problems`, `lint`, `labels` (the warning messages), `schemaMessages`, `translate`, `onChange`, `onError`.

| Method | |
|---|---|
| `get()` | the text |
| `set(text)` | a new document: the text views' undo starts over |
| `update(text)` | the text replaced as an edit (undo keeps it) |
| `edit(change)` | a patch: `doc.edit((t) => setValue(t, ['a'], 1))`; false when refused or a no-op |
| `updateProps(props)` | a new schema, validator, external problems… |
| `status()` | `{ value, syntaxErrors, problems }` |
| `subscribe(listener)` | `listener({ kind, source })` after every change; returns the way to stop |
| `destroy()` | drop every subscriber |

`onChange` is told of the user's edits (in a view, or `edit`), not of `set` / `update` from the host, as in the editor.

## The views

`mountTextView(doc, target, options)`, `mountTreeView(…)` and `mountFormView(…)` each draw in `target`, in a frame of their own (the `.vye` border and theme variables; `frame: false` to do without). Options: `readOnly` (per view: a read-only form next to an editable text, say) and `labels`.

Each view returns `{ element, revealPath(path), focus(), setReadOnly(readOnly), setLabels(labels), destroy() }`; the text view also `reveal(offset)`.

**While the text does not parse**, the tree and form views cannot draw: they show *The document does not parse (N syntax errors): fix it in the text*, and come back as soon as it parses. Mount a text view somewhere, or nobody can fix it.

## Lifetime

`destroy()` a view: it stops following the document and goes away; the document and its other views stay. Destroy the document last (`doc.destroy()`) once its views are gone.

## Next to an editor

An editor's document is `editor.document`: mount more views on it, linked to the editor.

```js
const editor = createYamlEditor({ target: main, props: { content, schema } })
mountTextView(editor.document, sidePanel) // the text beside the editor's form, in step
```

`editor.destroy()` destroys its own views and its document: destroy the extra views first.
