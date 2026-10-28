/**
 * @quazardous/vanilla-yamleditor
 *
 * A YAML editor with a text mode (CodeMirror 6) and a tree mode (a form,
 * driven by an optional JSON Schema). Edits in the tree are patches of the
 * text: comments, key order and formatting are kept.
 *
 * import { createYamlEditor } from '@quazardous/vanilla-yamleditor'
 * import '@quazardous/vanilla-yamleditor/styles.css'
 *
 * const editor = createYamlEditor({ target, props: { content, schema, onChange } })
 *
 * Advanced: a document and views mounted anywhere, all in step
 * (docs/linked-views.md):
 *
 * const doc = createYamlDocument({ content, schema })
 * mountTextView(doc, left)
 * mountFormView(doc, right)
 *
 * The diff view has its own entry, so that the editor does not bring
 * @codemirror/merge along:
 *
 * import { createYamlDiff, diffYaml } from '@quazardous/vanilla-yamleditor/diff'
 */
export {
  createYamlEditor,
  defaultLabels,
  type YamlEditor,
  type YamlEditorLabels,
  type YamlEditorMode,
  type YamlEditorProps,
  type YamlEditorStatus,
} from './editor'
export {
  createYamlDocument,
  defaultDocumentLabels,
  type YamlChangeKind,
  type YamlDocument,
  type YamlDocumentChange,
  type YamlDocumentLabels,
  type YamlDocumentProps,
  type YamlStatus,
} from './document'
export {
  defaultViewLabels,
  mountFormView,
  mountTextView,
  mountTreeView,
  type YamlTextView,
  type YamlTreeView,
  type YamlView,
  type YamlViewLabels,
  type YamlViewOptions,
} from './views'
export {
  addItem,
  changedPaths,
  addKey,
  commentAt,
  deleteAt,
  lintYaml,
  parseYaml,
  pathKey,
  rangeAt,
  renameKey,
  setValue,
  toPath,
  yamlChangedPaths,
  valueAt,
  YamlEditError,
  type ParsedYaml,
  type YamlLint,
  type YamlPath,
  type YamlSyntaxError,
} from './model'
export {
  choicesOf,
  defaultFor,
  effective,
  defaultSchemaMessages,
  schemaAt,
  validate,
  type JsonSchema,
  type Choice,
  type JsonSchemaType,
  type SchemaMessages,
  type YamlProblem,
  type YamlProblemInput,
} from './schema'
export type { TreeLabels } from './tree-mode'
