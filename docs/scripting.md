[README](../README.md) · [Editor](editor.md) · [Schema](schema.md) · [Diff](diff.md) · [Scripting](scripting.md) · [Theming](theming.md) · [Linked views](linked-views.md)

# Editing without the UI

The text edits are exported, so a script can change a file the same way:

```js
import { readFileSync } from 'node:fs'
import { setValue, addKey, addItem, deleteAt, renameKey, parseYaml } from '@quazardous/vanilla-yamleditor'

let text = readFileSync('stores.yaml', 'utf8')
text = setValue(text, ['filters', 'paris', 'min_stock'], 5)
text = addKey(text, ['filters'], 'nice', { enabled: true })
parseYaml(text).value // the plain value, comments and layout of the file untouched
```

`addItem`, `deleteAt` and `renameKey` work the same way. An edit that cannot be done (a key renamed to one that exists) throws a `YamlEditError`.
