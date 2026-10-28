---
"@quazardous/vanilla-yamleditor": patch
---

An empty document (or one with only comments) no longer shows a `null` field in the tree and form modes: it shows `(empty)` with a key to add and an item to add, as its schema allows. Adding to a document that holds only comments keeps them. In the tree mode, the buttons that add a schema's properties name the keys (the title on hover).
