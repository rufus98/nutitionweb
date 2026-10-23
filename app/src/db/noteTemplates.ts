// Modelli delle indicazioni generali, ripresi dai piani in uso nello studio.
// Si aggiungono al piano con un clic dall'editor e restano modificabili.
import type { PlanNote } from './types';

export interface NoteTemplate extends PlanNote { id: string; kinds: ('weekly' | 'onoff')[] }

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: 'norme', kinds: ['weekly'], title: 'Norme generali',
    text: `Di seguito le indico alcuni comportamenti che devono essere evitati al fine di non compromettere i presupposti scientifici della dieta:
- diminuire o incrementare le quantità di qualsiasi alimento presente nell'elaborato;
- saltare i pasti;
- invertire i giorni dieta;
- sostituire o spostare gli alimenti senza una mia precisa indicazione.`,
  },
  {
    id: 'cottura', kinds: ['weekly', 'onoff'], title: 'Metodi di cottura',
    text: `CARNE E PESCE: alla griglia, al forno, in padella, in umido, al cartoccio, lessati.
VERDURE: alla griglia, al forno, in padella, lessate, al vapore.`,
  },
  {
    id: 'personalizzazioni', kinds: ['weekly'], title: 'Personalizzazioni dei pasti',
    text: 'Le è consentito unire in un unico piatto due o più portate di un pasto, quando gli alimenti che lo compongono lo consentono e in conformità con i propri gusti, avendo cura di non modificare le quantità indicate. Per esempio, potrà utilizzare tutto o parte del contorno e/o del secondo assegnato per condire il primo piatto, oppure tutta o parte della frutta per arricchire un contorno o un secondo.',
  },
  {
    id: 'acqua', kinds: ['weekly', 'onoff'], title: 'Acqua',
    text: `Ogni giorno beva acqua di fonte o naturale non gassata, preferibilmente a temperatura ambiente e in modo da soddisfare il senso della sete ogni qual volta si avverte.
La quantità raccomandata è di almeno 1-1,5 litri, in condizioni normali.
Tale quantità dovrebbe essere incrementata in presenza di elevate temperature, in caso di esercizio fisico e in quelle condizioni in cui darò specifiche indicazioni in sede di visita.
Può bere durante i pasti ma senza eccedere, al fine di non diluire troppo i succhi gastrici che sono fondamentali per un efficace processo digestivo.`,
  },
  {
    id: 'surgelati', kinds: ['weekly'], title: 'Surgelati',
    text: 'È consentito l’uso dei surgelati per tutti quei prodotti, principalmente pesce e verdure, difficilmente reperibili freschi.',
  },
  {
    id: 'spezie', kinds: ['weekly'], title: 'Spezie e aromi',
    text: 'Al fine di rendere più gradevoli le varie pietanze, viene in alcuni casi consigliato l’utilizzo, se gradito, di spezie e aromi da cucina in modeste quantità.',
  },
  {
    id: 'sale', kinds: ['weekly'], title: 'Sale',
    text: 'L’uso del sale nella preparazione dei cibi le è consentito, ma il quantitativo utilizzato dovrà essere quello minimo sufficiente a soddisfare il gusto.',
  },
  {
    id: 'arco', kinds: ['weekly'], title: 'Nell’arco della giornata',
    text: 'Gli alimenti sotto questa dicitura potranno essere distribuiti in qualsiasi momento della giornata, durante i pasti o al di fuori di essi; ricordi, tuttavia, che non sono facoltativi e devono essere consumati in aggiunta a quelli precedentemente assegnati nello stesso giorno dieta.',
  },
  {
    id: 'alternative', kinds: ['weekly'], title: 'Alternative alimentari',
    text: 'In una sezione apposita dell’elaborato troverà delle tabelle che le saranno utili per alternare alcuni alimenti presenti nel piano alimentare. Nelle tabelle figurano in alto gli alimenti di prima scelta con le quantità assegnate nel piano alimentare e, nelle righe sottostanti, gli alimenti alternativi. Potrà effettuare le sostituzioni ricordando, comunque, che gli alimenti di prima scelta sono quelli che dovrà assumere con maggiore frequenza.',
  },
  {
    id: 'pesi', kinds: ['weekly', 'onoff'], title: 'Pesi e misure',
    text: 'Il peso degli alimenti è sempre considerato “a crudo” tranne i casi in cui troverà una diversa indicazione. Pesi, quindi, i cibi prima dell’eventuale cottura e, nel caso di alimenti surgelati, dopo averli scongelati; tenga presente, inoltre, che il peso si riferisce esclusivamente alla parte edibile (es.: la carne va pesata senza le ossa, la frutta senza la buccia e, quando presenti, i semi, il pesce dopo aver eliminato le parti non commestibili come testa, lisca, ecc.).',
  },
  {
    id: 'bilancia', kinds: ['weekly'], title: 'Bilancia pesa-alimenti',
    text: 'Prima di iniziare la dieta e poi periodicamente, controlli la precisione della bilancia con cui pesa gli alimenti; per farlo effettui più prove con prodotti di cui conosce esattamente il peso e che può facilmente trovare in cucina, da quelli più piccoli (es. biscotto, fetta biscottata ecc.) fino a quelli più grandi (es. una confezione di formaggio cremoso, il contenuto di un pacco di pasta, un kg di zucchero, ecc.).',
  },
  {
    id: 'approssimazione', kinds: ['weekly'], title: 'Approssimazione',
    text: 'Qualsiasi tipo di approssimazione può aumentare notevolmente il tempo necessario per il conseguimento dell’obiettivo terapeutico. Per aderire correttamente al piano alimentare occorre attenersi con precisione alla prescrizione dietetica e pesare accuratamente tutti gli alimenti espressi in grammatura.',
  },
  {
    id: 'altri', kinds: ['weekly'], title: 'Quando pesano gli altri',
    text: `Nel caso in cui a pesare gli alimenti o a cucinare siano altre persone, occorre accertarsi che queste non effettuino i seguenti errori:
- regolarsi “ad occhio” per la quantificazione dei cibi;
- incrementare le quantità degli alimenti assegnati.`,
  },
  {
    id: 'intro-flex', kinds: ['onoff'], title: '',
    text: `Il piano alimentare che segue è una versione alternativa al classico schema giornaliero e ha come obiettivo principale quello di insegnarti a gestire la tua giornata in autonomia.
Per raggiungere i risultati desiderati e soprattutto per mantenerli, non bisogna seguire regole rigide o privazioni estreme, bensì trovare un equilibrio sostenibile che si adatti davvero alla vita di tutti i giorni.
Questo approccio alimentare offre opzioni intercambiabili e la libertà di creare i pasti in base ai tuoi gusti, alle tue esigenze e al tuo tempo. Nei giorni definiti “ON” assumerai un introito calorico maggiore rispetto ai giorni “OFF”. I giorni definiti di “RESET” serviranno a compensare eventuali fuori pasto.`,
  },
  {
    id: 'legenda', kinds: ['onoff'], title: 'Legenda: ON, OFF e RESET',
    text: `ON (Giorni di allenamento)
OFF (Giorni di riposo)
RESET (Giorni successivi a pasti liberi): seguire “sempre” nei giorni seguenti a fuori pasto (es. se effettui un fuori pasto il sabato sera, seguirai lo schema RESET di domenica). Se dovessi allenarti il giorno dopo, potrai seguire ugualmente lo schema RESET effettuando però il pasto post allenamento dello schema ON.`,
  },
  {
    id: 'grammature', kinds: ['onoff'], title: 'Grammature speciali',
    text: 'Se un alimento ha una dose diversa rispetto a quella standard prevista per la sua riga, il peso corretto sarà evidenziato da un asterisco (*).',
  },
  {
    id: 'allenamento', kinds: ['onoff'], title: 'Allenamento e pasti',
    text: 'Se ti alleni prima di cena (2-3 h prima), inverti PRANZO e CENA. Se ti alleni prima o dopo pranzo (2 h prima e fino a 3 h dopo), segui le normali indicazioni assegnate. Puoi comporre i pasti a tuo piacimento, ricordando di selezionare sempre un alimento per ogni riga.',
  },
];

/** Sezioni proposte in un piano nuovo, in base alla tipologia. */
export const DEFAULT_NOTES: Record<'weekly' | 'onoff', string[]> = {
  weekly: ['norme', 'cottura', 'personalizzazioni', 'acqua', 'surgelati', 'spezie', 'sale', 'pesi'],
  onoff: ['intro-flex', 'legenda', 'grammature', 'allenamento'],
};

export const noteFromTemplate = (id: string): PlanNote => {
  const t = NOTE_TEMPLATES.find((x) => x.id === id)!;
  return { title: t.title, text: t.text };
};
