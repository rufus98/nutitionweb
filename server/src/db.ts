// Connessione al database e migrazioni (elencate qui, così funzionano anche dopo la compilazione).
import knexFactory, { type Knex } from 'knex';
import type { Config } from './config.js';
import * as m001 from './migrations/001_accessi_pazienti.js';

const MIGRATIONS: Record<string, { up: (k: Knex) => Promise<void>; down: (k: Knex) => Promise<void> }> = {
  '001_accessi_pazienti': m001,
};

const source: Knex.MigrationSource<string> = {
  getMigrations: async () => Object.keys(MIGRATIONS).sort(),
  getMigrationName: (m) => m,
  getMigration: async (m) => MIGRATIONS[m],
};

export function connect(db: Config['db']): Knex {
  const sqlite = db.client === 'better-sqlite3';
  return knexFactory({
    client: db.client,
    connection: db.connection as Knex.StaticConnectionConfig,
    useNullAsDefault: sqlite,
    // SQLite in memoria (test): una sola connessione, altrimenti ognuna vedrebbe un database diverso.
    pool: sqlite ? { min: 1, max: 1, afterCreate: (c: any, done: any) => { c.pragma('foreign_keys = ON'); done(); } } : { min: 0, max: 10 },
    migrations: { migrationSource: source, tableName: 'nutrea_migrations' },
  });
}

export async function migrate(knex: Knex) {
  const [, applied] = await knex.migrate.latest();
  return applied as string[];
}

/** Le date tornano come Date, numero o stringa a seconda del database. */
export const toDate = (v: unknown): Date | null => (v == null ? null : v instanceof Date ? v : new Date(typeof v === 'number' ? v : String(v)));
