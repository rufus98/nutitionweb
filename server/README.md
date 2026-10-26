# Nutrea · server dell'app paziente

Il server sta tra l'app desktop dello studio e la web app dei pazienti. Conserva i dati in un **database SQL a tua scelta**: PostgreSQL, MySQL/MariaDB, SQL Server o SQLite.

```
App desktop (studio) ──chiave dello studio──▶  SERVER  ◀──link + password──  Web app (paziente)
                                                  │
                                         database SQL remoto
```

L'app desktop **non contiene le credenziali del database**: parla solo con il server, con una chiave revocabile.

## Il flusso

1. Il nutrizionista crea la **scheda del paziente** (con l'email).
2. Nella scheda, *App paziente → **Crea link di accesso***: l'app desktop invia al server l'email, il nome e un **oggetto con tutti i dati della dieta** (piano condiviso, indicazioni, visite, prossimo appuntamento, contatti dello studio).
3. Il server salva tutto nel database e crea un **link di attivazione**, valido 7 giorni e utilizzabile una volta sola. Il nutrizionista lo invia su WhatsApp o per email.
4. Il paziente apre il link e **sceglie la sua password**. Il server la salva **solo come hash scrypt**: né lo studio né chi legge il database possono risalirci.
5. Da quel momento il paziente apre il suo link personale `/p/{token}` e inserisce la password.
6. Ogni modifica nello studio (piano condiviso, visite, appuntamenti, impostazioni) viene **inviata in automatico**: poco dopo la modifica, ogni 5 minuti e al ritorno della connessione. Si inviano solo i pazienti i cui dati sono cambiati.
7. **Password dimenticata**: lo studio crea un nuovo link di attivazione. La nuova password sostituisce la vecchia e chiude le sessioni aperte.
8. **Disattiva accesso**: il paziente viene disconnesso subito e vede "Link disattivato".
9. **Paziente eliminato nello studio**: i suoi dati vengono cancellati anche dal server, se serve alla prima connessione utile.

## Cosa c'è nel database

| Tabella | Contenuto |
|---|---|
| `patient_access` | link (`token`), **email** (in chiaro, minuscola), nome, stato (`pending` / `active` / `disabled`), **`password_hash`** (scrypt con sale), codice di attivazione (solo SHA-256) e scadenza, **`view_json`** (l'oggetto con tutti i dati della dieta), PDF del piano, consenso, tentativi falliti |
| `patient_session` | sessioni dopo il login: solo lo SHA-256 del codice di sessione, con scadenza (30 giorni) |
| `patient_access_log` | registro accessi (attivazione, login, apertura, consenso, uscita), solo se attivato in *Impostazioni → Privacy*; niente indirizzi IP |
| `nutrea_migrations` | versioni dello schema applicate |

Il formato di `view_json` è `PatientView`, in `app/src/patientApp/view.ts`.

Non contiene note cliniche, codice fiscale, massa grassa, pagamenti né note interne. Lo verificano i test.

Lo schema SQL per ogni database è in `sql/` (`schema.postgresql.sql`, `schema.mysql.sql`, `schema.sqlserver.sql`, `schema.sqlite.sql`). Si rigenera con `npm run schema-sql`.

## Installazione

Requisiti: Node.js 20 o superiore e un database.

```sh
cd server
npm install
cp .env.example .env
npm run studio-key
```

Il comando `npm run studio-key` stampa due cose:

- la **chiave dello studio**, da incollare nell'app desktop (*Impostazioni → App paziente & link → Server dell'app paziente*);
- la riga `STUDIO_KEY_SHA256=…`, da mettere nel file `.env`. Sul server c'è solo l'hash della chiave.

Poi compila `.env`: `DB_CLIENT`, `DATABASE_URL`, `WEB_ORIGIN` (indirizzo della web app, es. `https://app.diet.it`). Infine avvia:

```sh
npm run build && npm start     # crea/aggiorna le tabelle e avvia su :8080
```

Se preferisci che sia il DBA a creare le tabelle: esegui `sql/schema.<database>.sql` e imposta `MIGRATE_ON_START=0`.

Driver dei database: PostgreSQL (`pg`), MySQL/MariaDB (`mysql2`) e SQLite (`better-sqlite3`) sono già inclusi. Per SQL Server: `npm install tedious`.

**Docker**: `docker build -t nutrea-server . && docker run --env-file .env -p 8080:8080 nutrea-server`

### In produzione

- Metti il server dietro **HTTPS** (nginx, Caddy, il bilanciatore del tuo hosting) e imposta `TRUST_PROXY=1`.
- La web app (cartella `web/`) e il server possono stare sullo stesso dominio: `/api/*` va al server, il resto alla web app. Possono stare anche su domini diversi: compila la web app con `VITE_API_BASE=https://api.tuodominio.it`.
- Nell'app desktop, l'"Indirizzo app paziente" deve corrispondere a `WEB_ORIGIN`.
- Fai backup del database come per qualsiasi dato sanitario.

## API

Studio (`Authorization: Bearer <chiave dello studio>`):

| Metodo | Percorso | |
|---|---|---|
| GET | `/api/studio/ping` | verifica chiave e versione |
| PUT | `/api/studio/access/{token}` | `{ email, firstName, view, active, logAccess }`: crea o aggiorna |
| POST | `/api/studio/access/{token}/activation` | nuovo link di attivazione `{ activationUrl, expiresAt }` |
| PUT | `/api/studio/access/{token}/pdf` | `{ name, b64 }` oppure `null` |
| GET | `/api/studio/access/{token}` | stato, ultimo accesso, registro |
| DELETE | `/api/studio/access/{token}` | cancella tutto |

Paziente (web app):

| Metodo | Percorso | |
|---|---|---|
| POST | `/api/p/{token}/activate` | `{ code, password }` → `{ session, expiresAt }` |
| POST | `/api/p/{token}/login` | `{ password }` → `{ session, expiresAt }` |
| GET | `/api/p/{token}` | dati (`Authorization: Bearer <sessione>`); `401 { state: 'activate' \| 'login' }`, `404`, `410` |
| GET | `/api/p/{token}/pdf` | PDF originale |
| POST | `/api/p/{token}/consent` · `/logout` | |

## Sicurezza

- **Password**:
  - scrypt (N=2¹⁷, r=8, p=1, sale casuale di 16 byte), parametri raccomandati da OWASP;
  - almeno 10 caratteri, non deve contenere l'email;
  - verifica a tempo costante.
- **Tentativi**:
  - dopo 5 password sbagliate il link si blocca per 15 minuti;
  - in più c'è un limite di 20 tentativi al minuto per IP (in memoria; con più istanze aggiungi un limite sul proxy).
- **Codici casuali** (attivazione, sessione): 256 bit, salvati solo come SHA-256. Il codice di attivazione vale una volta sola e la web app lo toglie subito dall'indirizzo.
- **Chiave dello studio**: sul server c'è solo il suo SHA-256. Per cambiarla rigenerala con `npm run studio-key`.
- **Risposte**: tutte con `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`.
- **Token del link**: oggi è di 8 caratteri (~47 bit). Con la password non basta più da solo per vedere i dati, ma conviene comunque allungarlo (vedi `web/README.md`).

## Test

```sh
npm test                                     # SQLite in memoria
TEST_DB_CLIENT=pg TEST_DATABASE_URL=postgres://… npm test     # stesso test su PostgreSQL (o mysql2, mssql)
```

Il flusso completo app desktop → server → paziente è in `app/src/test/remote.e2e.test.ts`. Gira se le dipendenze del server sono installate.
