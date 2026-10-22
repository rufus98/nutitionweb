import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configurazione consigliata da Tauri: porta fissa, nessuna pulizia dello schermo.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: { target: 'es2021', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node' },
} as any);
