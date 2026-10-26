import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

// L'interfaccia dell'app paziente è condivisa con l'app desktop: si importa da ../app/src con l'alias "@app".
// "dedupe" fa usare a quei file lo stesso React di questo progetto (due copie di React romperebbero gli hook).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@app': fileURLToPath(new URL('../app/src', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  server: { port: 5180, fs: { allow: ['..'] } },
  preview: { port: 5180 },
  build: { target: 'es2020', sourcemap: true },
  test: { environment: 'jsdom' },
} as any);
