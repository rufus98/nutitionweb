# # Piattaforma Gestionale Nutrizionista

_Started 2026-10-21 13:56 UTC_

---

## User

Agisci come Senior Product Designer e UI/UX Architect specializzato in SaaS medicali/gestionali B2B e PWA mobile-first.

Devo progettare l'interfaccia e l'esperienza utente di una piattaforma gestionale dedicata a un nutrizionista professionista, composta da due ambienti distinti:
1. **Dashboard Gestionale Desktop/Tablet (per il Nutrizionista):** potente, pulita, rapida da navigare.
2. **PWA / Web App Mobile "Zero-Friction" (per il Paziente):** consultabile tramite link univoco tokenizzato, senza login/password, installabile su home screen (Add to Home).

---

### REQUISITI E FUNZIONALITÀ

#### 1. Area Nutrizionista (Dashboard Desktop):
* **Anagrafica Paziente:**
  - Dati personali (Nome, Cognome, Telefono con trigger WhatsApp/chiamata, Email, note cliniche di base).
* **Cartella Clinica & Monitoraggio:**
  - Cronologia Peso Corporeo (tabella + grafico interattivo di andamento temporale).
  - Cronologia Misure Corporee (circonferenze: vita, fianchi, braccia, cosce, torace con calcolo variazioni % o delta cm).
  - Storico Visite: pulsante rapido "Nuova Visita" per registrare data, parametri antropometrici correnti, note anamnestiche e obiettivi.
* **Gestione Pagamenti:**
  - Registro pagamenti (data, importo, metodo di pagamento, stato: Saldato/In sospeso, eventuale download ricevuta/fattura).
* **Modulo "Piano Nutrizionale" & OCR / Digitalizzazione:**
  - Area drag-and-drop per upload del PDF della dieta.
  - Simulazione del processo di digitalizzazione/anteprima della dieta strutturata (giorni della settimana, pasti: colazione, spuntini, pranzo, cena, grammature e note).
  - Tasto azione primaria: **"Genera e Condividi Link Paziente"** (con opzione copia link o invio diretto via WhatsApp/Email).

#### 2. Area Paziente (Mobile Web App / PWA):
* Accessibile direttamente da URL univoco (es. `app.diet.it/p/{token}`).
* Banner o prompt discreto nativo "Aggiungi alla schermata Home".
* Interfaccia pulita, ottimizzata per smartphone (Bottom Navigation o swipe tab):
  - **Oggi:** vista del piano pasti del giorno corrente con checklist o switch rapido tra i giorni della settimana.
  - **La mia dieta:** vista intera del piano nutrizionale digitalizzato + tasto per scaricare/visualizzare il PDF originale.
  - **I miei progressi:** grafici semplificati del peso e misure per mantenere alta la motivazione.
  - **Contatta lo studio:** pulsanti rapidi per messaggiare o chiamare il nutrizionista.

---

### OUTPUT RICHIESTO:

1. **Design System & Stile Visivo:**
   - Palette colori (consiglia toni adatti al settore salute/wellness, es. tinte salvia, navy o petrolio con accenti neutri e puliti).
   - Tipografia, spacing e gerarchia visiva.
2. **Information Architecture (Wireframe Logico / Flussi):**
   - Mappa della schermata scheda paziente (Nutrizionista) organizzata a tab o layout a 2/3 colonne (Overview, Visite & Misure, Dieta, Pagamenti).
   - Flusso dell'azione "Upload PDF -> Digitalizzazione -> Invio link".
3. **Specifica UI dei Componenti Chiave:**
   - Layout dettagliato della **Scheda Paziente (Desktop)**.
   - Layout dettagliato della **Web View Paziente (Mobile)**.
4. **Mockup / Codice Componenti (React + Tailwind CSS):**
   - Fornisci il codice dei componenti principali (es. la scheda paziente con il grafico peso e il modulo upload dieta, oppure la schermata mobile del paziente).

## Assistant

_[tool: read_skill_prompt]_

_[tool: update_todos]_

_[tool: dc_write]_

_[tool: show_html]_

_[tool: dc_write]_

_[tool: dc_write]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: ready_for_verification]_

Ho preparato tre file navigabili più il codice. Il verificatore sta ancora controllando la dashboard; l'app paziente e il documento del design system non li ho ancora aperti per un controllo visivo.

