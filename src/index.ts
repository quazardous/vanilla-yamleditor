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
 * const diff = createYamlDiff({ target, props: { original, modified } })
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
  createYamlDiff,
  defaultDiffLabels,
  type YamlDiff,
  type YamlDiffLabels,
  type YamlDiffProps,
  type YamlDiffSummary,
  type YamlDiffView,
} from './diff'
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
