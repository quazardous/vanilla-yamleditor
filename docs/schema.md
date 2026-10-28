[README](../README.md) · [Editor](editor.md) · [Schema](schema.md) · [Diff](diff.md) · [Scripting](scripting.md) · [Theming](theming.md)

# Schema

A subset of JSON Schema, enough for configuration files:

- `type` (one or a list, `'null'` included), `enum`, `const`, `default`;
- `title` and `description`, which become the label and the help (in the tree: a tooltip on the key);
- `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`;
- `minLength`, `maxLength`, `pattern`, and `format: 'textarea'`;
- `properties`, `required` and `additionalProperties`. With a schema as `additionalProperties`, the map takes any key, each value shaped by that schema (stores by name, for instance);
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

Comments written in the file show as help: under their field in the form, next to the schema's `description`; on their line, as `# …`, in the tree.
