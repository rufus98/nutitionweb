-- Schema del server Nutrea per sqlserver (generato da npm run schema-sql: non modificare a mano).
-- Normalmente non serve: il server crea le tabelle da solo all'avvio (MIGRATE_ON_START).

CREATE TABLE [patient_access] ([id] int identity(1,1) not null primary key, [token] nvarchar(64) not null, [email] nvarchar(254) not null, [first_name] nvarchar(100) not null, [status] nvarchar(16) not null CONSTRAINT [patient_access_status_default] DEFAULT 'pending', [password_hash] nvarchar(255) null, [password_set_at] datetime2 null, [activation_hash] nvarchar(64) null, [activation_expires_at] datetime2 null, [view_json] nvarchar(max) not null, [view_version] int not null, [pdf_name] nvarchar(255) null, [pdf_b64] nvarchar(max) null, [log_access] bit not null CONSTRAINT [patient_access_log_access_default] DEFAULT '0', [consent_at] datetime2 null, [failed_logins] int not null CONSTRAINT [patient_access_failed_logins_default] DEFAULT '0', [locked_until] datetime2 null, [last_login_at] datetime2 null, [created_at] datetime2 not null, [updated_at] datetime2 not null);
CREATE UNIQUE INDEX [patient_access_token_unique] ON [patient_access] ([token]) WHERE [token] IS NOT NULL;

CREATE TABLE [patient_session] ([id] nvarchar(64), [access_id] int not null, [created_at] datetime2 not null, [expires_at] datetime2 not null, CONSTRAINT [patient_session_pkey] PRIMARY KEY ([id]), CONSTRAINT [patient_session_access_id_foreign] FOREIGN KEY ([access_id]) REFERENCES [patient_access] ([id]) ON DELETE CASCADE);
CREATE INDEX [patient_session_access_id_index] ON [patient_session] ([access_id]);

CREATE TABLE [patient_access_log] ([id] int identity(1,1) not null primary key, [access_id] int not null, [event] nvarchar(20) not null, [at] datetime2 not null, CONSTRAINT [patient_access_log_access_id_foreign] FOREIGN KEY ([access_id]) REFERENCES [patient_access] ([id]) ON DELETE CASCADE);
CREATE INDEX [patient_access_log_access_id_at_index] ON [patient_access_log] ([access_id], [at]);
