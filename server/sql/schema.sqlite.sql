-- Schema del server Nutrea per sqlite (generato da npm run schema-sql: non modificare a mano).
-- Normalmente non serve: il server crea le tabelle da solo all'avvio (MIGRATE_ON_START).

create table `patient_access` (`id` integer not null primary key autoincrement, `token` varchar(64) not null, `email` varchar(254) not null, `first_name` varchar(100) not null, `status` varchar(16) not null default 'pending', `password_hash` varchar(255) null, `password_set_at` datetime null, `activation_hash` varchar(64) null, `activation_expires_at` datetime null, `view_json` text not null, `view_version` integer not null, `pdf_name` varchar(255) null, `pdf_b64` text null, `log_access` boolean not null default '0', `consent_at` datetime null, `failed_logins` integer not null default '0', `locked_until` datetime null, `last_login_at` datetime null, `created_at` datetime not null, `updated_at` datetime not null);
create unique index `patient_access_token_unique` on `patient_access` (`token`);

create table `patient_session` (`id` varchar(64), `access_id` integer not null, `created_at` datetime not null, `expires_at` datetime not null, foreign key(`access_id`) references `patient_access`(`id`) on delete CASCADE, primary key (`id`));
create index `patient_session_access_id_index` on `patient_session` (`access_id`);

create table `patient_access_log` (`id` integer not null primary key autoincrement, `access_id` integer not null, `event` varchar(20) not null, `at` datetime not null, foreign key(`access_id`) references `patient_access`(`id`) on delete CASCADE);
create index `patient_access_log_access_id_at_index` on `patient_access_log` (`access_id`, `at`);
