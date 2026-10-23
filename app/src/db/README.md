# Database

Nutrea Studio salva tutto in un unico file SQLite: `%APPDATA%\it.nutrea.studio\nutrea.db` su Windows, `~/.config/it.nutrea.studio/nutrea.db` su Linux.
Lo schema completo e aggiornato è in [`schema.sql`](schema.sql). Il file viene generato dai test: non va modificato a mano.

## Struttura del codice

```
src-tauri/src/db.rs        Driver nativo (rusqlite): una connessione, transazioni, backup/ripristino
src/db/
  driver.ts                Interfaccia Driver: Tauri (comandi db_*) oppure sql.js nel browser e nei test
  migrate.ts               Esecuzione delle migrazioni e storico in schema_migrations
  migrations/NNNN_*.sql    Una migrazione per file, numerate in sequenza
  connection.ts            init(): apre il database e applica le migrazioni (una sola volta)
  sql.ts                   Utility condivise: conversioni (bool, centesimi, JSON), insertStmt/updateStmt
  planData.ts              Formato JSON del contenuto dei piani (PlanData) e normalizzazione
  repositories/*.ts        Una repository per dominio: pazienti, visite, pagamenti, agenda, piani, impostazioni, manutenzione
  repo.ts                  Punto di accesso unico per le schermate: `import * as repo from '../db/repo'`
  types.ts                 Tipi TypeScript delle righe restituite alle schermate
  schema.sql               Schema risultante da tutte le migrazioni (generato)
```

Regola: le schermate non scrivono SQL. Usano solo `repo.*`. Tutto l'SQL sta nelle repository.

## Tabelle

```
patients 1──* visits          misure e note di ogni visita (eliminate con il paziente)
         1──* appointments    agenda (eliminati con il paziente)
         1──* plans *──0..1 documents   versioni del piano; il PDF è condiviso tra versioni
         1──* payments        registro contabile: con il paziente eliminato restano, con nome e CF salvati
settings                      chiave → JSON (impostazioni, flag "onboarded"/"demo")
schema_migrations             migrazioni applicate
```

- **patients**: anagrafica, consensi, `active` (0 = archiviato), `token` e `link_on` per il link dell'app paziente. `code` è progressivo (`PZ-0401`, `PZ-0402`, …).
- **plans**: `version` cresce per paziente. `status` vale `draft`, `published` o `archived`. Due indici unici parziali garantiscono che per ogni paziente ci siano **al massimo una bozza e un piano pubblicato**. Una bozza finita viene *salvata* (`saved_at`, "Salva piano") ma il paziente non la vede finché non viene *condivisa*: solo allora diventa `published` ("Condividi"), e la versione pubblicata precedente passa ad `archived`. "Modifica ancora" azzera `saved_at`. Nel riepilogo paziente lo stato `ready` indica un piano salvato e da condividere. Il contenuto (giorni, pasti, alimenti, alternative, indicazioni generali in sezioni `notes`) è un documento JSON in `data`, descritto da `PlanData` in `types.ts` e normalizzato da `normalizePlanData`. Cambiare la forma del JSON non richiede una migrazione SQL: la normalizzazione converte i documenti vecchi alla lettura (es. il vecchio testo unico `general` diventa `notes` con `notesFromText`).
- **documents**: i PDF allegati ai piani, salvati in base64. Più versioni dello stesso piano puntano allo stesso documento. Un trigger lo elimina quando nessun piano lo usa più.
- **payments**:
  - l'importo è in **centesimi** (`amount_cents`), così non ci sono errori di arrotondamento;
  - la fattura è `invoice_year` + `invoice_number`, unica per anno, e viene assegnata solo ai pagamenti saldati;
  - `patient_name` e `patient_cf` conservano i dati fiscali anche se il paziente viene eliminato;
  - un pagamento già fatturato non si può eliminare.
- **appointments**: `reminder_sent_at` registra l'invio del promemoria WhatsApp. Viene azzerato quando cambiano la data o l'ora.

### Viste

