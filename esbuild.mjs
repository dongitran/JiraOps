import { build, context } from 'esbuild';
import { rm } from 'node:fs/promises';

const watchMode = process.argv.includes('--watch');

const buildOptions = {
  bundle: true,
  entryPoints: ['src/extension.ts'],
  external: ['vscode'],
  format: 'cjs',
  logLevel: 'info',
  minify: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  sourcemap: true,
  target: 'node20',
};

await rm('dist', { force: true, recursive: true });

if (watchMode) {
  const buildContext = await context(buildOptions);
  await buildContext.watch();
} else {
  await build(buildOptions);
}