- **Design System & IA**: palette petrolio, salvia e ambra con il ruolo di ogni colore, tipografia (Figtree per l'interfaccia, IBM Plex Mono per etichette e dati), spacing e componenti base. Contiene anche la mappa della scheda paziente, il flusso PDF → digitalizzazione → verifica → link → invio (con i casi limite) e la struttura dell'app paziente.
- **Dashboard Nutrizionista**: le quattro tab funzionano.
  - **Overview**: grafico del peso con tooltip al passaggio del mouse e circonferenze con le variazioni.
  - **Visite & Misure**: tabelle con scelta tra Δ cm e Δ %, storico delle visite.
  - **Nuova visita**: apre un pannello laterale; salvando, il grafico e le misure si aggiornano.
  - **Piano nutrizionale**: si può trascinare un PDF o usare "Usa PDF di esempio". Dopo la simulazione dell'OCR compare l'anteprima per giorno, con i campi incerti in ambra, e poi la finestra "Genera e Condividi Link" (copia, WhatsApp, email, disattivazione del link).
  - **Pagamenti**: "In sospeso" è cliccabile per segnarlo come saldato o mandare un sollecito.
- **App Paziente**: schermata da smartphone con le tab Oggi, La mia dieta, Progressi e Studio, un banner "Aggiungi alla Home" che si può chiudere e le specifiche di layout a fianco. Dal pannello Tweaks puoi nascondere il banner e scegliere la tab iniziale.
- **Codice in `/code`**: `tailwind.config.js` con i colori e i font del design system, `PatientRecord.jsx` (scheda paziente con grafico Recharts, upload della dieta e finestra di condivisione) e `PatientMobileApp.jsx` (app paziente con gestione dell'installazione su Android e iOS).

Nel codice React mancano alcune parti: la colonna laterale dell'Overview, la tab Visite & Misure, il pannello "Nuova visita" e la vista "La mia dieta" sono solo segnaposto. La digitalizzazione con OCR è simulata. "Registra pagamento" e i link PDF e Fattura non fanno ancora nulla.

## User

Found issues — fixing…

## Assistant

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Ho corretto i due problemi; la verifica dell'app paziente è in corso.

- **App Paziente**: nella tab "Oggi" la barra di avanzamento sotto la fila dei giorni ora si vede. Prima si schiacciava a zero quando il contenuto superava l'altezza dello schermo.
- **Dashboard**: l'ultima data sotto il grafico del peso ("14 ott") ora resta su una riga sola.

## User

Creami anche la pagina della lista completa dei pazienti

## Assistant

_[tool: dc_write]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Ho creato la pagina con l'elenco dei pazienti (**Lista Pazienti**), con 20 pazienti di esempio; la verifica è in corso.

- **Ricerca**: filtra in tempo reale per nome, obiettivo o numero di telefono.
- **Filtri rapidi**: Tutti, In percorso, Da ricontattare, Pagamenti in sospeso, Piano da inviare, ciascuno con il numero di pazienti.
- **Ordinamento**: si ordina cliccando sull'intestazione di ogni colonna.
- **Righe**: per ogni paziente mostrano:
  - telefono, con un tasto per WhatsApp;
  - ultima visita, con quanto tempo è passato;
  - prossima visita, oppure "Da fissare";
  - peso e variazione;
  - stato del link al piano;
  - pagamenti in sospeso.
- **Collegamenti**: cliccando una riga si apre la scheda paziente. Dalla scheda, "Pazienti" nella barra laterale e nel percorso in alto riporta all'elenco.

Tutte le righe aprono la stessa scheda di esempio (Giulia Ferrante). "Esporta CSV", "+ Nuovo paziente" e i numeri di pagina sono solo grafici e non fanno ancora nulla.

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

Ho corretto i testi che andavano a capo nell'elenco pazienti; la verifica è in corso.

- I filtri rapidi, le intestazioni delle colonne, i numeri di telefono e le etichette di stato ora restano su una riga sola.
- Ho ridistribuito la larghezza delle colonne: la colonna con i nomi ha più spazio, quindi i nomi non vengono più tagliati.
- La larghezza minima della pagina è passata da 1180 a 1280 px, perché l'elenco stia su una riga senza schiacciarsi.

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

Ho ristretto le colonne e lo spazio tra di esse nell'elenco pazienti, così a 1280 px l'ultima colonna (Pagamenti) e la freccia a destra non vengono più tagliate. Al minimo di 1280 px la tabella occupa circa 912 px contro i 944 disponibili. La verifica è in corso.

## User

Crea anche la sezione agenda, impostazioni e pagamenti

## Assistant

_[tool: dc_write]_

_[tool: dc_write]_

_[tool: dc_write]_

_[tool: run_script]_

_[tool: ready_for_verification]_

Ho creato le tre sezioni: **Agenda**, **Pagamenti** e **Impostazioni**. Le voci della barra laterale ora collegano tutte le pagine; "Oggi" e "Piani nutrizionali" restano senza pagina. È in verifica solo l'Agenda; Pagamenti e Impostazioni non le ho ancora aperte per un controllo visivo.

- **Agenda**
  - Vista della settimana da lunedì a sabato, con frecce per cambiare settimana e tasto "Oggi".
  - Colori diversi per prima visita, controllo e visita online; le pause sono tratteggiate e la riga arancione segna l'ora attuale.
  - Cliccando uno slot libero si apre la prenotazione già compilata con giorno e ora, con avviso se si sovrappone a un altro appuntamento e promemoria WhatsApp.
  - Cliccando un appuntamento si vede il dettaglio, con WhatsApp, Chiama, apertura della scheda paziente e annullamento.
- **Pagamenti**
  - Riepilogo: incassato del mese, da incassare, incassato dell'anno, fatture emesse.
  - Grafico degli incassi mensili, con il dettaglio passando il mouse, e ripartizione per metodo di pagamento.
  - Elenco dei movimenti con ricerca e filtri. Cliccando "In sospeso" il pagamento diventa saldato con il numero di fattura successivo; "Sollecita" apre WhatsApp.
  - "Registra pagamento" ha le prestazioni con il prezzo già compilato.
- **Impostazioni**: sette sezioni. Quando modifichi qualcosa compare in basso una barra con "Salva modifiche" e "Annulla".
  - Profilo studio.
  - Orari di ricevimento, con interruttore per ogni giorno.
  - Tariffe modificabili.
  - Fatturazione: invio automatico allo SdI, Sistema TS, marca da bollo.
  - Cosa vede il paziente nell'app.
  - Modelli dei messaggi WhatsApp, con le variabili da inserire.
  - Privacy (GDPR).

I dati di pagamenti e agenda sono di esempio e le modifiche non restano salvate se ricarichi la pagina. Le settimane diverse da quella corrente sono generate in automatico. Questi pulsanti sono solo grafici e non fanno ancora nulla:
- "Esporta per commercialista"
- "Carica logo"
- "Esporta tutti i dati"
- "Revoca tutti i link paziente"

## User

Crea anche la sezione nuovo paziente

## Assistant

_[tool: dc_write]_

_[tool: run_script]_

_[tool: ready_for_verification]_

Ho creato la pagina **Nuovo Paziente**, che si apre da "+ Nuovo paziente" nell'elenco pazienti; la verifica è in corso.

È una procedura in 4 passi:
1. **Anagrafica**: nome, cognome e telefono sono obbligatori. Se mancano, i campi diventano rossi e non si può passare ai passi successivi. Ci sono anche sesso e contatto preferito.
2. **Anamnesi**: condizioni cliniche, intolleranze e preferenze da selezionare (diventano le etichette della scheda), più farmaci, attività fisica e note.
3. **Misure iniziali**: altezza, peso, massa grassa e circonferenze, con BMI e rapporto vita/fianchi calcolati mentre scrivi. Si può saltare e inserirle alla prima visita.
4. **Obiettivi e consenso**: obiettivo principale, peso obiettivo, provenienza del paziente e consensi (privacy, app, comunicazioni).

A destra un riepilogo della scheda si aggiorna mentre compili. Alla fine si apre una schermata di conferma con "Prenota prima visita", "Invia link consenso su WhatsApp", "Apri scheda paziente" e "Aggiungi un altro paziente".

Il nuovo paziente non compare davvero nell'elenco e "Apri scheda paziente" porta alla scheda di esempio (Giulia Ferrante). Se il consenso privacy non è stato spuntato, la scheda viene creata comunque e la casella si segna da sola: va deciso se bloccare la creazione finché il paziente non lo firma.

