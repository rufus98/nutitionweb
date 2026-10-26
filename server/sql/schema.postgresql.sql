-- Schema del server Nutrea per postgresql (generato da npm run schema-sql: non modificare a mano).
-- Normalmente non serve: il server crea le tabelle da solo all'avvio (MIGRATE_ON_START).

create table "patient_access" ("id" serial primary key, "token" varchar(64) not null, "email" varchar(254) not null, "first_name" varchar(100) not null, "status" varchar(16) not null default 'pending', "password_hash" varchar(255) null, "password_set_at" timestamptz null, "activation_hash" varchar(64) null, "activation_expires_at" timestamptz null, "view_json" text not null, "view_version" integer not null, "pdf_name" varchar(255) null, "pdf_b64" text null, "log_access" boolean not null default '0', "consent_at" timestamptz null, "failed_logins" integer not null default '0', "locked_until" timestamptz null, "last_login_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null);
alter table "patient_access" add constraint "patient_access_token_unique" unique ("token");

create table "patient_session" ("id" varchar(64), "access_id" integer not null, "created_at" timestamptz not null, "expires_at" timestamptz not null, constraint "patient_session_pkey" primary key ("id"));
alter table "patient_session" add constraint "patient_session_access_id_foreign" foreign key ("access_id") references "patient_access" ("id") on delete CASCADE;
create index "patient_session_access_id_index" on "patient_session" ("access_id");

create table "patient_access_log" ("id" serial primary key, "access_id" integer not null, "event" varchar(20) not null, "at" timestamptz not null);
alter table "patient_access_log" add constraint "patient_access_log_access_id_foreign" foreign key ("access_id") references "patient_access" ("id") on delete CASCADE;
create index "patient_access_log_access_id_at_index" on "patient_access_log" ("access_id", "at");
