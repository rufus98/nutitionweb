-- Piano salvato, in attesa di condivisione.
--
-- Una bozza può essere "salvata" (saved_at valorizzato) quando la nutrizionista ha finito di prepararla:
-- resta invisibile al paziente finché non viene condivisa (pubblicata). Riaprirla per modificarla azzera saved_at.

ALTER TABLE plans ADD COLUMN saved_at TEXT CHECK (saved_at IS NULL OR date(saved_at) IS saved_at);

-- Le versioni già pubblicate o archiviate sono state salvate quando sono state pubblicate.
UPDATE plans SET saved_at = coalesce(published_at, created_at) WHERE status <> 'draft';

-- Stato del piano nel riepilogo paziente: 'ready' = salvato e da condividere.
DROP VIEW patient_summary;
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
