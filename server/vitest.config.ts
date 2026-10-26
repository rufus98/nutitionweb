import { defineConfig } from 'vitest/config';

// Con un database reale (TEST_DB_CLIENT) i file di test condividono lo stesso database: niente esecuzione in parallelo.
export default defineConfig({ test: { fileParallelism: !process.env.TEST_DB_CLIENT } });
