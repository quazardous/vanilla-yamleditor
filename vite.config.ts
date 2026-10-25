import { defineConfig } from 'vite'
import { copyFileSync } from 'node:fs'
import pkg from './package.json' with { type: 'json' }

// The library build: ESM, dependencies left to the consumer's bundler
const external = Object.keys(pkg.dependencies).map((name) => new RegExp(`^${name}(/|$)`))

export default defineConfig({
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index' },
    rollupOptions: { external },
    sourcemap: true,
    emptyOutDir: true,
  },
  plugins: [
    {
      name: 'copy-styles',
      closeBundle: () => copyFileSync('src/styles.css', 'dist/styles.css'),
    },
  ],
})
