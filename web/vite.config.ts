import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { devApi } from './api/_lib/dev';

// L'interfaccia dell'app paziente è condivisa con l'app desktop: si importa da ../app/src con l'alias "@app".
// "dedupe" fa usare a quei file lo stesso React di questo progetto (due copie di React romperebbero gli hook).
export default defineConfig(({ mode }) => {
  // In sviluppo /api/p risponde la stessa funzione pubblicata su Vercel (api/), sul database di DATABASE_URL in .env.local.
  const api = devApi({ ...process.env, ...loadEnv(mode, process.cwd(), '') });
  const mountApi = { name: 'nutrea-api', configureServer: (s: any) => { s.middlewares.use('/api/p', api); }, configurePreviewServer: (s: any) => { s.middlewares.use('/api/p', api); } };
  return {
    plugins: [react(), mountApi],
    resolve: {
      alias: { '@app': fileURLToPath(new URL('../app/src', import.meta.url)) },
      dedupe: ['react', 'react-dom'],
    },
    server: { port: 5180, fs: { allow: ['..'] } },
    preview: { port: 5180 },
    build: { target: 'es2020', sourcemap: true },
    test: { environment: 'jsdom' },
  } as any;
});
