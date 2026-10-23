-- Schema v3: vincoli di integrità, indici, importi in centesimi, numerazione fatture strutturata,
-- PDF in una tabella dedicata, date di creazione/modifica, viste per le letture ricorrenti.
--
-- Procedura SQLite per ricostruire tabelle (https://www.sqlite.org/lang_altertable.html#otheralter):
-- il runner esegue questo script con foreign_keys = OFF dentro una transazione e verifica le chiavi
-- esterne alla fine (tabella temporanea _fk_check).
--
-- Convenzioni:
--   date       TEXT 'YYYY-MM-DD'               (CHECK date(x) IS x)
--   orari      TEXT 'HH:MM'
--   istanti    TEXT ISO 8601 UTC 'YYYY-MM-DDTHH:MM:SS.SSSZ' (created_at / updated_at gestiti dal DB)
--   booleani   INTEGER 0/1                     (CHECK IN (0, 1))
--   importi    INTEGER in centesimi di euro
--   JSON       TEXT                            (CHECK json_valid)

ALTER TABLE patients RENAME TO old_patients;
ALTER TABLE visits RENAME TO old_visits;
ALTER TABLE payments RENAME TO old_payments;
ALTER TABLE appointments RENAME TO old_appointments;
ALTER TABLE plans RENAME TO old_plans;
ALTER TABLE settings RENAME TO old_settings;
DROP INDEX IF EXISTS visits_patient;
DROP INDEX IF EXISTS appts_date;

-- ------------------------------------------------------------------ pazienti
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
CREATE INDEX patients_name ON patients (last COLLATE NOCASE, first COLLATE NOCASE);

INSERT INTO patients (id, code, first, last, phone, email, dob, birthplace, cf, job, sex, contact, tags, drugs, activity, notes,
                      height, goal, target_kg, source, consent_privacy, consent_app, consent_marketing, active, token, link_on, created_at)
SELECT id, code, trim(first), trim(last), trim(phone), nullif(trim(email), ''),
       CASE WHEN date(dob) IS dob THEN dob END, birthplace, cf, job,
       CASE WHEN sex IN ('F', 'M') THEN sex ELSE 'F' END,
       CASE WHEN contact IN ('WhatsApp', 'Telefono', 'Email') THEN contact ELSE 'WhatsApp' END,
       CASE WHEN json_valid(tags) AND json_type(tags) = 'array' THEN tags ELSE '[]' END,
       drugs, activity, notes,
       CASE WHEN height BETWEEN 50 AND 250 THEN height END, goal,
       CASE WHEN target_kg BETWEEN 20 AND 400 THEN target_kg END, source,
       coalesce(consent_privacy IN (1, '1', 'true'), 0), coalesce(consent_app IN (1, '1', 'true'), 0),
       coalesce(consent_marketing IN (1, '1', 'true'), 0), coalesce(active IN (1, '1', 'true'), 1),
       token, coalesce(link_on IN (1, '1', 'true'), 1),
       CASE WHEN date(created_at) IS created_at THEN created_at ELSE date(created_at) END
FROM old_patients;

-- ------------------------------------------------------------------ visite e misure
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
CREATE INDEX visits_patient_date ON visits (patient_id, date);

INSERT INTO visits (id, patient_id, date, type, kg, fat, vita, fianchi, torace, braccio, coscia, polso, note, goal)
SELECT id, patient_id, date, coalesce(type, 'Controllo'),
       CASE WHEN kg BETWEEN 2 AND 400 THEN kg END, CASE WHEN fat BETWEEN 1 AND 80 THEN fat END,
       nullif(max(vita, 0), 0), nullif(max(fianchi, 0), 0), nullif(max(torace, 0), 0),
       nullif(max(braccio, 0), 0), nullif(max(coscia, 0), 0), nullif(max(polso, 0), 0), note, goal
FROM old_visits
WHERE date(date) IS date AND patient_id IN (SELECT id FROM patients);

-- ------------------------------------------------------------------ pagamenti e fatture
-- I pagamenti sono documenti fiscali: se il paziente viene eliminato restano nel registro
-- (patient_id diventa NULL) con nome e codice fiscale fotografati al momento della registrazione.
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
CREATE INDEX payments_patient_date ON payments (patient_id, date);
CREATE INDEX payments_date ON payments (date);
CREATE INDEX payments_pending ON payments (patient_id) WHERE paid = 0;

INSERT INTO payments (id, patient_id, patient_name, patient_cf, date, description, method, amount_cents, paid, paid_at, invoice_year, invoice_number)
SELECT y.id, y.patient_id, p.first || ' ' || p.last, p.cf, y.date, coalesce(y.description, 'Prestazione'), coalesce(y.method, 'Altro'),
       CAST(round(y.amount * 100) AS INTEGER),
       coalesce(y.paid IN (1, '1', 'true'), 0),
       CASE WHEN y.paid IN (1, '1', 'true') THEN y.date END,
       CASE WHEN y.paid IN (1, '1', 'true') AND y.invoice GLOB 'FT *[0-9]/[0-9][0-9]'
            THEN 2000 + CAST(substr(y.invoice, instr(y.invoice, '/') + 1) AS INTEGER) END,
       CASE WHEN y.paid IN (1, '1', 'true') AND y.invoice GLOB 'FT *[0-9]/[0-9][0-9]'
            THEN CAST(trim(substr(y.invoice, 4, instr(y.invoice, '/') - 4)) AS INTEGER) END
FROM old_payments y JOIN patients p ON p.id = y.patient_id
WHERE y.amount > 0 AND date(y.date) IS y.date;

-- ------------------------------------------------------------------ agenda
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
CREATE INDEX appointments_date_time ON appointments (date, time);
CREATE INDEX appointments_patient_date ON appointments (patient_id, date);

INSERT INTO appointments (id, patient_id, date, time, type, duration, remind, reminder_sent_at, note)
SELECT a.id, a.patient_id, a.date, a.time,
       CASE WHEN a.type IN ('prima', 'controllo', 'online') THEN a.type ELSE 'controllo' END,
       CASE WHEN a.duration BETWEEN 5 AND 600 THEN a.duration ELSE 30 END,
       coalesce(a.remind IN (1, '1', 'true'), 1),
       (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM old_settings s WHERE s.key = 'rem-' || a.id AND s.value = '1'),
       a.note
FROM old_appointments a
WHERE date(a.date) IS a.date AND a.time GLOB '[0-2][0-9]:[0-5][0-9]' AND a.patient_id IN (SELECT id FROM patients);

-- ------------------------------------------------------------------ documenti (PDF dei piani)
-- Base64 in TEXT: funziona allo stesso modo con il driver nativo e con sql.js (anteprima nel browser).
-- Un documento può essere condiviso da più versioni dello stesso piano.
CREATE TABLE documents (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  mime        TEXT    NOT NULL DEFAULT 'application/pdf',
  size        INTEGER NOT NULL CHECK (size >= 0),
  data_b64    TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO documents (id, name, size, data_b64)
SELECT id, coalesce(pdf_name, 'piano.pdf'), length(pdf_b64) * 3 / 4, pdf_b64
FROM old_plans WHERE pdf_b64 IS NOT NULL AND pdf_b64 <> '';

-- ------------------------------------------------------------------ piani nutrizionali
-- `data` è il documento JSON del piano (PlanData in src/db/types.ts): si legge e si salva sempre intero.
CREATE TABLE plans (
  id            INTEGER PRIMARY KEY,
  patient_id    INTEGER NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
  version       INTEGER NOT NULL CHECK (version > 0),
  status        TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  document_id   INTEGER REFERENCES documents (id) ON DELETE SET NULL,
  data          TEXT    NOT NULL CHECK (json_valid(data)),
  created_at    TEXT    NOT NULL CHECK (date(created_at) IS created_at),
  published_at  TEXT    CHECK (published_at IS NULL OR date(published_at) IS published_at),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (patient_id, version),
  CHECK (status = 'draft' OR published_at IS NOT NULL)
);
-- Al massimo una bozza e una versione pubblicata per paziente.
CREATE UNIQUE INDEX plans_one_draft ON plans (patient_id) WHERE status = 'draft';
CREATE UNIQUE INDEX plans_one_published ON plans (patient_id) WHERE status = 'published';

INSERT INTO plans (id, patient_id, version, status, document_id, data, created_at, published_at)
SELECT p.id, p.patient_id, p.version,
       CASE
         WHEN p.status NOT IN ('draft', 'published', 'archived') THEN 'archived'
         WHEN p.status = 'published' AND p.version < (SELECT max(version) FROM old_plans x WHERE x.patient_id = p.patient_id AND x.status = 'published') THEN 'archived'
         WHEN p.status = 'draft' AND p.version < (SELECT max(version) FROM old_plans x WHERE x.patient_id = p.patient_id AND x.status = 'draft') THEN 'archived'
         ELSE p.status
       END,
       CASE WHEN p.pdf_b64 IS NOT NULL AND p.pdf_b64 <> '' THEN p.id END,
       CASE WHEN json_valid(p.data) THEN p.data ELSE '{"title":"","kcal":null,"protein":null,"carbs":null,"fat":null,"general":"","days":[]}' END,
       p.created_at,
       CASE WHEN p.status = 'draft' THEN NULL ELSE coalesce(p.published_at, p.created_at) END
FROM old_plans p
WHERE p.patient_id IN (SELECT id FROM patients) AND p.version > 0 AND date(p.created_at) IS p.created_at;

-- Un PDF non più usato da nessuna versione viene eliminato.
CREATE TRIGGER plans_drop_orphan_document AFTER DELETE ON plans
WHEN OLD.document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM plans WHERE document_id = OLD.document_id)
BEGIN
  DELETE FROM documents WHERE id = OLD.document_id;
END;

-- ------------------------------------------------------------------ impostazioni e stato dell'app
-- Chiavi usate: 'main' (impostazioni dello studio, JSON), 'onboarded', 'demo'.
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO settings (key, value) SELECT key, value FROM old_settings WHERE key NOT LIKE 'rem-%';

-- ------------------------------------------------------------------ data di ultima modifica automatica
CREATE TRIGGER patients_touch AFTER UPDATE ON patients WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE patients SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER visits_touch AFTER UPDATE ON visits WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE visits SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER payments_touch AFTER UPDATE ON payments WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE payments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER appointments_touch AFTER UPDATE ON appointments WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE appointments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER plans_touch AFTER UPDATE ON plans WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE plans SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER settings_touch AFTER UPDATE ON settings WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE key = NEW.key; END;

-- ------------------------------------------------------------------ viste
-- Pagamenti con numero fattura formattato ("FT 12/26") e dati del paziente (se ancora presente).
CREATE VIEW payments_view AS
SELECT y.id, y.patient_id, y.date, y.description, y.method,
       y.amount_cents / 100.0 AS amount, y.paid, y.paid_at, y.invoice_year, y.invoice_number,
       CASE WHEN y.invoice_number IS NOT NULL THEN 'FT ' || y.invoice_number || '/' || substr(y.invoice_year, 3, 2) END AS invoice,
       coalesce(p.first || ' ' || p.last, y.patient_name) AS name,
       coalesce(p.cf, y.patient_cf) AS cf,
       p.phone AS phone
FROM payments y LEFT JOIN patients p ON p.id = y.patient_id;

-- Riepilogo per l'elenco pazienti: ultima/prossima visita, peso iniziale/attuale, stato del piano, importi in sospeso.
CREATE VIEW patient_summary AS
SELECT p.*,
  (SELECT max(v.date) FROM visits v WHERE v.patient_id = p.id) AS last_visit,
  (SELECT min(a.date) FROM appointments a WHERE a.patient_id = p.id AND a.date >= date('now', 'localtime')) AS next_visit,
  (SELECT v.kg FROM visits v WHERE v.patient_id = p.id AND v.kg IS NOT NULL ORDER BY v.date DESC, v.id DESC LIMIT 1) AS kg,
  (SELECT v.kg FROM visits v WHERE v.patient_id = p.id AND v.kg IS NOT NULL ORDER BY v.date ASC, v.id ASC LIMIT 1) AS kg_start,
  (SELECT pl.status FROM plans pl WHERE pl.patient_id = p.id AND pl.status <> 'archived' ORDER BY pl.version DESC LIMIT 1) AS plan_status,
  (SELECT coalesce(sum(y.amount_cents), 0) / 100.0 FROM payments y WHERE y.patient_id = p.id AND y.paid = 0) AS due
FROM patients p;

DROP TABLE old_plans;
DROP TABLE old_appointments;
DROP TABLE old_payments;
DROP TABLE old_visits;
DROP TABLE old_patients;
DROP TABLE old_settings;
