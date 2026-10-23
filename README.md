# Nutrea Studio

App desktop per Windows 10/11 per lo studio del nutrizionista: pazienti, visite e misure, piani nutrizionali, agenda e pagamenti.
Realizzata con **Tauri 2 + React + TypeScript** partendo dal design esportato da Claude Design (cartelle `project/` e `chats/`).

- I dati restano sul computer, in un database **SQLite** locale: `%APPDATA%\it.nutrea.studio\nutrea.db`.
- **Tema chiaro e scuro** che segue l'impostazione di Windows.
- Finestra ridimensionabile, con dimensione minima 1280×760 (quella del design). Posizione e dimensione vengono ricordate.
- Installer **.msi** (WiX) ed **.exe** (NSIS) in italiano.

> Il README originale del bundle di design è in `project/HANDOFF_README.md`.

---

## Struttura

```
app/
  src-tauri/            Rust: finestra, driver SQLite con backup (src/db.rs), plugin (file, dialoghi, apertura link), installer
    tauri.conf.json     nome, icone, dimensione minima finestra, target msi/nsis
    capabilities/       permessi della finestra
  src/
    theme/tokens.css    design token del bundle come variabili CSS (chiaro + scuro)
    components/         Sidebar, card, campi, modali, drawer, grafico peso, ricerca rapida…
    db/                 SQLite: migrazioni .sql, repository per dominio, dati demo — vedi src/db/README.md
    lib/                formattazione all'italiana, PDF (fatture, consenso, piano), ZIP, integrazione con il sistema
    screens/            Oggi, Pazienti, Nuovo paziente, Scheda paziente, Agenda, Piani, Pagamenti, Impostazioni
    test/               test unitari (Vitest)
  tailwind.config.js    token del bundle (petrol, sage, ink, line, canvas…) collegati alle variabili CSS
project/, chats/        bundle di design originale (riferimento) e README dell'handoff
.github/workflows/      build degli installer Windows su GitHub Actions
```

## Sviluppo

