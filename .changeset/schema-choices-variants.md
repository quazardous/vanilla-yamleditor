---
"@quazardous/vanilla-yamleditor": minor
---

Schema: labelled choices, variants, and more keywords.

- Labelled choices: a `oneOf` / `anyOf` of `{ const, title }`, or an `enum` with a parallel `x-enumLabels`. The form shows the titles (through `translate`), the tree `value — title`.
- Variants: `allOf` merged; `if` / `then` / `else`; a `oneOf` / `anyOf` of object schemas, picked by `discriminator.propertyName` (OpenAPI style) or by the first branch that matches. The discriminator becomes a select of the branches; switching it switches the fields. New entries start in the first branch with its required keys.
- `readOnly` now also prevents removing and renaming the entry, and applies below it; `deprecated` strikes the key through and warns (`severity: 'warning'`); `examples[0]` is the input's placeholder.
- `schemaAt(root, path, value?)` takes the document's value to pick the variants; new exports `choicesOf`, `effective`; new schema messages `oneOf`, `deprecated`.
