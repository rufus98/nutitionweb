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
  // In sviluppo /api va al server locale (cartella server/, npm run dev): API_TARGET per cambiarlo.
  server: { port: 5180, fs: { allow: ['..'] }, proxy: { '/api': process.env.API_TARGET ?? 'http://localhost:8080' } },
  preview: { port: 5180, proxy: { '/api': process.env.API_TARGET ?? 'http://localhost:8080' } },
  build: { target: 'es2020', sourcemap: true },
  test: { environment: 'jsdom' },
} as any);