Requisiti: **Node.js 20+** e **Rust** stabile ([rustup.rs](https://rustup.rs)).
Su Windows servono anche i *Build Tools di Visual Studio* con il carico di lavoro "Sviluppo di applicazioni desktop C++". WebView2 è già incluso in Windows 10/11.

```bash
cd app
npm install          # una volta
npm run tauri dev    # avvia l'app desktop con ricarica automatica
```

Altri comandi:

| Comando | A cosa serve |
|---|---|
| `npm run dev` | Solo l'interfaccia nel browser (http://localhost:1420). Al posto di SQLite usa sql.js salvato nel browser: utile per lavorare sulla grafica. |
| `npm run db:schema` | Rigenera `src/db/schema.sql` dopo aver aggiunto una migrazione. |
| `npm test` | Test unitari (formattazione, PDF, ZIP, migrazioni, vincoli e repository del database, lettura dei piani). Con `NUTREA_PDF_DIR=/cartella/con/pdf npm test` verifica anche la lettura di PDF reali (non inclusi nel repository). |
| `npm run build` | Controllo dei tipi e build del frontend. |

Al primo avvio l'app chiede se partire con un **archivio vuoto** o con i **dati di esempio** del design (20 pazienti, agenda, pagamenti, piani). I dati di esempio si eliminano da *Impostazioni → Privacy & sicurezza*.

## Creare l'installer

### Su Windows (consigliato)

```powershell
cd app
npm install
npx tauri build
```

Gli installer vengono creati in:

- `app\src-tauri\target\release\bundle\msi\Nutrea Studio_1.0.0_x64_it-IT.msi`
- `app\src-tauri\target\release\bundle\nsis\Nutrea Studio_1.0.0_x64-setup.exe`

L'installer `.exe` installa per l'utente corrente, senza permessi di amministratore. Il `.msi` è adatto alla distribuzione centralizzata. Se manca WebView2, entrambi lo scaricano automaticamente.

### Con GitHub Actions

Il workflow `.github/workflows/windows-installer.yml` crea `.msi` ed `.exe` su un runner Windows a ogni push su `main`, sui tag `v*` o manualmente (*Actions → Installer Windows → Run workflow*). Gli installer si scaricano dagli *Artifacts* della run. Con un tag `v1.0.0`, vengono anche allegati a una release in bozza.

### Da Linux (solo .exe, sperimentale)

```bash
rustup target add x86_64-pc-windows-gnu
sudo apt install mingw-w64 nsis
cd app && npx tauri build --target x86_64-pc-windows-gnu --bundles nsis
```

Produce solo l'installer NSIS (`src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/`). Il `.msi` richiede WiX, che gira solo su Windows.

### Firma del codice

Gli installer non sono firmati, quindi al primo avvio Windows SmartScreen mostra un avviso ("Esegui comunque"). Per distribuirli senza avvisi serve un certificato di firma del codice. Va configurato in `bundle.windows.certificateThumbprint` (oppure con `signCommand`) in `src-tauri/tauri.conf.json`: vedi la [guida Tauri](https://v2.tauri.app/distribute/sign/windows/).

### Versione

Prima di una nuova release aggiorna la versione in `app/package.json`, `app/src-tauri/tauri.conf.json` e `app/src-tauri/Cargo.toml`.

## Uso

### Scorciatoie da tastiera

| Tasti | Azione |
|---|---|
| `Ctrl+K` | Ricerca rapida di pazienti e azioni |
| `Ctrl+N` | Nuovo paziente |
| `Ctrl+1` … `Ctrl+6` | Oggi, Pazienti, Agenda, Piani, Pagamenti, Impostazioni |
| `Ctrl+F` | Cerca negli elenchi (pazienti, pagamenti) |
| `Ctrl+S` | Salva (impostazioni, bozza del piano) |
| `Ctrl+Invio` | Conferma il modulo aperto (nuovo paziente, visita, appuntamento, pagamento) |
| `←` `→` / `Home` | Agenda: settimana precedente/successiva, torna a oggi |
| `Alt+←` o tasto "indietro" del mouse | Schermata precedente |
| `Esc` | Chiude la finestra o il pannello aperto |
| `F1` | Elenco delle scorciatoie |

Il design non prevede una barra dei menu, quindi l'app non ne ha. Le scorciatoie del browser che non hanno senso in un'app (ricarica, stampa della pagina, menu contestuale fuori dai campi di testo) sono disattivate.

### Backup

L'app crea da sola un backup del database ogni giorno (conserva gli ultimi 14) e prima di ogni aggiornamento dello schema, nella cartella `%APPDATA%\it.nutrea.studio\backups`.
Da *Impostazioni → Privacy & sicurezza → Archivio e backup* puoi creare un backup, salvarne una copia altrove, ripristinarne uno e controllare l'integrità dell'archivio.
*Esporta tutti i dati (ZIP)* crea invece un archivio leggibile con `dati.json`, i CSV di pazienti, visite, pagamenti e appuntamenti, e tutti i PDF dei piani.

Schema, convenzioni e come aggiungere una migrazione: [app/src/db/README.md](app/src/db/README.md).

## Cosa fa davvero e cosa resta da fare

Rispetto al prototipo, dove tutto era dimostrativo:

| Funzione | Stato |
|---|---|
| Pazienti, anagrafica, consensi, archiviazione ed eliminazione | ✅ salvati in SQLite |
| Visite, peso, composizione, circonferenze, grafici e variazioni | ✅ calcolati dai dati |
| Agenda: prenotazione, spostamento, annullamento, sovrapposizioni, orari dello studio | ✅ |
| Promemoria WhatsApp del giorno prima | ✅ da *Oggi*, un clic per paziente (apre WhatsApp con il messaggio) |
| Pagamenti, numerazione fatture, fattura PDF, sollecito su WhatsApp | ✅ |
| Esportazione CSV per il commercialista ed esportazione completa ZIP | ✅ |
| Piano nutrizionale: PDF allegato, editor giorno × pasto con il PDF affiancato, versioni | ✅ |
| Lettura automatica del PDF della dieta (giorni, pasti, alimenti, grammature, alternative, macro) | ✅ per PDF con testo: formato Progeo Medical e piani impaginati a colonne (es. giorni ON/OFF/RESET). Le righe incerte sono evidenziate in ambra |
| Anteprima dell'app paziente (Oggi, La mia dieta, Progressi, Studio) | ✅ con i dati reali |
| Blocco con PIN all'avvio | ✅ |
| PDF scansionati (immagini senza testo) | ⏳ serve l'OCR: per ora il piano si trascrive a mano con il PDF affiancato |
| App paziente online (`app.diet.it/p/{token}`), registro accessi, consenso digitale | ⏳ serve un server: i link vengono generati e revocati, ma non sono ancora raggiungibili. Intanto si invia il PDF del piano |
| Invio telematico a SdI e Sistema TS | ⏳ serve un intermediario: per ora PDF ed esportazione CSV |

Due schermate non c'erano nel design e seguono lo stesso linguaggio visivo:

- **Oggi**: appuntamenti del giorno, promemoria per domani, pagamenti in sospeso, piani da inviare, pazienti da ricontattare.
- **Piani nutrizionali**: elenco di tutti i piani, con filtri per stato.
