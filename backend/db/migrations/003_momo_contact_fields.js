export default function up(db) {
  const cols = db.prepare("PRAGMA table_info(orders)").all().map((c) => c.name);
  if (!cols.includes('customer_phone')) {
    db.exec('ALTER TABLE orders ADD COLUMN customer_phone TEXT');
  }
  if (!cols.includes('payment_ref')) {
    db.exec('ALTER TABLE orders ADD COLUMN payment_ref TEXT');
  }
  return {};
}