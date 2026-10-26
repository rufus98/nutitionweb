// Accessi dei pazienti all'app web. Tipi portabili (knex): funziona su PostgreSQL, MySQL/MariaDB, SQL Server, SQLite.
import type { Knex } from 'knex';

/** Le istruzioni dello schema: eseguite dalla migrazione, oppure stampate come SQL (npm run schema-sql). */
export function builders(knex: Knex): Knex.SchemaBuilder[] {
  return [
  // Un paziente con il suo link: email, password (solo hash), e l'oggetto con tutti i dati della dieta.
  knex.schema.createTable('patient_access', (t) => {
    t.increments('id').primary();
    t.string('token', 64).notNullable().unique();              // dal link /p/{token}
    t.string('email', 254).notNullable();                       // in chiaro: serve per contatti e recupero
    t.string('first_name', 100).notNullable();
    t.string('status', 16).notNullable().defaultTo('pending');  // pending (da attivare) | active | disabled
    t.string('password_hash', 255).nullable();                  // scrypt$N$r$p$sale$hash
    t.datetime('password_set_at').nullable();
    t.string('activation_hash', 64).nullable();                 // SHA-256 del codice di attivazione
    t.datetime('activation_expires_at').nullable();
    t.text('view_json', 'longtext').notNullable();              // PatientView: piano, visite, studio…
    t.integer('view_version').notNullable();
    t.string('pdf_name', 255).nullable();
    t.text('pdf_b64', 'longtext').nullable();                   // PDF originale del piano (base64)
    t.boolean('log_access').notNullable().defaultTo(false);
    t.datetime('consent_at').nullable();
    t.integer('failed_logins').notNullable().defaultTo(0);
    t.datetime('locked_until').nullable();
    t.datetime('last_login_at').nullable();
    t.datetime('created_at').notNullable();
    t.datetime('updated_at').notNullable();
  }),

  // Sessioni dopo il login: si salva solo lo SHA-256 del codice di sessione.
  knex.schema.createTable('patient_session', (t) => {
    t.string('id', 64).primary();
    t.integer('access_id').unsigned().notNullable().references('id').inTable('patient_access').onDelete('CASCADE');
    t.datetime('created_at').notNullable();
    t.datetime('expires_at').notNullable();
    t.index(['access_id']);
  }),

  // Registro accessi (se attivato dallo studio): solo evento e ora, niente IP.
  knex.schema.createTable('patient_access_log', (t) => {
    t.increments('id').primary();
    t.integer('access_id').unsigned().notNullable().references('id').inTable('patient_access').onDelete('CASCADE');
    t.string('event', 20).notNullable();                        // activate | login | view | consent | logout
    t.datetime('at').notNullable();
    t.index(['access_id', 'at']);
  }),
  ];
}

export async function up(knex: Knex) {
  for (const b of builders(knex)) await b;
}

export async function down(knex: Knex) {
  await knex.schema.dropTableIfExists('patient_access_log');
  await knex.schema.dropTableIfExists('patient_session');
  await knex.schema.dropTableIfExists('patient_access');
}
