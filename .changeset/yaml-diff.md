---
"@quazardous/vanilla-yamleditor": minor
---

`createYamlDiff`: two YAML texts compared, side by side or unified (on `@codemirror/merge`), with the YAML colouring, the words that changed in a line, and long unchanged stretches folded. A bar gives the views, previous / next change, `+added −removed`, and the keys that changed (from the two parsed documents, so comments and layout do not count), each a click away. `summary()` returns them for a host's review message; `changedPaths(a, b)` is exported too.
