import type { Settings } from './types';

// Valori iniziali delle impostazioni (dal design "Impostazioni"). Il profilo parte vuoto
// tranne quando si caricano i dati demo.
export const DEFAULT_SETTINGS: Settings = {
  prof: { name: '', title: 'Biologa nutrizionista', albo: '', piva: '', addr: '', phone: '', email: '', pec: '' },
  hours: [
    { day: 'Lunedì', on: true, a: '09:00', b: '13:00', c: '14:30', d: '19:00' },
    { day: 'Martedì', on: true, a: '09:00', b: '13:00', c: '14:30', d: '19:00' },
    { day: 'Mercoledì', on: true, a: '09:00', b: '13:00', c: '14:30', d: '19:00' },
    { day: 'Giovedì', on: true, a: '09:00', b: '13:00', c: '14:00', d: '19:00' },
    { day: 'Venerdì', on: true, a: '09:00', b: '13:00', c: '14:30', d: '18:00' },
    { day: 'Sabato', on: true, a: '09:00', b: '12:30', c: '', d: '' },
    { day: 'Domenica', on: false, a: '', b: '', c: '', d: '' },
  ],
  rates: [
    { name: 'Prima visita + piano', price: 120, dur: '60 min' },
    { name: 'Controllo', price: 70, dur: '30 min' },
    { name: 'Controllo + nuovo piano', price: 90, dur: '45 min' },
    { name: 'Pacchetto 3 controlli', price: 170, dur: '3 × 30 min' },
    { name: 'Consulenza online', price: 60, dur: '30 min' },
    { name: 'Bioimpedenziometria', price: 40, dur: '15 min' },
  ],
  bill: { sdi: true, ts: true, bollo: true, regime: 'Forfettario (RF19)', cassa: 'ENPAB 4%', iva: 'Art. 10 n.18 DPR 633/72', invoiceMin: 1 },
  dur: { prima: 60, controllo: 30, online: 30, buffer: 0 },
  expiry: 'Fino a revoca',
  appDomain: 'app.diet.it',
  remote: { url: '', key: '' },
  app: { weight: true, meas: true, pdf: true, checks: true, install: true },
  tpl: [
    "Ciao {nome}, ti ricordo l'appuntamento di {data} alle {ora} presso lo studio. A presto! — {studio}",
    'Ciao {nome}, ecco il tuo nuovo piano nutrizionale: {link} — aprilo e aggiungilo alla schermata Home.',
    'Gentile {nome}, le ricordo il saldo di € {importo} per la visita del {data}. Grazie! — {studio}',
  ],
  priv: { pin: false, consent: true, log: true },
  pin: '',
  logo: null,
  photo: null,
};

export const DEMO_PROFILE: Settings['prof'] = {
  name: 'Dott.ssa Elena Marchi', title: 'Biologa nutrizionista', albo: 'ONB n. AA_071245', piva: '03918470376',
  addr: 'Via Santo Stefano 42, Bologna', phone: '+39 051 000 0000', email: 'studio@marchi-nutrizione.it', pec: 'e.marchi@pec.it',
};

export const PAYMENT_METHODS = ['POS', 'Bonifico', 'Satispay', 'Contanti', 'PayPal'];
export const METHOD_COLORS: Record<string, string> = { POS: '#1E5A5F', Bonifico: '#7FA08A', Satispay: '#2F7A7D', Contanti: '#C9B99A', PayPal: '#A9C6B1' };

export const GOALS = ['Perdita di peso', 'Ricomposizione corporea', 'Aumento massa', 'Gestione patologia', 'Gravidanza / allattamento', 'Performance sportiva'];
export const ACTIVITIES = ['Sedentaria', 'Leggera (1–2×/sett.)', 'Moderata (3–4×/sett.)', 'Intensa (5+×/sett.)'];
export const SOURCES = ['Passaparola', 'Medico di base', 'Instagram', 'Google', 'Altro'];
export const CHIP_GROUPS: [string, string, string[]][] = [
  ['cond', 'Condizioni cliniche', ['Ipotiroidismo', 'Diabete tipo 2', 'Ipertensione', 'Colesterolo alto', 'PCOS', 'Reflusso', 'Celiachia', 'Gravidanza', 'DCA (storico)']],
  ['intol', 'Intolleranze e allergie', ['Lattosio', 'Glutine', 'Frutta secca', 'Crostacei', 'Nichel', 'Uova']],
  ['pref', 'Preferenze alimentari', ['Vegetariana', 'Vegana', 'No carne rossa', 'Halal', 'No pesce']],
];
