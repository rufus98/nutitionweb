-- Orario degli appuntamenti: il vincolo dello schema 3 (GLOB '[0-2][0-9]:[0-5][0-9]') accettava anche 24:00–29:59.
-- Cambiare un CHECK richiede di ricostruire la tabella: bastano due trigger che rifiutano gli orari oltre le 23:59.

CREATE TRIGGER appointments_time_insert BEFORE INSERT ON appointments
WHEN NEW.time > '23:59'
BEGIN SELECT RAISE(ABORT, 'Orario non valido: usa il formato HH:MM tra 00:00 e 23:59'); END;

CREATE TRIGGER appointments_time_update BEFORE UPDATE OF time ON appointments
WHEN NEW.time > '23:59'
BEGIN SELECT RAISE(ABORT, 'Orario non valido: usa il formato HH:MM tra 00:00 e 23:59'); END;
