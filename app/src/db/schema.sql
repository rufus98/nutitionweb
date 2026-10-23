-- Generato dai test (npm run db:schema): schema risultante da tutte le migrazioni. Non modificare a mano.

CREATE TABLE appointments (
  id                INTEGER PRIMARY KEY,
  patient_id        INTEGER NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
  date              TEXT    NOT NULL CHECK (date(date) IS date),
  time              TEXT    NOT NULL CHECK (time GLOB '[0-2][0-9]:[0-5][0-9]'),
  type              TEXT    NOT NULL CHECK (type IN ('prima', 'controllo', 'online')),
  duration          INTEGER NOT NULL CHECK (duration BETWEEN 5 AND 600),
  remind            INTEGER NOT NULL DEFAULT 1 CHECK (remind IN (0, 1)),
  -- quando è stato inviato il promemoria WhatsApp (dalla schermata "Oggi")
  reminder_sent_at  TEXT,
  note              TEXT,
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE documents (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  mime        TEXT    NOT NULL DEFAULT 'application/pdf',
  size        INTEGER NOT NULL CHECK (size >= 0),
  data_b64    TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE patients (
  id                INTEGER PRIMARY KEY,
  code              TEXT    NOT NULL UNIQUE CHECK (code GLOB 'PZ-[0-9][0-9][0-9][0-9]*'),
  first             TEXT    NOT NULL CHECK (length(trim(first)) > 0),
  last              TEXT    NOT NULL CHECK (length(trim(last)) > 0),
  phone             TEXT    NOT NULL CHECK (length(trim(phone)) > 0),
  email             TEXT,
  dob               TEXT    CHECK (dob IS NULL OR date(dob) IS dob),
  birthplace        TEXT,
  cf                TEXT,
  job               TEXT,
  sex               TEXT    NOT NULL DEFAULT 'F' CHECK (sex IN ('F', 'M')),
  contact           TEXT    NOT NULL DEFAULT 'WhatsApp' CHECK (contact IN ('WhatsApp', 'Telefono', 'Email')),
  tags              TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array'),
  drugs             TEXT,
  activity          TEXT,
  notes             TEXT,
  height            REAL    CHECK (height IS NULL OR height BETWEEN 50 AND 250),
  goal              TEXT,
  target_kg         REAL    CHECK (target_kg IS NULL OR target_kg BETWEEN 20 AND 400),
  source            TEXT,
  consent_privacy   INTEGER NOT NULL DEFAULT 0 CHECK (consent_privacy IN (0, 1)),
  consent_app       INTEGER NOT NULL DEFAULT 1 CHECK (consent_app IN (0, 1)),
  consent_marketing INTEGER NOT NULL DEFAULT 0 CHECK (consent_marketing IN (0, 1)),
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  token             TEXT    UNIQUE,
  link_on           INTEGER NOT NULL DEFAULT 1 CHECK (link_on IN (0, 1)),
  -- giorno di apertura della scheda ("Paziente dal")
  created_at        TEXT    NOT NULL CHECK (date(created_at) IS created_at),
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE payments (
  id              INTEGER PRIMARY KEY,
  patient_id      INTEGER REFERENCES patients (id) ON DELETE SET NULL,
  patient_name    TEXT    NOT NULL,
  patient_cf      TEXT,
  date            TEXT    NOT NULL CHECK (date(date) IS date),
  description     TEXT    NOT NULL,
  method          TEXT    NOT NULL,
  amount_cents    INTEGER NOT NULL CHECK (amount_cents > 0),
  paid            INTEGER NOT NULL DEFAULT 0 CHECK (paid IN (0, 1)),
  paid_at         TEXT    CHECK (paid_at IS NULL OR date(paid_at) IS paid_at),
  invoice_year    INTEGER CHECK (invoice_year IS NULL OR invoice_year BETWEEN 2000 AND 2999),
  invoice_number  INTEGER CHECK (invoice_number IS NULL OR invoice_number > 0),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((invoice_year IS NULL) = (invoice_number IS NULL)),
  CHECK (paid = 1 OR invoice_number IS NULL),
  UNIQUE (invoice_year, invoice_number)
);

CREATE TABLE plans (
  id            INTEGER PRIMARY KEY,
  patient_id    INTEGER NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
  version       INTEGER NOT NULL CHECK (version > 0),
  status        TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  document_id   INTEGER REFERENCES documents (id) ON DELETE SET NULL,
  data          TEXT    NOT NULL CHECK (json_valid(data)),
  created_at    TEXT    NOT NULL CHECK (date(created_at) IS created_at),
  published_at  TEXT    CHECK (published_at IS NULL OR date(published_at) IS published_at),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), saved_at TEXT CHECK (saved_at IS NULL OR date(saved_at) IS saved_at),
  UNIQUE (patient_id, version),
  CHECK (status = 'draft' OR published_at IS NOT NULL)
);

CREATE TABLE schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE visits (
  id          INTEGER PRIMARY KEY,
  patient_id  INTEGER NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
  date        TEXT    NOT NULL CHECK (date(date) IS date),
  type        TEXT    NOT NULL DEFAULT 'Controllo',
  kg          REAL    CHECK (kg IS NULL OR kg BETWEEN 2 AND 400),
  fat         REAL    CHECK (fat IS NULL OR fat BETWEEN 1 AND 80),
  vita        REAL    CHECK (vita IS NULL OR vita > 0),
  fianchi     REAL    CHECK (fianchi IS NULL OR fianchi > 0),
  torace      REAL    CHECK (torace IS NULL OR torace > 0),
  braccio     REAL    CHECK (braccio IS NULL OR braccio > 0),
  coscia      REAL    CHECK (coscia IS NULL OR coscia > 0),
  polso       REAL    CHECK (polso IS NULL OR polso > 0),
  note        TEXT,
  goal        TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX appointments_date_time ON appointments (date, time);

CREATE INDEX appointments_patient_date ON appointments (patient_id, date);

CREATE INDEX patients_name ON patients (last COLLATE NOCASE, first COLLATE NOCASE);

CREATE INDEX payments_date ON payments (date);

CREATE INDEX payments_patient_date ON payments (patient_id, date);

CREATE INDEX payments_pending ON payments (patient_id) WHERE paid = 0;

CREATE UNIQUE INDEX plans_one_draft ON plans (patient_id) WHERE status = 'draft';

CREATE UNIQUE INDEX plans_one_published ON plans (patient_id) WHERE status = 'published';

CREATE INDEX visits_patient_date ON visits (patient_id, date);

CREATE VIEW patient_summary AS
SELECT p.*,
  (SELECT max(v.date) FROM visits v WHERE v.patient_id = p.id) AS last_visit,
  (SELECT min(a.date) FROM appointments a WHERE a.patient_id = p.id AND a.date >= date('now', 'localtime')) AS next_visit,
  (SELECT v.kg FROM visits v WHERE v.patient_id = p.id AND v.kg IS NOT NULL ORDER BY v.date DESC, v.id DESC LIMIT 1) AS kg,
  (SELECT v.kg FROM visits v WHERE v.patient_id = p.id AND v.kg IS NOT NULL ORDER BY v.date ASC, v.id ASC LIMIT 1) AS kg_start,
  (SELECT CASE WHEN pl.status = 'draft' AND pl.saved_at IS NOT NULL THEN 'ready' ELSE pl.status END
     FROM plans pl WHERE pl.patient_id = p.id AND pl.status <> 'archived' ORDER BY pl.version DESC LIMIT 1) AS plan_status,
  (SELECT coalesce(sum(y.amount_cents), 0) / 100.0 FROM payments y WHERE y.patient_id = p.id AND y.paid = 0) AS due
FROM patients p;

CREATE VIEW payments_view AS
SELECT y.id, y.patient_id, y.date, y.description, y.method,
       y.amount_cents / 100.0 AS amount, y.paid, y.paid_at, y.invoice_year, y.invoice_number,
       CASE WHEN y.invoice_number IS NOT NULL THEN 'FT ' || y.invoice_number || '/' || substr(y.invoice_year, 3, 2) END AS invoice,
       coalesce(p.first || ' ' || p.last, y.patient_name) AS name,
       coalesce(p.cf, y.patient_cf) AS cf,
       p.phone AS phone
FROM payments y LEFT JOIN patients p ON p.id = y.patient_id;

CREATE TRIGGER appointments_time_insert BEFORE INSERT ON appointments
WHEN NEW.time > '23:59'
BEGIN SELECT RAISE(ABORT, 'Orario non valido: usa il formato HH:MM tra 00:00 e 23:59'); END;

CREATE TRIGGER appointments_time_update BEFORE UPDATE OF time ON appointments
WHEN NEW.time > '23:59'
BEGIN SELECT RAISE(ABORT, 'Orario non valido: usa il formato HH:MM tra 00:00 e 23:59'); END;

CREATE TRIGGER appointments_touch AFTER UPDATE ON appointments WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE appointments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

CREATE TRIGGER patients_touch AFTER UPDATE ON patients WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE patients SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

CREATE TRIGGER payments_touch AFTER UPDATE ON payments WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE payments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

CREATE TRIGGER plans_drop_orphan_document AFTER DELETE ON plans
WHEN OLD.document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM plans WHERE document_id = OLD.document_id)
BEGIN
  DELETE FROM documents WHERE id = OLD.document_id;
END;

CREATE TRIGGER plans_touch AFTER UPDATE ON plans WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE plans SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

CREATE TRIGGER settings_touch AFTER UPDATE ON settings WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE key = NEW.key; END;

CREATE TRIGGER visits_touch AFTER UPDATE ON visits WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE visits SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
