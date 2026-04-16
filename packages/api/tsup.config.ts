import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/db/migrate.ts', 'src/db/seed.ts'],
  format: ['esm'],
  target: 'node20',
  dts: false,
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: true,
});
