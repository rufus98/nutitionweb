# Nutrea · web app dei pazienti

La web app che il paziente apre dal link personale `https://<dominio>/p/{token}` ricevuto dallo studio su WhatsApp o per email.
Non servono account né password, e si può aggiungere alla schermata Home come un'app (PWA).

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
  src/App.tsx           percorsi /p/{token} e /, caricamento, schermate di errore
  src/api.ts            GET dei dati, copia offline, invio del consenso
  src/device.ts         memoria per link, invito "Aggiungi alla Home", manifest per link
  src/demo.ts           dati dimostrativi per /p/demo
app/src/patientApp/     condiviso con l'app desktop
  PatientApp.tsx        l'interfaccia (Oggi, La mia dieta, Progressi, Studio, consenso, lista spesa)
  view.ts               il contratto dei dati (PatientView)
  buildView.ts          costruisce PatientView dall'archivio dello studio (da usare anche nel server)
```

## Contratto con il server

Il server pubblica i dati che lo studio condivide. Deve usare `buildPatientView()` di `app/src/patientApp/buildView.ts`, così l'anteprima e l'app restano identiche.

### `GET /api/p/{token}`

| Risposta | Quando | Cosa fa l'app |
|---|---|---|
| `200` + JSON `PatientView` | link attivo | mostra i dati e ne salva una copia sul telefono |
| `404` | token inesistente | "Link non valido" e cancella la copia salvata |
| `410` | link disattivato dallo studio (`link_on = 0`) | "Link disattivato" e cancella la copia salvata |
| `5xx` / rete assente | | mostra la copia salvata con "Offline · dati del …"; senza copia, "Riprova" |

`PatientView` è definito in `app/src/patientApp/view.ts`. Esempio ridotto:

```json
{
  "v": 1,
  "patient": { "first": "Giulia", "targetKg": 74 },
  "plan": { "version": 3, "since": "2026-09-15", "hasPdf": true, "data": { "title": "…", "days": [ … ], "notes": [ … ] } },
  "visits": [ { "date": "2026-03-10", "kg": 84.6, "cm": { "vita": 98, "fianchi": 106 } } ],
  "nextAppointment": { "date": "2026-11-11", "time": "17:30", "type": "controllo" },
  "studio": { "name": "Dott.ssa Elena Marchi", "title": "Biologa nutrizionista", "city": "Bologna", "address": "…", "hours": "Lun–Ven 09:00–19:00", "phone": "…", "email": "…", "whatsapp": "39…", "photo": null },
  "features": { "checks": true, "weight": true, "meas": true, "pdf": true, "install": true },
  "consent": { "required": false, "studio": "Dott.ssa Elena Marchi" },
  "links": { "pdf": "/api/p/{token}/pdf" }
}
```

- `plan` è la versione **pubblicata** ("Condividi" nell'app desktop). Le bozze e i piani salvati ma non condivisi non vanno mai inviati.
- `v` è la versione del formato. Se il server ne invia una diversa, l'app chiede di aggiornare la pagina.
- Intestazioni consigliate: `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`.

### `POST /api/p/{token}/consent`

Corpo `{"accepted": true}`. Risponde `204`, oppure `410` se il link è disattivato. Imposta `consent_app = 1` sul paziente. Se il registro accessi è attivo, annota data e ora.

### `GET /api/p/{token}/pdf`

Il PDF originale del piano pubblicato (`Content-Type: application/pdf`, `Content-Disposition: inline`).
L'URL va messo in `links.pdf`. Se il PDF non c'è o lo studio non lo mostra, `links.pdf` è `null`.

### Registro accessi

Se in *Impostazioni → Privacy* il registro accessi è attivo, il server annota data e ora di ogni `GET /api/p/{token}`. L'app non deve fare altro.

## Sicurezza e privacy

- **Token**:
  - è l'unica credenziale: deve essere casuale e lungo. Oggi l'app desktop genera token di 8 caratteri (circa 47 bit, come nel design `gF7k2q9X`); prima di mettere online il servizio conviene portarli ad almeno 16. L'app web accetta da 6 a 64 caratteri, quindi i link già inviati continuano a funzionare;
  - l'app rifiuta tutto ciò che non è `[A-Za-z0-9_-]{6,64}`;
  - il server deve limitare i tentativi (rate limiting su 404) per impedire di indovinarlo.
- **Pagina**: `noindex` e `no-referrer` impediscono che il link finisca nei motori di ricerca o nei log di siti esterni (WhatsApp, mappe).
- **Dati sul telefono**: in `localStorage`, separati per link.
  - Ci sono la copia dei dati, le spunte dei pasti, la lista della spesa e l'invito all'installazione.
  - Se lo studio disattiva il link, la copia dei dati si cancella alla prima apertura con la rete.
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
