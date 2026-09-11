import fs from 'node:fs';
import path from 'node:path';
import { getDb, closeDb, initDatabase } from './connection.js';
import { config } from '../config.js';

export async function runMigrations(db = getDb()) {
  const migrationsDir = config.migrationsDir;
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name),
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d+_.*\.js$/.test(f))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const migration = await import(path.join(migrationsDir, file));
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.default(db);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
    ran += 1;
    console.log(`applied ${file}`);
  }
  if (ran === 0) console.log('no pending migrations');
  return ran;
}

async function main() {
  await initDatabase({ filePath: config.dbPath });
  const db = getDb();
  await runMigrations(db);
  closeDb();
}

if (import.meta.url === `file://${process.argv[1]}`) main();