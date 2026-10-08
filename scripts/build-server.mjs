/* Bundle the server to one CommonJS file. Runtime deps stay in node_modules, except ESM-only
   packages (openid-client and its deps) which are bundled in so the CJS output can load them. */
import { build } from 'esbuild';
import fs from 'node:fs';
const BUNDLE = /^(openid-client|oauth4webapi|jose)(\/|$)/;
await build({
  entryPoints: ['server/src/index.ts'], outfile: 'dist/server/index.cjs', bundle: true, platform: 'node', target: 'node20', format: 'cjs',
  logLevel: 'warning', legalComments: 'none',
  plugins: [{ name: 'externals', setup(b) { b.onResolve({ filter: /^[^./]/ }, a => (BUNDLE.test(a.path) || a.path.startsWith('node:') ? undefined : { path: a.path, external: true })); } }]
});
fs.cpSync('server/migrations', 'dist/server/migrations', { recursive: true });
console.log('server bundled -> dist/server/index.cjs');
