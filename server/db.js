/* ==================== SQLite 数据库 ==================== */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'finance.db');

// 确保 data 目录存在
require('fs').mkdirSync(path.join(__dirname, 'data'), { recursive: true });

const db = new Database(DB_PATH);

// 开启 WAL 模式提升性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============ 初始化表结构 ============
function initSchema() {
  db.exec(`
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
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      currency TEXT DEFAULT '¥',
      balance REAL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      icon TEXT DEFAULT '📦',
      color TEXT DEFAULT '#8c8c8c',
      type TEXT NOT NULL,
      keywords TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      month TEXT NOT NULL,
      category TEXT DEFAULT 'total',
      amount REAL NOT NULL,
      created_at TEXT NOT NULL
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
}

initSchema();
console.log('[DB] SQLite 数据库已初始化:', DB_PATH);

module.exports = db;
