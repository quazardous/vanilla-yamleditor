import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// The main entry must not bring @codemirror/merge along (the diff has its own
// entry, …/diff): every module it imports, transitively, is read here.
function modulesFrom(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>()
  const walk = (file: string) => {
    if (seen.has(file)) return
    const imports = [...readFileSync(file, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"]*?from\s+'([^']+)'/gm)].map((m) => m[1])
    seen.set(file, imports)
    for (const spec of imports) if (spec.startsWith('.')) walk(resolve(dirname(file), `${spec}.ts`))
  }
  walk(resolve(entry))
  return seen
}

describe('entries', () => {
  it('the main entry does not import @codemirror/merge, nor the diff module', () => {
    const modules = modulesFrom('src/index.ts')
    const files = [...modules.keys()].map((f) => f.replace(/.*\/src\//, 'src/'))
    expect(files).not.toContain('src/diff.ts')
    const packages = [...modules.values()].flat().filter((s) => !s.startsWith('.'))
    expect(packages.some((p) => p.startsWith('@codemirror/merge'))).toBe(false)
    // The check does see the imports: the editor's own CodeMirror is there
    expect(packages).toContain('@codemirror/view')
  })

  it('the diff entry has the diff', () => {
    const packages = [...modulesFrom('src/diff.ts').values()].flat()
    expect(packages).toContain('@codemirror/merge')
  })
})
