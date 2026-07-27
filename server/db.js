/* ==================== SQLite 数据库（双后端：better-sqlite3 / sql.js） ==================== */
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'finance.db');

// 确保 data 目录存在
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

let _db = null;
let _backend = null; // 'better-sqlite3' | 'sql.js'

// ============ 尝试加载 better-sqlite3（生产级，直接磁盘 I/O） ============
function tryLoadBetterSqlite3() {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    _db = db;
    _backend = 'better-sqlite3';
    console.log('[DB] 使用 better-sqlite3（生产模式）');
    return true;
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND' || e.code === 'ERR_DLOPEN_FAILED') {
      console.log('[DB] better-sqlite3 不可用（%s），降级使用 sql.js', e.code);
      return false;
    }
    // 其他错误（如数据库损坏）仍然抛出
    throw e;
  }
}

// ============ sql.js 降级方案（纯 JS，无需编译，内存数据库 + 手动落盘） ============
async function initSqlJsBackend() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  let buffer = null;
  try {
    if (fs.existsSync(DB_PATH)) {
      buffer = fs.readFileSync(DB_PATH);
    }
  } catch (e) {
    console.log('[DB] 无法读取已有数据库，将创建新库');
  }

  const sqlDb = new SQL.Database(buffer);

  function save() {
    try {
      fs.writeFileSync(DB_PATH, sqlDb.export());
    } catch (e) {
      console.error('[DB] 保存数据库失败:', e.message);
    }
  }

  _db = {
    pragma(str) {
      sqlDb.run('PRAGMA ' + str);
      return _db;
    },

    exec(sql) {
      sqlDb.run(sql);
      save();
      return _db;
    },

    prepare(sql) {
      return {
        run(...params) {
          const flat = flattenParams(params);
          if (flat.length > 0) {
            const stmt = sqlDb.prepare(sql);
            stmt.bind(flat);
            stmt.step();
            stmt.free();
          } else {
            sqlDb.run(sql);
          }
          const changes = sqlDb.getRowsModified();
          const rowidResult = sqlDb.exec('SELECT last_insert_rowid() as id');
          const lastInsertRowid = rowidResult[0]?.values[0]?.[0] ?? 0;
          save();
          return { changes, lastInsertRowid };
        },

        get(...params) {
          const flat = flattenParams(params);
          const stmt = sqlDb.prepare(sql);
          if (flat.length > 0) stmt.bind(flat);
          let row = undefined;
          if (stmt.step()) {
            row = stmt.getAsObject();
          }
          stmt.free();
          return row;
        },

        all(...params) {
          const flat = flattenParams(params);
          const stmt = sqlDb.prepare(sql);
          if (flat.length > 0) stmt.bind(flat);
          const rows = [];
          while (stmt.step()) {
            rows.push(stmt.getAsObject());
          }
          stmt.free();
          return rows;
        }
      };
    },

    transaction(fn) {
      return (...args) => {
        sqlDb.exec('BEGIN');
        try {
          const result = fn(...args);
          sqlDb.exec('COMMIT');
          save();
          return result;
        } catch (e) {
          try { sqlDb.exec('ROLLBACK'); } catch (_) {}
          throw e;
        }
      };
    }
  };

  _backend = 'sql.js';
  console.log('[DB] 使用 sql.js（本地兼容模式）');
}

function flattenParams(params) {
  if (params.length === 0) return [];
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params;
}

// ============ 统一初始化入口 ============

async function initDB() {
  if (_db) return _db;

  if (tryLoadBetterSqlite3()) {
    initSchema();
    console.log('[DB] 数据库已就绪:', DB_PATH, '(backend: better-sqlite3)');
    return _db;
  }

  await initSqlJsBackend();
  initSchema();
  console.log('[DB] 数据库已就绪:', DB_PATH, '(backend: sql.js)');
  return _db;
}

function getDB() {
  if (!_db) throw new Error('数据库尚未初始化，请先调用 initDB()');
  return _db;
}

