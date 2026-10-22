import type { Db } from './db';

// Migrazioni in ordine: l'indice+1 è la versione salvata in PRAGMA user_version.
const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE patients (
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
    )`,
    `CREATE TABLE visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      date TEXT NOT NULL, type TEXT, kg REAL, fat REAL,
      vita REAL, fianchi REAL, torace REAL, braccio REAL, coscia REAL, polso REAL,
      note TEXT, goal TEXT
    )`,
    `CREATE INDEX visits_patient ON visits(patient_id, date)`,
    `CREATE TABLE payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      date TEXT NOT NULL, description TEXT, method TEXT, amount REAL NOT NULL,
      paid INTEGER DEFAULT 0, invoice TEXT
    )`,
    `CREATE TABLE appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      date TEXT NOT NULL, time TEXT NOT NULL, type TEXT NOT NULL, duration INTEGER NOT NULL,
      remind INTEGER DEFAULT 1, note TEXT
    )`,
    `CREATE INDEX appts_date ON appointments(date)`,
    `CREATE TABLE plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      version INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      pdf_name TEXT, pdf_b64 TEXT, data TEXT NOT NULL,
      created_at TEXT NOT NULL, published_at TEXT
    )`,
    `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  ],
  // v2: booleani salvati come testo dalle prime build native → 1/0.
  [
    `UPDATE patients SET consent_privacy = CASE consent_privacy WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE consent_privacy END`,
    `UPDATE patients SET consent_app = CASE consent_app WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE consent_app END`,
    `UPDATE patients SET consent_marketing = CASE consent_marketing WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE consent_marketing END`,
    `UPDATE patients SET active = CASE active WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE active END`,
    `UPDATE patients SET link_on = CASE link_on WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE link_on END`,
    `UPDATE payments SET paid = CASE paid WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE paid END`,
    `UPDATE appointments SET remind = CASE remind WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE remind END`,
  ],
];

export async function migrate(db: Db) {
  const [{ user_version }] = await db.select<{ user_version: number }>('PRAGMA user_version');
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    for (const sql of MIGRATIONS[v]) await db.execute(sql);
    await db.execute(`PRAGMA user_version = ${v + 1}`);
  }
}
