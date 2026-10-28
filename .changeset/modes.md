---
"@quazardous/vanilla-yamleditor": minor
---

Choose the views offered, and drive them from the host.

- `modes`: the views offered, in the order of their buttons (`['text', 'form']`…); `setMode` refuses the others. The default view is picked among them (form with a schema, tree without, else the other structured one, else text).
- `modeSwitch: false` hides the mode buttons and keeps the bar's status; with a single mode they are hidden anyway. `mainMenuBar: false` still hides the whole bar.
- `getModes()` and `canSetMode(mode)`, for a host that draws its own buttons.
- A text that stops parsing (an `update()` while in the tree or the form) now shows as text, even when `modes` does not offer it, and the editor goes back to an offered view once it parses again; before, the tree kept showing the previous document.
