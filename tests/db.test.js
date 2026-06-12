const { createTestDb } = require('./helpers');

describe('database schema', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  it('creates all tables', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);

    expect(tables).toContain('admins');
    expect(tables).toContain('boards');
    expect(tables).toContain('cards');
    expect(tables).toContain('votes');
    expect(tables).toContain('participants');
  });

  it('enforces unique admin username', () => {
    db.prepare("INSERT INTO admins (username, password_hash) VALUES ('admin', 'hash1')").run();
    expect(() => {
      db.prepare("INSERT INTO admins (username, password_hash) VALUES ('admin', 'hash2')").run();
    }).toThrow();
  });

  it('enforces unique vote per session per card', () => {
    db.prepare("INSERT INTO admins (username, password_hash) VALUES ('admin', 'hash')").run();
    db.prepare("INSERT INTO boards (id, title, pin, admin_id) VALUES ('b1', 'Test', '123456', 1)").run();
    db.prepare('INSERT INTO cards (id, board_id, "column", text, author, session_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run('c1', 'b1', 'went_well', 'Nice', 'Alice', 's1');
    db.prepare("INSERT INTO votes (card_id, session_id) VALUES ('c1', 's1')").run();
    expect(() => {
      db.prepare("INSERT INTO votes (card_id, session_id) VALUES ('c1', 's1')").run();
    }).toThrow();
  });
});
