import initSqlJs from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';

let _db = null;

const WRITE_SQL_RE = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|VACUUM|REINDEX|ANALYZE|ATTACH|DETACH)\b/i;

function normalizeParams(params) {
  if (params == null) return [];
  return params.map((v) => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof Uint8Array || typeof v === 'string') return v;
    const num = Number(v);
    return Number.isFinite(num) ? num : String(v);
  });
}

class PosDatabase {
  constructor(SQL, filePath = null) {
    this._filePath = filePath || null;
    this._txnDepth = 0;

    let data;
    if (this._filePath) {
      fs.mkdirSync(path.dirname(this._filePath), { recursive: true });
      if (fs.existsSync(this._filePath)) {
        const stat = fs.statSync(this._filePath);
        if (stat.size > 0) data = new Uint8Array(fs.readFileSync(this._filePath));
      }
    }
    this._sql = data ? new SQL.Database(data) : new SQL.Database();
    this._sql.exec('PRAGMA foreign_keys = ON;');
  }

  get raw() {
    return this._sql;
  }

  exec(sql) {
    const isBegin = /^\s*BEGIN\b/i.test(sql);
    const isEnd = /^\s*(COMMIT|END|ROLLBACK)\b/i.test(sql);
    const isWrite = WRITE_SQL_RE.test(sql);

    if (isBegin) {
      this._txnDepth += 1;
    } else if (isEnd && this._txnDepth > 0) {
      this._txnDepth -= 1;
    }

    const committed = isEnd && !/^\s*ROLLBACK\b/i.test(sql) && this._txnDepth === 0;
    const result = this._sql.exec(sql);

    if (committed) {
      this._persist();
    } else if (isWrite && this._txnDepth === 0) {
      this._persist();
    }
    return result;
  }

  prepare(sql) {
    const stmt = new PosStatement(this, this._sql.prepare(sql));
    return stmt;
  }

  close() {
    try {
      if (this._txnDepth !== 0) {
        this._sql.exec('ROLLBACK;');
        this._txnDepth = 0;
      }
      this._persist();
      this._sql.close();
    } catch {
      // best effort
    }
  }

  _persist() {
    if (!this._filePath) return;
    const buf = this._sql.export();
    const tmp = `${this._filePath}.tmp`;
    fs.writeFileSync(tmp, buf, { mode: 0o644 });
    fs.renameSync(tmp, this._filePath);
  }
}

class PosStatement {
  constructor(owner, stmt) {
    this._owner = owner;
    this._stmt = stmt;
  }

  _bind(params) {
    const values = normalizeParams(params);
    if (values.length > 0) this._stmt.bind(values);
  }

  _free() {
    try {
      this._stmt.free();
    } catch {
      // already freed
    }
  }

  get(...params) {
    try {
      this._stmt.reset();
      this._bind(params);
      if (this._stmt.step()) return this._stmt.getAsObject();
      return undefined;
    } finally {
      this._free();
    }
  }

  all(...params) {
    try {
      this._stmt.reset();
      this._bind(params);
      const rows = [];
      while (this._stmt.step()) rows.push(this._stmt.getAsObject());
      return rows;
    } finally {
      this._free();
    }
  }

  run(...params) {
    try {
      this._stmt.reset();
      this._bind(params);
      while (this._stmt.step()) {
        // run the statement to completion
      }
      const db = this._owner.raw;
      const lastInsertRowid = Number(
        db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0],
      );
      const changes = db.getRowsModified();
      if (this._owner._txnDepth === 0) this._owner._persist();
      return { lastInsertRowid, changes };
    } finally {
      this._free();
    }
  }
}

export function getDb() {
  if (!_db) throw new Error('Database not initialised. Call initDatabase() first.');
  return _db;
}

export async function initDatabase({ filePath = null, inMemory = false } = {}) {
  if (_db) return _db;
  const SQL = await initSqlJs();
  _db = new PosDatabase(SQL, inMemory ? null : filePath);
  return _db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export function transaction(fn, db = getDb()) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function formatRow(row) {
  if (!row || typeof row !== 'object') return row;
  if (Array.isArray(row)) return row.map(formatRow);
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    let val = v;
    if (typeof v === 'bigint') val = Number(v);
    else if (val instanceof Uint8Array || val instanceof Buffer) val = Buffer.from(val).toString('base64');
    out[k] = val;
  }
  return out;
}

export function formatRows(rows) {
  return rows.map(formatRow);
}