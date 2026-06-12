const Database = require('better-sqlite3');
const path = require('path');

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      pin TEXT NOT NULL,
      is_locked INTEGER DEFAULT 0,
      admin_id INTEGER REFERENCES admins(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id),
      "column" TEXT NOT NULL CHECK("column" IN ('went_well', 'to_improve', 'stop_doing', 'action_items')),
      text TEXT,
      author TEXT NOT NULL,
      session_id TEXT NOT NULL,
      assignee TEXT,
      gif_url TEXT,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      UNIQUE(card_id, session_id)
    );

    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id TEXT NOT NULL REFERENCES boards(id),
      session_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function getDb(dbPath) {
  const fullPath = dbPath || path.join(__dirname, '..', 'retro.db');
  const db = new Database(fullPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

module.exports = { initSchema, getDb };
