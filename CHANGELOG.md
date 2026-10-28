# @quazardous/vanilla-yamleditor

## 0.8.0

### Minor Changes

- d40d066: Advanced: linked views. `createYamlDocument` is the document with no UI (the text, its reading, its problems, the edits, `subscribe`); `mountTextView`, `mountTreeView` and `mountFormView` draw it in any element, each with its own `readOnly`, and every view of a document follows every change. While the text does not parse, the tree and form views say so. `createYamlEditor` is now made of these pieces, with the same API, and `editor.document` takes more views. See docs/linked-views.md.

## 0.7.0

### Minor Changes

- 87f5c74: Choose the views offered, and drive them from the host.

  - `modes`: the views offered, in the order of their buttons (`['text', 'form']`…); `setMode` refuses the others. The default view is picked among them (form with a schema, tree without, else the other structured one, else text).
  - `modeSwitch: false` hides the mode buttons and keeps the bar's status; with a single mode they are hidden anyway. `mainMenuBar: false` still hides the whole bar.
  - `getModes()` and `canSetMode(mode)`, for a host that draws its own buttons.
  - A text that stops parsing (an `update()` while in the tree or the form) now shows as text, even when `modes` does not offer it, and the editor goes back to an offered view once it parses again; before, the tree kept showing the previous document.

## 0.6.0

### Minor Changes

- d7c3c72: The diff has its own entry, `@quazardous/vanilla-yamleditor/diff`: the main entry (the editor, the model, the schema) no longer brings `@codemirror/merge` along, and a test keeps it so.

  - **Breaking**: import `createYamlDiff`, `defaultDiffLabels` and the `YamlDiff*` types from `@quazardous/vanilla-yamleditor/diff`, no longer from the root.
  - New in the main entry: `yamlChangedPaths(original, modified)`, the keys that changed between two YAML texts (null when one does not parse), with no diff code.
  - New in `…/diff`: `diffYaml(original, modified)`, the comparison without a view: `{ identical, added, removed, changes, chunks, paths }`.

## 0.5.1

### Patch Changes

- 872c948: A multi-line value (textarea): its key sits on the first line, not in the middle, in the tree and form modes.

## 0.5.0

### Minor Changes

- 24083bf: `createYamlDiff`: two YAML texts compared, side by side or unified (on `@codemirror/merge`), with the YAML colouring, the words that changed in a line, and long unchanged stretches folded. A bar gives the views, previous / next change, `+added −removed`, and the keys that changed (from the two parsed documents, so comments and layout do not count), each a click away. `summary()` returns them for a host's review message; `changedPaths(a, b)` is exported too.

## 0.4.0

### Minor Changes

- 5398715: Schema: labelled choices, variants, and more keywords.

  - Labelled choices: a `oneOf` / `anyOf` of `{ const, title }`, or an `enum` with a parallel `x-enumLabels`. The form shows the titles (through `translate`), the tree `value — title`.
  - Variants: `allOf` merged; `if` / `then` / `else`; a `oneOf` / `anyOf` of object schemas, picked by `discriminator.propertyName` (OpenAPI style) or by the first branch that matches. The discriminator becomes a select of the branches; switching it switches the fields. New entries start in the first branch with its required keys.
  - `readOnly` now also prevents removing and renaming the entry, and applies below it; `deprecated` strikes the key through and warns (`severity: 'warning'`); `examples[0]` is the input's placeholder.
  - `schemaAt(root, path, value?)` takes the document's value to pick the variants; new exports `choicesOf`, `effective`; new schema messages `oneOf`, `deprecated`.

## 0.3.0

### Minor Changes

- 3cce5bf: Warnings on valid YAML that is likely a typo: `port :: 8080` is the key `port :` ("did you mean `port:`?"), and a quoted key with spaces around it. They are `severity: 'warning'` problems in `status().problems`, underlined in yellow at the key in the text mode, shown under the entry in the tree and form modes, counted in the menu bar; they never block a mode. New prop `lint` (default `true`) to turn them off; new labels `warnings`, `colonKey`, `spacedKey`. `lintYaml(doc)` is exported.

## 0.2.1

### Patch Changes

- 938900f: An empty document (or one with only comments) no longer shows a `null` field in the tree and form modes: it shows `(empty)` with a key to add and an item to add, as its schema allows. Adding to a document that holds only comments keeps them. In the tree mode, the buttons that add a schema's properties name the keys (the title on hover).

## 0.2.0

### Minor Changes

- 83a6891: Three modes: `text`, a new technical `tree`, and `form`.

  - `tree` now shows the document as YAML-like nested lines: the real keys, `key: value` on one line, values coloured by type and edited in place, `{n}` / `[n]` on collections, comments as `# …` on their line, the remove button on hover.
  - The previous tree, a form with schema titles as labels and help under each field, is now the `form` mode.
  - Default mode: `form` with a schema, `tree` without (`text` while the text does not parse).

  Breaking for code that passes `mode: 'tree'` or `setMode('tree')` and expects the form: use `'form'`. Code that relies on the default with a schema keeps the form. New label: `labels.form`.
