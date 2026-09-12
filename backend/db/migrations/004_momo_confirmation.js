module.exports = function up(db) {
  const cols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
  if (!cols.includes('momo_confirmed')) {
    db.exec('ALTER TABLE orders ADD COLUMN momo_confirmed INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.includes('momo_status')) {
    db.exec('ALTER TABLE orders ADD COLUMN momo_status TEXT');
  }
  if (!cols.includes('business_date')) {
    db.exec('ALTER TABLE orders ADD COLUMN business_date TEXT');
  }
  if (cols.includes('created_at')) {
    db.exec(
      "UPDATE orders SET business_date = substr(created_at, 1, 10) WHERE business_date IS NULL AND created_at IS NOT NULL",
    );
  }
  return {};
};
