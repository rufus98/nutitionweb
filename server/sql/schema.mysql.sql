-- Schema del server Nutrea per mysql (generato da npm run schema-sql: non modificare a mano).
-- Normalmente non serve: il server crea le tabelle da solo all'avvio (MIGRATE_ON_START).

create table `patient_access` (`id` int unsigned not null auto_increment primary key, `token` varchar(64) not null, `email` varchar(254) not null, `first_name` varchar(100) not null, `status` varchar(16) not null default 'pending', `password_hash` varchar(255) null, `password_set_at` datetime null, `activation_hash` varchar(64) null, `activation_expires_at` datetime null, `view_json` longtext not null, `view_version` int not null, `pdf_name` varchar(255) null, `pdf_b64` longtext null, `log_access` boolean not null default '0', `consent_at` datetime null, `failed_logins` int not null default '0', `locked_until` datetime null, `last_login_at` datetime null, `created_at` datetime not null, `updated_at` datetime not null);
alter table `patient_access` add unique `patient_access_token_unique`(`token`);

create table `patient_session` (`id` varchar(64), `access_id` int unsigned not null, `created_at` datetime not null, `expires_at` datetime not null, primary key (`id`));
alter table `patient_session` add constraint `patient_session_access_id_foreign` foreign key (`access_id`) references `patient_access` (`id`) on delete CASCADE;
alter table `patient_session` add index `patient_session_access_id_index`(`access_id`);

create table `patient_access_log` (`id` int unsigned not null auto_increment primary key, `access_id` int unsigned not null, `event` varchar(20) not null, `at` datetime not null);
alter table `patient_access_log` add constraint `patient_access_log_access_id_foreign` foreign key (`access_id`) references `patient_access` (`id`) on delete CASCADE;
alter table `patient_access_log` add index `patient_access_log_access_id_at_index`(`access_id`, `at`);
