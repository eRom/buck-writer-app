import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/server.ts', 'src/scripts/reindex.ts'],
  format: 'esm',
  clean: true,
  sourcemap: true,
  target: 'node20',
});