function getBackend() {
  return _backend;
}

// ============ 表结构 ============

function initSchema() {
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT DEFAULT '',
      trial_start TEXT NOT NULL,
      trial_days INTEGER DEFAULT 30,
      paid INTEGER DEFAULT 0,
      paid_until TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verify_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      account TEXT,
      to_account TEXT,
      date TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      currency TEXT DEFAULT '¥',
      balance REAL DEFAULT 0,
      created_at TEXT NOT NULL,
      PRIMARY KEY (id, user_id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      icon TEXT DEFAULT '📦',
      color TEXT DEFAULT '#8c8c8c',
      type TEXT NOT NULL,
      keywords TEXT DEFAULT '[]',
      PRIMARY KEY (id, user_id)
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      month TEXT NOT NULL,
      category TEXT DEFAULT 'total',
      amount REAL NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (id, user_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      value TEXT,
      PRIMARY KEY (key, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_acct_user ON accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_cat_user ON categories(user_id);
    CREATE INDEX IF NOT EXISTS idx_budget_user ON budgets(user_id);
    CREATE INDEX IF NOT EXISTS idx_budget_month ON budgets(month);
  `);

  // 迁移旧表：如果 accounts/categories/budgets 只有 id 作为主键，重建为联合主键
  migrateCompositePK('accounts');
  migrateCompositePK('categories');
  migrateCompositePK('budgets');
}

function migrateCompositePK(table) {
  try {
    const info = _db.prepare(`PRAGMA table_info(${table})`).all();
    // 检查是否已有复合主键（通过检查 sqlite_master 中的 CREATE TABLE 语句）
    const createSQL = _db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table);
    if (!createSQL || !createSQL.sql) return;

    // 如果已经包含 PRIMARY KEY (id, user_id)，无需迁移
    if (createSQL.sql.includes('PRIMARY KEY (id, user_id)')) return;

    console.log(`[DB] 迁移 ${table} 表结构：添加联合主键 (id, user_id)...`);

    // 备份数据
    const data = _db.prepare(`SELECT * FROM ${table}`).all();

    // 重建表
    _db.exec(`DROP TABLE IF EXISTS ${table}_old`);
    _db.exec(`ALTER TABLE ${table} RENAME TO ${table}_old`);

    // 用正确的 schema 重新创建
    if (table === 'categories') {
      _db.exec(`
        CREATE TABLE categories (
          id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          name TEXT NOT NULL,
          icon TEXT DEFAULT '📦',
          color TEXT DEFAULT '#8c8c8c',
          type TEXT NOT NULL,
          keywords TEXT DEFAULT '[]',
          PRIMARY KEY (id, user_id)
        )
      `);
    } else if (table === 'accounts') {
      _db.exec(`
        CREATE TABLE accounts (
          id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          currency TEXT DEFAULT '¥',
          balance REAL DEFAULT 0,
          created_at TEXT NOT NULL,
          PRIMARY KEY (id, user_id)
        )
      `);
    } else if (table === 'budgets') {
      _db.exec(`
        CREATE TABLE budgets (
          id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          month TEXT NOT NULL,
          category TEXT DEFAULT 'total',
          amount REAL NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (id, user_id)
        )
      `);
    }

    // 恢复数据（去重：同一 (id, user_id) 组合只保留第一条）
    const seen = new Set();
    for (const row of data) {
      const key = `${row.id}|${row.user_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const columns = Object.keys(row).join(', ');
      const placeholders = Object.keys(row).map(() => '?').join(', ');
      const values = Object.values(row);
      _db.prepare(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`).run(values);
    }

    _db.exec(`DROP TABLE IF EXISTS ${table}_old`);
    console.log(`[DB] ${table} 迁移完成 (${seen.size} 条数据)`);
  } catch (e) {
    console.error(`[DB] ${table} 迁移失败:`, e.message);
  }
}

module.exports = { initDB, getDB, getBackend };
