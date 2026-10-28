---
"@quazardous/vanilla-yamleditor": minor
---

Advanced: linked views. `createYamlDocument` is the document with no UI (the text, its reading, its problems, the edits, `subscribe`); `mountTextView`, `mountTreeView` and `mountFormView` draw it in any element, each with its own `readOnly`, and every view of a document follows every change. While the text does not parse, the tree and form views say so. `createYamlEditor` is now made of these pieces, with the same API, and `editor.document` takes more views. See docs/linked-views.md.
