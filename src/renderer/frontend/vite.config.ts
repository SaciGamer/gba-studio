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
    emptyOutDir: true,
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