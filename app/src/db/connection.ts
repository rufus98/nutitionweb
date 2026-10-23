// Punto unico di accesso al database per i repository: apre il driver e applica le migrazioni una volta sola.
import { backupDatabase, getDriver, type Driver } from './driver';
import { migrate } from './migrate';

let ready: Promise<Driver> | null = null;

export function init(): Promise<Driver> {
  if (!ready) {
    ready = (async () => {
      const db = await getDriver();
      await migrate(db, {
        // Nell'app desktop, prima di modificare lo schema di un archivio esistente si salva una copia.
        beforeMigrate: async (from, to) => { if (db.kind === 'tauri') await backupDatabase(`prima-della-migrazione-v${from}-v${to}`); },
      });
      return db;
    })();
    ready.catch(() => { ready = null; });
  }
  return ready;
}

/** Driver pronto (migrazioni applicate). */
export const db = () => init();

/** Solo per i test: dimentica lo stato di inizializzazione. */
export function resetConnection() { ready = null; }
