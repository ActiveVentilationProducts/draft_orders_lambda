// Bundles src/handler.js into a single dist/index.mjs for Lambda (handler = index.handler).
import { build } from 'esbuild';

await build({
  entryPoints: ['src/handler.js'],
  outfile: 'dist/index.mjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // nodemailer is CommonJS and calls require(); give the ESM bundle a real require.
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  external: ['@aws-sdk/*'],
});

console.log('Built dist/index.mjs');
