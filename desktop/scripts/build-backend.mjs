// Bundles backend-node's local-mode entry into out/backend/server.cjs (run by `npm run build:backend`).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

await build({
  entryPoints: [path.join(root, '../backend-node/src/local.ts')],
  outfile: path.join(root, 'out/backend/server.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  // PGlite reads its .wasm and .data by import.meta.url and argon2 is a native addon per platform:
  // both stay packages next to the app instead of going into the bundle.
  external: ['@electric-sql/pglite', '@node-rs/argon2', 'pg-native'],
  // The ESM sources ask for their own folder; in a CommonJS bundle that is the bundle's.
  define: { 'import.meta.dirname': '__dirname', 'import.meta.url': '__importMetaUrl' },
  banner: { js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
  logLevel: 'warning',
})