- `patient_summary`: paziente con dati calcolati (ultima e prossima visita, peso attuale e iniziale, stato del piano, importo da saldare). Le liste la usano al posto di query ripetute.
- `payments_view`: pagamento con importo in euro, numero fattura formattato (`FT 12/26`), nome, CF e telefono attuali (oppure quelli salvati se il paziente non c'è più).

## Convenzioni

| Cosa | Come |
|---|---|
| Chiavi | `id INTEGER PRIMARY KEY`; chiavi esterne sempre dichiarate con `ON DELETE` esplicito |
| Date | testo `YYYY-MM-DD` con `CHECK (date(x) IS x)`; orari `HH:MM` |
| Timestamp tecnici | `created_at` / `updated_at` in ISO UTC; `updated_at` è aggiornato da un trigger `*_touch` |
| Booleani | `INTEGER` 0/1 con `CHECK (x IN (0, 1))`; il driver converte `true/false` in 1/0 |
| Importi | interi in centesimi (`*_cents`); `toCents()` in `sql.ts` per la conversione |
| JSON | colonne `TEXT` con `CHECK (json_valid(x))`; lettura con `parseJson()` |
| Valori ammessi | `CHECK (x IN (...))`, allineati con i tipi in `types.ts` |
| Più scritture collegate | sempre in `transaction([...])`: o riescono tutte o nessuna |
| Aggiornamenti parziali | `updateStmt(tabella, CAMPI_AMMESSI, id, patch)`: si scrivono solo le colonne in elenco |

Le chiavi esterne sono attive (`PRAGMA foreign_keys = ON`) su tutte le connessioni. Il file è in modalità WAL.

## Aggiungere una migrazione

1. Crea `src/db/migrations/NNNN_descrizione.sql` con il numero successivo (es. `0004_note_visite.sql`). Il nome può contenere solo lettere, numeri, `_` e `-`.
2. Scrivi l'SQL. Il runner lo esegue in una transazione, con le chiavi esterne disattivate (serve per ricostruire le tabelle). Prima del commit verifica `pragma_foreign_key_check`: se un riferimento non è valido, la migrazione viene annullata.
   - Aggiungere una colonna: `ALTER TABLE visits ADD COLUMN ...` (esempio: `0004_piano_salvato.sql`, che aggiorna anche una vista).
   - Cambiare vincoli o tipi: crea `new_x`, copia i dati con `INSERT ... SELECT`, poi `DROP TABLE x` e `ALTER TABLE new_x RENAME TO x`. Infine ricrea indici, trigger e viste che ne dipendono (in `0003_schema_con_vincoli.sql` c'è un esempio completo).
3. Aggiorna i tipi (`types.ts`) e le repository interessate.
4. Esegui `npm run db:schema` per rigenerare `schema.sql`, poi `npm test`. Il test "aggiornano un archivio della prima versione" controlla che un database vecchio arrivi all'ultima versione senza perdere dati: se la migrazione trasforma dati esistenti, aggiungi lì un controllo.
5. Includi `schema.sql` nel commit: la differenza mostra esattamente come cambia lo schema.

**Non modificare mai una migrazione già distribuita.** I database dei clienti l'hanno già applicata e non la rieseguirebbero. Per correggere, aggiungi una nuova migrazione.

All'avvio, `init()` applica le migrazioni mancanti. Nell'app desktop, prima di aggiornare un database che contiene già dati, crea un backup `…-prima-della-migrazione-vX-vY.db`.

## Backup e ripristino

Nell'app desktop la cartella dei backup è `backups/`, accanto a `nutrea.db`. I file si chiamano `nutrea-AAAA-MM-GG_HHMMSS-<motivo>.db`.

- **Automatico**: uno al giorno, all'avvio (`-automatico`). Si conservano gli ultimi 14; quelli manuali non vengono mai cancellati.
- **Prima delle migrazioni**: `-prima-della-migrazione-vX-vY`.
- **Manuale**: *Impostazioni → Privacy & sicurezza → Archivio e backup*. Da lì puoi creare un backup, salvarne una copia dove vuoi (es. chiavetta o cloud) e ripristinare un backup dall'elenco o da un file.

I backup sono creati con `VACUUM INTO`: sono copie coerenti e compatte, fatte anche con l'app in uso. Prima di ripristinare, l'app:

1. verifica che il file sia un database Nutrea integro (`PRAGMA integrity_check`);
2. salva un backup di sicurezza dell'archivio attuale (`-prima-del-ripristino`);
3. sostituisce il file e ricarica l'app; le migrazioni portano il backup allo schema attuale.

Nel browser (`npm run dev`) il database è sql.js salvato in IndexedDB. Backup e ripristino lì non sono disponibili.

## Test

`src/test/db.test.ts` usa sql.js in memoria con lo stesso driver e le stesse migrazioni dell'app. Verifica:

- migrazioni da zero e da un database della prima versione;
- vincoli dello schema;
- regole delle repository: numerazione fatture, PDF condivisi, eliminazione del paziente con i pagamenti che restano, promemoria;
- dati demo.

`cargo test` (in `src-tauri/`) verifica il driver nativo: conversione dei valori, transazioni atomiche, backup e ripristino.
