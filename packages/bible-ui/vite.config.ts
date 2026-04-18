import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Note: TanStackRouterVite plugin sera ajoute quand src/routes/__root.tsx existera (task ulterieure).
// Active prematurement, le plugin echoue au demarrage si aucun root route n'est defini.

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: path.resolve(__dirname, '../..'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/mcp': 'http://localhost:7801',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
