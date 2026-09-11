import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'dist');
const wasm = path.join(root, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

fs.mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [path.join(root, 'src', 'index.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node12',
  minify: false,
  sourcemap: false,
  outfile: path.join(outDir, 'server.cjs'),
  logLevel: 'info',
});

if (fs.existsSync(wasm)) {
  fs.copyFileSync(wasm, path.join(outDir, 'sql-wasm.wasm'));
  console.log('copied sql-wasm.wasm -> dist/sql-wasm.wasm');
} else {
  console.error('WARNING: sql-wasm.wasm not found, POS server will fail to open the DB.');
}

console.log('Windows build complete: backend/dist/server.cjs');