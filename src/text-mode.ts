/**
 * The text mode: CodeMirror 6 with YAML colouring, folding and line markers.
 */
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { yaml } from '@codemirror/lang-yaml'
import { classHighlighter } from '@lezer/highlight'

export interface TextMarker {
  from: number
  to: number
  message: string
  severity: 'error' | 'warning'
}

export interface TextModeOptions {
  parent: HTMLElement
  text: string
  readOnly: boolean
  onChange: (text: string) => void
}

/** The smallest change turning a into b: the common start and end stay. */
export function minimalChange(a: string, b: string): { from: number; to: number; insert: string } | null {
  if (a === b) return null
  let start = 0
  const max = Math.min(a.length, b.length)
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
    endA--
    endB--
  }
  return { from: start, to: endA, insert: b.slice(start, endB) }
}

export class TextMode {
  readonly view: EditorView
  private readonly readOnly = new Compartment()
  private silent = false

  constructor(private readonly options: TextModeOptions) {
    this.view = new EditorView({ parent: options.parent, state: this.createState(options.text, options.readOnly) })
  }

  private createState(text: string, readOnly: boolean): EditorState {
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      foldGutter(),
      lintGutter(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      indentUnit.of('  '),
      yaml(),
      syntaxHighlighting(classHighlighter),
      keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
      EditorView.lineWrapping,
      this.readOnly.of(readOnlyExtension(readOnly)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !this.silent) this.options.onChange(update.state.doc.toString())
      }),
    ]
    return EditorState.create({ doc: text, extensions })
  }

  getText(): string {
    return this.view.state.doc.toString()
  }

  /** Replace the text. `resetHistory`: a new document, undo starts over. */
  setText(text: string, resetHistory = false): void {
    this.silent = true
    try {
      if (resetHistory) {
        const readOnly = this.view.state.readOnly
        this.view.setState(this.createState(text, readOnly))
        return
      }
      const change = minimalChange(this.getText(), text)
      if (change) this.view.dispatch({ changes: change })
    } finally {
      this.silent = false
    }
  }

  setMarkers(markers: TextMarker[]): void {
    const length = this.view.state.doc.length
    const diagnostics: Diagnostic[] = markers.map((m) => {
      const from = Math.min(Math.max(m.from, 0), length)
      return { from, to: Math.min(Math.max(m.to, from), length), message: m.message, severity: m.severity }
    })
    this.view.dispatch(setDiagnostics(this.view.state, diagnostics))
  }

  setReadOnly(readOnly: boolean): void {
    this.view.dispatch({ effects: this.readOnly.reconfigure(readOnlyExtension(readOnly)) })
  }

  /** Put the cursor at an offset and bring it into view. */
  reveal(pos: number): void {
    const at = Math.min(pos, this.view.state.doc.length)
    this.view.dispatch({ selection: { anchor: at }, scrollIntoView: true })
    this.view.focus()
  }

  focus(): void {
    this.view.focus()
  }

  destroy(): void {
    this.view.destroy()
  }
}

function readOnlyExtension(readOnly: boolean): Extension {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]
}
