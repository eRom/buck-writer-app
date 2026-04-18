import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

function copyDir(src: string, dst: string) {
  if (!existsSync(src)) return;
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, f.name);
    const dstPath = path.join(dst, f.name);
    if (f.isDirectory()) copyDir(srcPath, dstPath);
    else copyFileSync(srcPath, dstPath);
  }
}

export default defineConfig({
  entry: ['src/index.ts', 'src/db/migrate.ts', 'src/db/seed.ts'],
  format: ['esm'],
  target: 'node20',
  dts: false,
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: true,
  onSuccess: async () => {
    copyDir('src/defaults', 'dist/defaults');
  },
});
