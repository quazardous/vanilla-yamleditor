---
"@quazardous/vanilla-yamleditor": minor
---

Warnings on valid YAML that is likely a typo: `port :: 8080` is the key `port :` ("did you mean `port:`?"), and a quoted key with spaces around it. They are `severity: 'warning'` problems in `status().problems`, underlined in yellow at the key in the text mode, shown under the entry in the tree and form modes, counted in the menu bar; they never block a mode. New prop `lint` (default `true`) to turn them off; new labels `warnings`, `colonKey`, `spacedKey`. `lintYaml(doc)` is exported.
