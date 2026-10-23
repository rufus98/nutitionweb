-- Le prime build native salvavano i booleani come testo 'true'/'false': li riporta a 1/0.
UPDATE patients SET consent_privacy = CASE consent_privacy WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE consent_privacy END;
UPDATE patients SET consent_app = CASE consent_app WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE consent_app END;
UPDATE patients SET consent_marketing = CASE consent_marketing WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE consent_marketing END;
UPDATE patients SET active = CASE active WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE active END;
UPDATE patients SET link_on = CASE link_on WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE link_on END;
UPDATE payments SET paid = CASE paid WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE paid END;
UPDATE appointments SET remind = CASE remind WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE remind END;
