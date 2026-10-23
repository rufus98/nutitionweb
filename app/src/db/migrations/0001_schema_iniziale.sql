-- Schema della prima versione dell'app (ottobre 2026).
-- Non modificare le migrazioni già distribuite: ogni cambiamento va in una nuova migrazione.

CREATE TABLE patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  first TEXT NOT NULL, last TEXT NOT NULL, phone TEXT NOT NULL,
  email TEXT, dob TEXT, birthplace TEXT, cf TEXT, job TEXT,
  sex TEXT DEFAULT 'F', contact TEXT DEFAULT 'WhatsApp',
  tags TEXT DEFAULT '[]', drugs TEXT, activity TEXT, notes TEXT,
  height REAL, goal TEXT, target_kg REAL, source TEXT,
  consent_privacy INTEGER DEFAULT 0, consent_app INTEGER DEFAULT 1, consent_marketing INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1, token TEXT, link_on INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  date TEXT NOT NULL, type TEXT, kg REAL, fat REAL,
  vita REAL, fianchi REAL, torace REAL, braccio REAL, coscia REAL, polso REAL,
  note TEXT, goal TEXT
);
CREATE INDEX visits_patient ON visits(patient_id, date);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  date TEXT NOT NULL, description TEXT, method TEXT, amount REAL NOT NULL,
  paid INTEGER DEFAULT 0, invoice TEXT
);

CREATE TABLE appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  date TEXT NOT NULL, time TEXT NOT NULL, type TEXT NOT NULL, duration INTEGER NOT NULL,
  remind INTEGER DEFAULT 1, note TEXT
);
CREATE INDEX appts_date ON appointments(date);

CREATE TABLE plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
  pdf_name TEXT, pdf_b64 TEXT, data TEXT NOT NULL,
  created_at TEXT NOT NULL, published_at TEXT
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
