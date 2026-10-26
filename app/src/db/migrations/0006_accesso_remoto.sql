-- Accesso dei pazienti alla web app tramite il server remoto (vedi server/ e src/lib/remote.ts).
--
-- remote_access: una riga per ogni paziente per cui lo studio ha creato il link di accesso. Tiene lo stato
-- sincronizzato con il server e l'impronta dei dati già inviati, per inviarli solo quando cambiano.

CREATE TABLE remote_access (
  patient_id             INTEGER PRIMARY KEY REFERENCES patients (id) ON DELETE CASCADE,
  -- stato sul server: pending (in attesa che il paziente scelga la password) | active | disabled
  status                 TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
  view_hash              TEXT,                        -- SHA-256 dei dati inviati l'ultima volta
  pdf_document_id        INTEGER,                     -- PDF del piano già caricato (documents.id)
  activation_url         TEXT,                        -- ultimo link di attivazione, da reinviare finché vale
  activation_expires_at  TEXT,
  last_login_at          TEXT,
  synced_at              TEXT,
  error                  TEXT,                        -- ultimo errore di sincronizzazione (null se tutto ok)
  created_at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Pazienti eliminati nello studio: i loro dati vanno cancellati anche dal server (alla prossima sincronizzazione).
CREATE TABLE remote_deletions (
  token       TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TRIGGER patients_remote_deletion BEFORE DELETE ON patients
WHEN OLD.token IS NOT NULL AND EXISTS (SELECT 1 FROM remote_access WHERE patient_id = OLD.id)
BEGIN
  INSERT OR IGNORE INTO remote_deletions (token) VALUES (OLD.token);
END;
