import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    }
  },
  base: './',
  build: {
    outDir: '../../../dist/renderer',
    // The main TypeScript build emits tracker helpers imported by AssetBuilder
    // under dist/renderer/frontend. Keep those files when Vite writes its UI.
    // The root build cleans dist before building, so stale output is still removed.
    emptyOutDir: false,
    rollupOptions: {
      external: ['electron', 'path', 'fs'], 
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    preserveSymlinks: true 
  },
});
