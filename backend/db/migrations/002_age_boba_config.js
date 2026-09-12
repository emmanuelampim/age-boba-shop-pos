const HOURS_DEFAULT = JSON.stringify({
  sun: { open: '15:00', close: '21:00', closed: false },
  mon: { open: '15:00', close: '21:00', closed: false },
  tue: { open: '15:00', close: '21:00', closed: false },
  wed: { open: '15:00', close: '21:00', closed: false },
  thu: { open: '15:00', close: '21:00', closed: false },
  fri: { open: '15:00', close: '21:00', closed: false },
  sat: { open: '15:00', close: '21:00', closed: false },
});

module.exports = function up(db) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO NOTHING`,
  ).run('shop_email', '');
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO NOTHING`,
  ).run('hours', HOURS_DEFAULT);

  // Configure business defaults only when they still hold the original seed
  // values, so an owner's manual edits are never overwritten.
  const replaceDefault = (key, from, to) =>
    db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ? AND value = ?").run(to, key, from);

  replaceDefault('shop_name', 'Boba Shop', 'AGE BOBA SHOP');
  replaceDefault('shop_address', '1 Independence Ave, Accra', 'Agbogba Police Station, Agbogba, Accra');
  replaceDefault('shop_phone', '+233 00 000 0000', '024 764 4123');
  replaceDefault('receipt_footer', 'Thank you for visiting!', 'Thank you for visiting AGE BOBA SHOP!');
  replaceDefault('currency_code', '', 'GHS');
  replaceDefault('currency_symbol', '', 'GH₵');

  const branch = db.prepare(
    "UPDATE branches SET name = ?, address = ?, phone = ?, updated_at = datetime('now') WHERE phone = ?",
  ).run('AGE BOBA SHOP', 'Agbogba Police Station, Agbogba, Accra', '024 764 4123', '+233 00 000 0000');

  // The shop currently accepts Cash and Mobile Money; keep the others
  // configurable but turned off by default.
  db.prepare("UPDATE payment_methods SET is_active = 0 WHERE code IN ('CARD', 'OTHER')").run();

  return { branch };
};
