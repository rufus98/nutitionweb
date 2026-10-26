# Nutrea · web app dei pazienti

La web app che il paziente apre dal link personale `https://<dominio>/p/{token}` ricevuto dallo studio su WhatsApp o per email.
Al primo accesso il paziente sceglie una password; poi entra con il link e la password. Si può aggiungere alla schermata Home come un'app (PWA).

- **Oggi**: i pasti del giorno con le spunte e la barra di avanzamento, le opzioni A/B dei pasti e i gruppi "scegli 1".
- **La mia dieta**:
  - il piano giorno per giorno (o ON/OFF/RESET) e le indicazioni generali in sezioni;
  - il PDF originale;
  - la lista della spesa con le spunte.
- **Progressi**: kg persi, percentuale del percorso, grafico del peso, centimetri persi. Niente BMI né massa grassa.
- **Studio**: WhatsApp, telefono, email, prossimo appuntamento, indirizzo con mappa, orari.
- Consenso informato al primo accesso, se lo studio lo richiede.
- Funziona anche offline. Gestisce i link non validi o disattivati.

L'interfaccia è **la stessa** dell'anteprima "Anteprima app" dell'app desktop. Il componente è in `app/src/patientApp/` ed è condiviso tra i due progetti, così ciò che lo studio vede in anteprima è ciò che vede il paziente.

## Comandi

```sh
npm install
npm run dev       # http://localhost:5180/p/demo  (dati dimostrativi, senza server)
npm test          # caricamento dati, offline, link disattivati, resa dell'app
npm run build     # file statici in dist/
npm run preview   # prova della build (service worker attivo)
```

Per usare un server delle API su un'altra origine: `VITE_API_BASE=https://api.esempio.it npm run build`.
Senza questa variabile le chiamate vanno alla stessa origine della web app (`/api/...`).

## Struttura

```
web/
  index.html            meta (noindex, no-referrer), icone, manifest di base
  public/sw.js          service worker: mette in cache solo l'app, mai i dati del paziente
  src/App.tsx           percorsi /p/{token} e /, caricamento, accesso, schermate di errore
  src/Access.tsx        "scegli la tua password" (attivazione) e accesso con la password
  src/api.ts            attivazione, login, sessione, dati, copia offline, consenso, PDF, uscita
  src/device.ts         memoria per link, invito "Aggiungi alla Home", manifest per link
  src/demo.ts           dati dimostrativi per /p/demo
app/src/patientApp/     condiviso con l'app desktop
  PatientApp.tsx        l'interfaccia (Oggi, La mia dieta, Progressi, Studio, consenso, lista spesa)
  view.ts               il contratto dei dati (PatientView)
  buildView.ts          costruisce PatientView dall'archivio dello studio (l'app desktop lo invia al server)
```

## Accesso: link personale + password

Il server è nella cartella `server/` (vedi `server/README.md`).

1. **Prima volta**: il paziente apre il link di attivazione `/p/{token}?a={codice}` ricevuto dallo studio e sceglie la password.
   - Il codice viene tolto subito dall'indirizzo.
   - I moduli funzionano con i gestori di password: il "nome utente" è il link.
2. **Volte successive**: il paziente apre `/p/{token}` e inserisce la password.
   - La sessione (30 giorni) resta salvata sul telefono.
   - "Esci da questo telefono", nel tab Studio, la chiude e cancella i dati salvati.
3. **Password dimenticata**: lo studio invia un nuovo link di attivazione. Dalla schermata di accesso il paziente può chiedere aiuto allo studio su WhatsApp.

| Risposta di `GET /api/p/{token}` | Cosa fa l'app |
|---|---|
| `200` + `PatientView` | mostra i dati e ne salva una copia sul telefono |
| `401 { state: 'activate' \| 'login', firstName, studio }` | schermata "scegli la password" o di accesso |
| `404` / `410` | "Link non valido" / "Link disattivato"; cancella sessione e copia salvata |
| rete assente / `5xx` | mostra la copia salvata con "Offline · dati del …" (solo con una sessione valida) |

Il contratto completo (endpoint, `PatientView`, consenso, PDF) è in `server/README.md` e in `app/src/patientApp/view.ts`.

In sviluppo, `npm run dev` inoltra `/api` al server locale (`http://localhost:8080`; per cambiarlo usa `API_TARGET`).

## Sicurezza e privacy

- **Accesso**: link personale **e** password scelta dal paziente. Il server conserva solo l'hash scrypt della password; blocchi e limiti dei tentativi sono descritti in `server/README.md`.
- **Token del link**:
  - oggi l'app desktop genera token di 8 caratteri (circa 47 bit, come nel design `gF7k2q9X`). Con la password non basta più da solo per vedere i dati, ma conviene portarlo ad almeno 16 caratteri;
  - l'app web accetta da 6 a 64 caratteri, quindi i link già inviati continuano a funzionare, e rifiuta tutto ciò che non è `[A-Za-z0-9_-]{6,64}`.
- **Pagina**: `noindex` e `no-referrer` impediscono che il link finisca nei motori di ricerca o nei log di siti esterni (WhatsApp, mappe).
- **Dati sul telefono**: in `localStorage`, separati per link.
  - Ci sono la sessione, la copia dei dati, le spunte dei pasti, la lista della spesa e l'invito all'installazione.
  - Se lo studio disattiva il link o la sessione scade, sessione e copia dei dati si cancellano alla prima apertura con la rete.
  - "Esci da questo telefono" cancella sessione e copia dei dati.
  - Il service worker non salva mai le risposte delle API.
- **Dati inviati**: solo quelli che servono al paziente. `buildPatientView` esclude note cliniche, codice fiscale, massa grassa, pagamenti e note interne degli appuntamenti (lo verifica un test).

## Installazione sulla Home

- **Invito**: compare dalla seconda apertura, se lo studio lo ha attivato, e si nasconde per 30 giorni quando lo si chiude. Su Android usa il prompt di sistema, su iPhone mostra le istruzioni (Condividi → Aggiungi a Home).
- **Manifest**: viene generato per ogni link, così l'icona riapre `/p/{token}`. La pagina `/` riapre comunque l'ultimo link usato.

## Pubblicazione

`npm run build` produce file statici. Il server web deve:

1. servire `dist/` e rispondere con `index.html` a tutte le pagine `/p/*` (fallback SPA);
2. servire `sw.js` senza cache lunga (`Cache-Control: no-cache`) e i file in `/assets/` con cache lunga (hanno l'hash nel nome);
3. usare HTTPS, necessario per il service worker e l'installazione.
