const Database = require('better-sqlite3');
const { initSchema } = require('../src/db');

function createTestDb() {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

module.exports = { createTestDb };
