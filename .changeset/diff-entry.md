---
"@quazardous/vanilla-yamleditor": minor
---

The diff has its own entry, `@quazardous/vanilla-yamleditor/diff`: the main entry (the editor, the model, the schema) no longer brings `@codemirror/merge` along, and a test keeps it so.

- **Breaking**: import `createYamlDiff`, `defaultDiffLabels` and the `YamlDiff*` types from `@quazardous/vanilla-yamleditor/diff`, no longer from the root.
- New in the main entry: `yamlChangedPaths(original, modified)`, the keys that changed between two YAML texts (null when one does not parse), with no diff code.
- New in `…/diff`: `diffYaml(original, modified)`, the comparison without a view: `{ identical, added, removed, changes, chunks, paths }`.
