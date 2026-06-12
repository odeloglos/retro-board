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
    expect(tables).toContain('reactions');
    expect(tables).toContain('participants');
  });

  it('does not have a votes table', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);

    expect(tables).not.toContain('votes');
  });

  it('enforces unique admin username', () => {
    db.prepare("INSERT INTO admins (username, password_hash) VALUES ('admin', 'hash1')").run();
    expect(() => {
      db.prepare("INSERT INTO admins (username, password_hash) VALUES ('admin', 'hash2')").run();
    }).toThrow();
  });

  it('enforces unique reaction per session per card', () => {
    db.prepare("INSERT INTO admins (username, password_hash) VALUES ('admin', 'hash')").run();
    db.prepare("INSERT INTO boards (id, title, pin, admin_id) VALUES ('b1', 'Test', '123456', 1)").run();
    db.prepare('INSERT INTO cards (id, board_id, "column", text, author, session_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run('c1', 'b1', 'went_well', 'Nice', 'Alice', 's1');
    db.prepare("INSERT INTO reactions (card_id, session_id, type) VALUES ('c1', 's1', 'thumbs_up')").run();
    expect(() => {
      db.prepare("INSERT INTO reactions (card_id, session_id, type) VALUES ('c1', 's1', 'heart')").run();
    }).toThrow();
  });

  it('allows cards with nullable text (gif or avatar only)', () => {
    db.prepare("INSERT INTO admins (username, password_hash) VALUES ('admin', 'hash')").run();
    db.prepare("INSERT INTO boards (id, title, pin, admin_id) VALUES ('b1', 'Test', '123456', 1)").run();
    expect(() => {
      db.prepare('INSERT INTO cards (id, board_id, "column", text, author, session_id, gif_url) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run('c1', 'b1', 'went_well', null, 'Alice', 's1', 'https://example.com/gif.gif');
    }).not.toThrow();
  });

  it('cards table has gif_url and avatar columns', () => {
    db.prepare("INSERT INTO admins (username, password_hash) VALUES ('admin', 'hash')").run();
    db.prepare("INSERT INTO boards (id, title, pin, admin_id) VALUES ('b1', 'Test', '123456', 1)").run();
    db.prepare('INSERT INTO cards (id, board_id, "column", text, author, session_id, gif_url, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('c1', 'b1', 'went_well', 'Nice', 'Alice', 's1', 'https://example.com/gif.gif', 'chris_happy');
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get('c1');
    expect(card.gif_url).toBe('https://example.com/gif.gif');
    expect(card.avatar).toBe('chris_happy');
  });
});
