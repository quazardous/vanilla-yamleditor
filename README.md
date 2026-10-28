# <img src="https://raw.githubusercontent.com/quazardous/vanilla-yamleditor/main/docs/logo.svg" alt="" width="40" align="center"> vanilla-yamleditor

[![demo](https://img.shields.io/badge/demo-yamleditor.davidberlioz.net-3b82f6)](https://yamleditor.davidberlioz.net)

A YAML editor for the browser, without a framework: **text**, **tree** and **form** views on one document, and every edit **keeps the file as written** (comments, key order, layout), so a one-field change is a one-line diff.

[![The demo: the same document as a tree and as text](https://raw.githubusercontent.com/quazardous/vanilla-yamleditor/main/docs/screenshot.png)](https://yamleditor.davidberlioz.net)

## Quick start

```sh
npm install https://github.com/quazardous/vanilla-yamleditor/releases/download/v0.8.0/quazardous-vanilla-yamleditor-0.8.0.tgz
```

Each [GitHub Release](https://github.com/quazardous/vanilla-yamleditor/releases) carries the package tarball, built and ready.

```js
import { createYamlEditor } from '@quazardous/vanilla-yamleditor'
import '@quazardous/vanilla-yamleditor/styles.css'

const editor = createYamlEditor({
  target: document.getElementById('editor'),
  props: {
    content: yamlText,
    schema, // optional JSON Schema: form fields, labels, validation
    onChange: (text, status) => save(text),
  },
})
```

## Docs

- [The editor](docs/editor.md): props, API, views, warnings, your own buttons
- [Schema](docs/schema.md): the JSON Schema subset, labelled choices, variants
- [Diff](docs/diff.md): compare two YAML texts, the keys that changed
- [Scripting](docs/scripting.md): edit a YAML file from code, comments kept
- [Theming](docs/theming.md): CSS variables, dark theme
- [Advanced: linked views](docs/linked-views.md): the text, tree and form of one document, in elements of your own

[Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · MIT
