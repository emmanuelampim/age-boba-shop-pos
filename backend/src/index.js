import { config } from './config.js';
import { createApp } from './app.js';
import { getDb, initDatabase } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { seed } from './seed.js';
import { verifyPassword } from './lib/crypto.js';
import { scheduleDailyBackup } from './lib/dailyBackup.js';
import { logger } from './lib/logger.js';

async function main() {
  await initDatabase({ filePath: config.dbPath });

  const db = getDb();
  await runMigrations(db);

  const needsSeed =
    db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0;
  if (needsSeed) {
    await seed(db);
    logger.info('seeded_default_data');
  }

  if (config.isProduction) {
    const owner = db.prepare("SELECT * FROM users WHERE role = 'OWNER' LIMIT 1").get();
    if (owner && verifyPassword('Owner@123', owner.password_hash)) {
      logger.warn('default_owner_password_still_active', { email: owner.email });
    }
  }

  if (!config.testing) {
    scheduleDailyBackup();
  }

  const app = await createApp({ runMigrationsOnStart: false });

  app.listen(config.port, () => {
    logger.info('server_started', {
      port: config.port,
      db: config.dbPath,
      node: process.version,
    });
  });
}

main().catch((err) => {
  logger.error('fatal', { message: err.message, stack: err.stack });
  process.exit(1);
});