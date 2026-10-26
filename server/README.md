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
```

**Non c'è nessuna chiave da generare.** Avvia il server e, in Nutrea Studio (avviato come amministratore), in *Impostazioni → Amministrazione* inserisci l'**indirizzo del server** e premi **Collega questo server**: il server crea la chiave dello studio e l'app la salva da sola. Il server è "libero" finché il primo studio non lo collega: dopo il collegamento l'operazione è chiusa, e un secondo tentativo riceve "già collegato". Collega il server **subito dopo averlo pubblicato**.

Se preferisci non lasciarlo libero nemmeno per qualche minuto, genera la chiave tu: `npm run studio-key` stampa la chiave (da incollare nell'app) e la riga `STUDIO_KEY_SHA256=…` per il `.env`.

Nel `.env` compila `WEB_ORIGIN` (indirizzo della web app, es. `https://app.diet.it`). Per il database hai due possibilità:
- **dall'app desktop** (consigliato): lascia vuoto `DATABASE_URL` e configura il database come spiegato in [Configurare il database dall'app desktop](#configurare-il-database-dallapp-desktop);
- **nel file**: compila `DB_CLIENT` e `DATABASE_URL`.

Infine avvia:

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

## Configurare il database dall'app desktop

La configurazione del server e del database si fa da una sezione che compare **solo se Nutrea Studio è stato avviato come amministratore**: in Windows, tasto destro sull'icona → *Esegui come amministratore*. Chi usa l'app normalmente vede solo "Server collegato" o "Non configurato".

1. *Impostazioni → **Amministrazione** → Server dell'app paziente*: indirizzo del server e chiave dello studio, poi *Prova connessione*.
2. *Database esterno*:
   - il pannello usa la stessa chiave dello studio e legge subito lo stato attuale (non ci sono altre chiavi da generare);
   - scegli il tipo di database (PostgreSQL, MySQL/MariaDB, SQL Server, SQLite sul server) e compila indirizzo, porta, nome, utente, password e SSL;
   - premi *Prova connessione*, poi *Salva e usa questo database*.
3. Il server si collega e crea le tabelle se mancano. Da quel momento app desktop e web app usano il nuovo database, **senza riavvio**. I dati dei pazienti con il link vengono inviati di nuovo in automatico. Se il database è nuovo e vuoto, i pazienti dovranno riattivare l'accesso con un nuovo link (le password stanno nel database).

### Con Aiven (MySQL, piano gratuito)

1. Nel pannello Aiven apri il servizio MySQL → *Overview → Connection information*.
2. Nell'app, sezione *Database esterno*: incolla il **Service URI** (compila host, porta, database e SSL). Il Service URI nasconde utente e password: copia **User** (`avnadmin`) e **Password** dal pannello.
3. Copia il **CA certificate** (*Show* o download del file `.pem`) nel campo *Certificato CA* oppure caricalo come file. Il server verifica sempre il certificato del database: senza la CA di Aiven la connessione viene rifiutata.
4. *Prova connessione*, poi *Salva e usa questo database*.

Con le variabili d'ambiente (senza il pannello): `DATABASE_URL=mysql://avnadmin:…@host:porta/defaultdb?ssl-mode=REQUIRED` e `DB_SSL_CA=/percorso/ca.pem`.

Il piano gratuito di Aiven ha 1 GB di spazio e al massimo 76 connessioni (il server ne usa al massimo 5), e **si spegne dopo un periodo di inattività**. Finché è spento studio e pazienti ricevono un errore 503 ("Database non raggiungibile"): i pazienti che hanno già aperto il piano lo vedono comunque dalla copia salvata sul telefono. Si risolve riaccendendo il servizio dal pannello Aiven. Se ti serve che sia sempre acceso, il piano a pagamento più economico non si spegne.

**Dove finiscono i dati di accesso**:
- il server li salva **cifrati** (AES-256-GCM, certificato CA compreso) in `DATA_DIR/database.json.enc`, leggibile solo dal suo utente, e li riusa a ogni riavvio. La chiave di cifratura la crea il server da solo al primo salvataggio (`DATA_DIR/config.key`); se preferisci gestirla tu, imposta `CONFIG_KEY` (64 caratteri esadecimali). **`DATA_DIR` deve essere una cartella che resta**: se l'hosting la cancella a ogni riavvio, il database va reinserito dal pannello;
- l'app desktop non li conserva;
- la password del database non viene mai restituita.

Una configurazione sbagliata non interrompe quella in uso: il server cambia database solo se la nuova connessione funziona. Se all'avvio il database non è raggiungibile, il server resta acceso in modalità configurazione: studio e pazienti ricevono un errore 503 chiaro, e l'amministratore può correggere.

API (chiave dello studio, `Authorization: Bearer …`; 10 chiavi sbagliate in 15 minuti bloccano l'IP; l'app mostra il pannello solo se avviata come amministratore):

| Metodo | Percorso | |
|---|---|---|
| GET | `/api/admin/database` | stato: configurato, tipo, versione, impostazioni senza password |
| POST | `/api/admin/database/test` | prova una configurazione senza usarla |
| PUT | `/api/admin/database` | si collega, crea le tabelle, passa al nuovo database e salva la configurazione cifrata (se la password non viene reinviata, si tiene quella salvata) |

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
- **Chiave dello studio**: sul server c'è solo il suo SHA-256. Serve sia per i dati dei pazienti sia per cambiare il database, quindi tienila riservata; il pannello nell'app compare solo se Nutrea Studio è avviato come amministratore. Si rigenera con `npm run studio-key`.
- **Configurazione del database**: cifrata. Senza la chiave (`DATA_DIR/config.key` o `CONFIG_KEY`) il file non rivela host, utente o password.
- **Risposte**: tutte con `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`.
- **Token del link**: oggi è di 8 caratteri (~47 bit). Con la password non basta più da solo per vedere i dati, ma conviene comunque allungarlo (vedi `web/README.md`).

## Test

```sh
npm test                                     # SQLite in memoria
TEST_DB_CLIENT=pg TEST_DATABASE_URL=postgres://… npm test     # stesso test su PostgreSQL (o mysql2, mssql)
```

Il flusso completo app desktop → server → paziente è in `app/src/test/remote.e2e.test.ts`. Gira se le dipendenze del server sono installate.
