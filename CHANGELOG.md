# @quazardous/vanilla-yamleditor

## 0.2.0

### Minor Changes

- 83a6891: Three modes: `text`, a new technical `tree`, and `form`.

  - `tree` now shows the document as YAML-like nested lines: the real keys, `key: value` on one line, values coloured by type and edited in place, `{n}` / `[n]` on collections, comments as `# …` on their line, the remove button on hover.
  - The previous tree, a form with schema titles as labels and help under each field, is now the `form` mode.
  - Default mode: `form` with a schema, `tree` without (`text` while the text does not parse).

  Breaking for code that passes `mode: 'tree'` or `setMode('tree')` and expects the form: use `'form'`. Code that relies on the default with a schema keeps the form. New label: `labels.form`.
