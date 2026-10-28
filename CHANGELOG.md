# @quazardous/vanilla-yamleditor

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
