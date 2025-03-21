import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: './src/main.ts',
      formats: ['es'], // Formato ESModules
    },
    outDir: './dist/main',
    rollupOptions: {
      external: ['electron', 'path', 'fs'], // Evitar empacotar módulos nativos
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // Alias configurado
    },
  },
});
