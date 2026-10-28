[README](../README.md) · [Editor](editor.md) · [Schema](schema.md) · [Diff](diff.md) · [Scripting](scripting.md) · [Theming](theming.md)

# Diff

The diff has its own entry, `@quazardous/vanilla-yamleditor/diff`, so that the editor does not bring `@codemirror/merge` along.

`createYamlDiff` compares two YAML texts, side by side or unified, with the YAML colouring: added and removed lines, the words that changed in a line, long unchanged stretches folded. Above it, the **keys that changed** (`filters.paris.min_stock`), from the two parsed documents: a comment or a layout change shows in the lines, not in the keys. A click on a key shows it. Read only; for a review before saving, or a conflict.

```js
import { createYamlDiff } from '@quazardous/vanilla-yamleditor/diff'

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

Methods: `update({ original?, modified? })`, `updateProps(props)`, `summary()`, `next()`, `previous()`, `revealPath(path)`, `destroy()`.

**Without the view**, for a host that renders its own diff:

```js
import { yamlChangedPaths } from '@quazardous/vanilla-yamleditor' // no diff code
yamlChangedPaths(savedText, editor.get()) // [['filters', 'paris', 'min_stock']], or null when a side does not parse

import { diffYaml } from '@quazardous/vanilla-yamleditor/diff'
diffYaml(savedText, editor.get()) // { identical, added, removed, changes, chunks: [{ fromA, toA, fromB, toB }], paths }
```

`changedPaths(a, b)`, in the main entry, does the same on two plain values.
