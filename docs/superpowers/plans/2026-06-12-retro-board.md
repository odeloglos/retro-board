# Retro Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time retrospective board web app with PIN-protected boards, live collaboration, admin management, and Markdown export.

**Architecture:** Single Node.js process — Express serves static frontend files and a REST API, Socket.IO handles real-time collaboration, SQLite stores all data in a single file. Admin authenticates via username/password with session cookies; participants join boards via a 6-digit PIN.

**Tech Stack:** Node.js, Express, Socket.IO, better-sqlite3, bcrypt, express-session, vanilla HTML/CSS/JS

---

## File Structure

```
retro-board/
├── package.json
├── server.js                  # Entry point — wires Express, Socket.IO, session, routes
├── src/
│   ├── db.js                  # SQLite connection + schema init
│   ├── routes/
│   │   ├── auth.js            # POST /api/auth/setup, POST /api/auth/login, POST /api/auth/logout, GET /api/auth/status
│   │   ├── boards.js          # CRUD for boards — POST /api/boards, GET /api/boards, GET /api/boards/:id, PATCH /api/boards/:id/lock
│   │   ├── cards.js           # CRUD for cards — POST /api/boards/:id/cards, PATCH /api/cards/:id, DELETE /api/cards/:id
│   │   ├── votes.js           # POST /api/cards/:id/vote
│   │   ├── join.js            # POST /api/join — validate PIN, register participant
│   │   └── export.js          # GET /api/boards/:id/export — returns Markdown string
│   ├── middleware.js           # requireAdmin, requireBoardAccess middleware
│   └── socket.js              # Socket.IO event handlers — rooms, presence, broadcast
├── public/
│   ├── index.html             # Join page (home)
│   ├── login.html             # Admin login / first-run setup
│   ├── dashboard.html         # Admin dashboard
│   ├── board.html             # Board view
│   ├── css/
│   │   └── style.css          # All styles
│   └── js/
│       ├── join.js            # Join page logic
│       ├── login.js           # Login page logic
│       ├── dashboard.js       # Dashboard page logic
│       ├── board.js           # Board page logic + Socket.IO client
│       └── export.js          # Markdown export trigger (download)
└── tests/
    ├── db.test.js             # Database schema + query tests
    ├── auth.test.js           # Auth route tests
    ├── boards.test.js         # Board CRUD tests
    ├── cards.test.js          # Card CRUD tests
    ├── votes.test.js          # Vote tests
    ├── join.test.js           # PIN join tests
    ├── export.test.js         # Markdown export tests
    └── helpers.js             # Shared test setup (in-memory DB, test app)
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `server.js`
- Create: `.gitignore`

- [ ] **Step 1: Initialize npm project**

Run:
```bash
cd /Users/odeloglos/retro-board
npm init -y
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install express socket.io better-sqlite3 bcrypt express-session uuid
npm install --save-dev vitest supertest
```

- [ ] **Step 3: Create .gitignore**

Create `.gitignore`:
```
node_modules/
*.db
.env
```

- [ ] **Step 4: Update package.json scripts**

Replace the `"scripts"` section in `package.json` with:
```json
{
  "scripts": {
    "start": "node server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 5: Create minimal server.js**

Create `server.js`:
```js
const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Retro Board running at http://localhost:${PORT}`);
});

module.exports = { app, server };
```

- [ ] **Step 6: Create placeholder index.html**

Create `public/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Retro Board</title>
</head>
<body>
  <h1>Retro Board</h1>
  <p>Coming soon.</p>
</body>
</html>
```

- [ ] **Step 7: Verify server starts**

Run: `npm start`

Expected: `Retro Board running at http://localhost:3000` — visit URL in browser, see "Retro Board / Coming soon."

Kill the server with Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json server.js public/index.html .gitignore
git commit -m "feat: scaffold project with Express server"
```

---

### Task 2: Database Schema

**Files:**
- Create: `src/db.js`
- Create: `tests/helpers.js`
- Create: `tests/db.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/helpers.js`:
```js
const Database = require('better-sqlite3');
const { initSchema } = require('../src/db');

function createTestDb() {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

module.exports = { createTestDb };
```

Create `tests/db.test.js`:
```js
const { describe, it, expect, beforeEach } = require('vitest');
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
    db.prepare("INSERT INTO boards (id, title, pin, admin_id) VALUES ('b1', 'Test', '123456', 1)").run();
    db.prepare("INSERT INTO cards (id, board_id, 'column', text, author, session_id) VALUES ('c1', 'b1', 'went_well', 'Nice', 'Alice', 's1')").run();
    db.prepare("INSERT INTO votes (card_id, session_id) VALUES ('c1', 's1')").run();
    expect(() => {
      db.prepare("INSERT INTO votes (card_id, session_id) VALUES ('c1', 's1')").run();
    }).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db.test.js`

Expected: FAIL — `Cannot find module '../src/db'`

- [ ] **Step 3: Write the implementation**

Create `src/db.js`:
```js
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
      text TEXT NOT NULL,
      author TEXT NOT NULL,
      session_id TEXT NOT NULL,
      assignee TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
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
```

- [ ] **Step 4: Fix the test — `column` is a reserved word**

The test inserts using `'column'` unquoted. Update the insert in `tests/db.test.js` to quote the column name:
```js
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/db.test.js`

Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/db.js tests/helpers.js tests/db.test.js
git commit -m "feat: add database schema with all tables"
```

---

### Task 3: Auth Routes (Admin Setup & Login)

**Files:**
- Create: `src/routes/auth.js`
- Create: `src/middleware.js`
- Create: `tests/auth.test.js`
- Modify: `server.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/auth.test.js`:
```js
const { describe, it, expect, beforeEach } = require('vitest');
const express = require('express');
const supertest = require('supertest');
const session = require('express-session');
const { createTestDb } = require('./helpers');
const { createAuthRouter } = require('../src/routes/auth');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.use('/api/auth', createAuthRouter(db));
  return app;
}

describe('auth routes', () => {
  let db, app;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
  });

  describe('GET /api/auth/status', () => {
    it('returns needs_setup when no admin exists', async () => {
      const res = await supertest(app).get('/api/auth/status');
      expect(res.status).toBe(200);
      expect(res.body.needs_setup).toBe(true);
      expect(res.body.logged_in).toBe(false);
    });
  });

  describe('POST /api/auth/setup', () => {
    it('creates admin account', async () => {
      const res = await supertest(app)
        .post('/api/auth/setup')
        .send({ username: 'admin', password: 'secret123' });
      expect(res.status).toBe(201);
      expect(res.body.username).toBe('admin');
    });

    it('rejects setup when admin already exists', async () => {
      await supertest(app).post('/api/auth/setup').send({ username: 'admin', password: 'secret123' });
      const res = await supertest(app).post('/api/auth/setup').send({ username: 'admin2', password: 'pass' });
      expect(res.status).toBe(403);
    });

    it('rejects empty username or password', async () => {
      const res = await supertest(app).post('/api/auth/setup').send({ username: '', password: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await supertest(app).post('/api/auth/setup').send({ username: 'admin', password: 'secret123' });
    });

    it('logs in with correct credentials', async () => {
      const res = await supertest(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'secret123' });
      expect(res.status).toBe(200);
      expect(res.body.username).toBe('admin');
    });

    it('rejects wrong password', async () => {
      const res = await supertest(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrong' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears session', async () => {
      const agent = supertest.agent(app);
      await agent.post('/api/auth/setup').send({ username: 'admin', password: 'secret123' });
      await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
      const res = await agent.post('/api/auth/logout');
      expect(res.status).toBe(200);
      const status = await agent.get('/api/auth/status');
      expect(status.body.logged_in).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/auth.test.js`

Expected: FAIL — `Cannot find module '../src/routes/auth'`

- [ ] **Step 3: Write the auth router**

Create `src/routes/auth.js`:
```js
const express = require('express');
const bcrypt = require('bcrypt');

function createAuthRouter(db) {
  const router = express.Router();

  router.get('/status', (req, res) => {
    const admin = db.prepare('SELECT id FROM admins LIMIT 1').get();
    res.json({
      needs_setup: !admin,
      logged_in: !!req.session.adminId,
      username: req.session.adminUsername || null
    });
  });

  router.post('/setup', async (req, res) => {
    const existing = db.prepare('SELECT id FROM admins LIMIT 1').get();
    if (existing) {
      return res.status(403).json({ error: 'Admin already exists' });
    }

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, password_hash);

    req.session.adminId = result.lastInsertRowid;
    req.session.adminUsername = username;
    res.status(201).json({ username });
  });

  router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.adminId = admin.id;
    req.session.adminUsername = admin.username;
    res.json({ username: admin.username });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  return router;
}

module.exports = { createAuthRouter };
```

- [ ] **Step 4: Write the middleware**

Create `src/middleware.js`:
```js
function requireAdmin(req, res, next) {
  if (!req.session.adminId) {
    return res.status(401).json({ error: 'Admin login required' });
  }
  next();
}

function requireBoardAccess(db) {
  return (req, res, next) => {
    const boardId = req.params.id || req.params.boardId;
    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId);

    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    if (req.session.adminId) {
      req.board = board;
      return next();
    }

    if (req.session.boardAccess && req.session.boardAccess[boardId]) {
      req.board = board;
      return next();
    }

    return res.status(403).json({ error: 'Board access required. Join with a PIN.' });
  };
}

module.exports = { requireAdmin, requireBoardAccess };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/auth.test.js`

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/auth.js src/middleware.js tests/auth.test.js
git commit -m "feat: add auth routes and admin middleware"
```

---

### Task 4: Board CRUD Routes

**Files:**
- Create: `src/routes/boards.js`
- Create: `tests/boards.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/boards.test.js`:
```js
const { describe, it, expect, beforeEach } = require('vitest');
const express = require('express');
const supertest = require('supertest');
const session = require('express-session');
const { createTestDb } = require('./helpers');
const { createAuthRouter } = require('../src/routes/auth');
const { createBoardsRouter } = require('../src/routes/boards');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/boards', createBoardsRouter(db));
  return app;
}

async function loginAsAdmin(app) {
  const agent = supertest.agent(app);
  await agent.post('/api/auth/setup').send({ username: 'admin', password: 'secret123' });
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
  return agent;
}

describe('board routes', () => {
  let db, app;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
  });

  describe('POST /api/boards', () => {
    it('creates a board when logged in as admin', async () => {
      const agent = await loginAsAdmin(app);
      const res = await agent.post('/api/boards').send({ title: 'Sprint 42 Retro' });
      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Sprint 42 Retro');
      expect(res.body.pin).toMatch(/^\d{6}$/);
      expect(res.body.is_locked).toBe(0);
    });

    it('rejects unauthenticated requests', async () => {
      const res = await supertest(app).post('/api/boards').send({ title: 'Test' });
      expect(res.status).toBe(401);
    });

    it('rejects empty title', async () => {
      const agent = await loginAsAdmin(app);
      const res = await agent.post('/api/boards').send({ title: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/boards', () => {
    it('lists boards for admin, newest first', async () => {
      const agent = await loginAsAdmin(app);
      await agent.post('/api/boards').send({ title: 'First' });
      await agent.post('/api/boards').send({ title: 'Second' });
      const res = await agent.get('/api/boards');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].title).toBe('Second');
    });
  });

  describe('GET /api/boards/:id', () => {
    it('returns board with cards and votes', async () => {
      const agent = await loginAsAdmin(app);
      const create = await agent.post('/api/boards').send({ title: 'Test Board' });
      const res = await agent.get(`/api/boards/${create.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Test Board');
      expect(res.body.cards).toEqual([]);
    });
  });

  describe('PATCH /api/boards/:id/lock', () => {
    it('toggles board lock', async () => {
      const agent = await loginAsAdmin(app);
      const create = await agent.post('/api/boards').send({ title: 'Test' });
      const res = await agent.patch(`/api/boards/${create.body.id}/lock`).send({ is_locked: true });
      expect(res.status).toBe(200);
      expect(res.body.is_locked).toBe(1);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/boards.test.js`

Expected: FAIL — `Cannot find module '../src/routes/boards'`

- [ ] **Step 3: Write the boards router**

Create `src/routes/boards.js`:
```js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAdmin, requireBoardAccess } = require('../middleware');

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function createBoardsRouter(db) {
  const router = express.Router();

  router.post('/', requireAdmin, (req, res) => {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title required' });
    }

    const id = uuidv4();
    const pin = generatePin();
    db.prepare('INSERT INTO boards (id, title, pin, admin_id) VALUES (?, ?, ?, ?)')
      .run(id, title, pin, req.session.adminId);

    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(id);
    res.status(201).json(board);
  });

  router.get('/', requireAdmin, (req, res) => {
    const boards = db.prepare('SELECT * FROM boards ORDER BY created_at DESC').all();
    res.json(boards);
  });

  router.get('/:id', requireBoardAccess(db), (req, res) => {
    const board = req.board;
    const cards = db.prepare('SELECT * FROM cards WHERE board_id = ? ORDER BY created_at ASC').all(board.id);
    const cardIds = cards.map(c => c.id);

    let voteCounts = {};
    if (cardIds.length > 0) {
      const placeholders = cardIds.map(() => '?').join(',');
      const votes = db.prepare(
        `SELECT card_id, COUNT(*) as count FROM votes WHERE card_id IN (${placeholders}) GROUP BY card_id`
      ).all(...cardIds);
      votes.forEach(v => { voteCounts[v.card_id] = v.count; });
    }

    const cardsWithVotes = cards.map(card => ({
      ...card,
      votes: voteCounts[card.id] || 0
    }));

    res.json({ ...board, cards: cardsWithVotes });
  });

  router.patch('/:id/lock', requireAdmin, (req, res) => {
    const { is_locked } = req.body;
    const boardId = req.params.id;
    db.prepare('UPDATE boards SET is_locked = ? WHERE id = ?').run(is_locked ? 1 : 0, boardId);
    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    res.json(board);
  });

  return router;
}

module.exports = { createBoardsRouter };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/boards.test.js`

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/boards.js tests/boards.test.js
git commit -m "feat: add board CRUD routes"
```

---

### Task 5: Join Route (PIN Validation)

**Files:**
- Create: `src/routes/join.js`
- Create: `tests/join.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/join.test.js`:
```js
const { describe, it, expect, beforeEach } = require('vitest');
const express = require('express');
const supertest = require('supertest');
const session = require('express-session');
const { createTestDb } = require('./helpers');
const { createAuthRouter } = require('../src/routes/auth');
const { createBoardsRouter } = require('../src/routes/boards');
const { createJoinRouter } = require('../src/routes/join');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/boards', createBoardsRouter(db));
  app.use('/api/join', createJoinRouter(db));
  return app;
}

describe('join routes', () => {
  let db, app, boardId, boardPin;

  beforeEach(async () => {
    db = createTestDb();
    app = createApp(db);
    const agent = supertest.agent(app);
    await agent.post('/api/auth/setup').send({ username: 'admin', password: 'secret123' });
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
    const res = await agent.post('/api/boards').send({ title: 'Test Retro' });
    boardId = res.body.id;
    boardPin = res.body.pin;
  });

  it('joins a board with valid PIN and name', async () => {
    const res = await supertest(app)
      .post('/api/join')
      .send({ pin: boardPin, display_name: 'Alice' });
    expect(res.status).toBe(200);
    expect(res.body.board_id).toBe(boardId);
    expect(res.body.display_name).toBe('Alice');
    expect(res.body.session_id).toBeDefined();
  });

  it('joins anonymously', async () => {
    const res = await supertest(app)
      .post('/api/join')
      .send({ pin: boardPin, anonymous: true });
    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('Anonymous');
  });

  it('rejects invalid PIN', async () => {
    const res = await supertest(app)
      .post('/api/join')
      .send({ pin: '000000', display_name: 'Bob' });
    expect(res.status).toBe(404);
  });

  it('records participant in database', async () => {
    await supertest(app).post('/api/join').send({ pin: boardPin, display_name: 'Carol' });
    const participants = db.prepare('SELECT * FROM participants WHERE board_id = ?').all(boardId);
    expect(participants).toHaveLength(1);
    expect(participants[0].display_name).toBe('Carol');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/join.test.js`

Expected: FAIL — `Cannot find module '../src/routes/join'`

- [ ] **Step 3: Write the join router**

Create `src/routes/join.js`:
```js
const express = require('express');
const { v4: uuidv4 } = require('uuid');

function createJoinRouter(db) {
  const router = express.Router();

  router.post('/', (req, res) => {
    const { pin, display_name, anonymous } = req.body;

    const board = db.prepare('SELECT * FROM boards WHERE pin = ?').get(pin);
    if (!board) {
      return res.status(404).json({ error: 'Invalid PIN' });
    }

    const name = anonymous ? 'Anonymous' : (display_name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Display name required (or join anonymously)' });
    }

    const sessionId = uuidv4();

    db.prepare('INSERT INTO participants (board_id, session_id, display_name) VALUES (?, ?, ?)')
      .run(board.id, sessionId, name);

    if (!req.session.boardAccess) {
      req.session.boardAccess = {};
    }
    req.session.boardAccess[board.id] = { sessionId, display_name: name };

    res.json({
      board_id: board.id,
      session_id: sessionId,
      display_name: name
    });
  });

  return router;
}

module.exports = { createJoinRouter };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/join.test.js`

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/join.js tests/join.test.js
git commit -m "feat: add PIN-based board join route"
```

---

### Task 6: Card CRUD Routes

**Files:**
- Create: `src/routes/cards.js`
- Create: `tests/cards.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/cards.test.js`:
```js
const { describe, it, expect, beforeEach } = require('vitest');
const express = require('express');
const supertest = require('supertest');
const session = require('express-session');
const { createTestDb } = require('./helpers');
const { createAuthRouter } = require('../src/routes/auth');
const { createBoardsRouter } = require('../src/routes/boards');
const { createJoinRouter } = require('../src/routes/join');
const { createCardsRouter } = require('../src/routes/cards');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/boards', createBoardsRouter(db));
  app.use('/api/join', createJoinRouter(db));
  app.use('/api', createCardsRouter(db));
  return app;
}

describe('card routes', () => {
  let db, app, boardId, boardPin, participantSession;

  beforeEach(async () => {
    db = createTestDb();
    app = createApp(db);

    const admin = supertest.agent(app);
    await admin.post('/api/auth/setup').send({ username: 'admin', password: 'secret123' });
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
    const boardRes = await admin.post('/api/boards').send({ title: 'Test' });
    boardId = boardRes.body.id;
    boardPin = boardRes.body.pin;

    const participant = supertest.agent(app);
    const joinRes = await participant.post('/api/join').send({ pin: boardPin, display_name: 'Alice' });
    participantSession = joinRes.body.session_id;
  });

  describe('POST /api/boards/:id/cards', () => {
    it('adds a card to a column', async () => {
      const agent = supertest.agent(app);
      await agent.post('/api/join').send({ pin: boardPin, display_name: 'Bob' });
      const res = await agent.post(`/api/boards/${boardId}/cards`).send({
        column: 'went_well',
        text: 'Great sprint!'
      });
      expect(res.status).toBe(201);
      expect(res.body.text).toBe('Great sprint!');
      expect(res.body.author).toBe('Bob');
      expect(res.body.column).toBe('went_well');
    });

    it('rejects cards on locked boards', async () => {
      const admin = supertest.agent(app);
      await admin.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
      await admin.patch(`/api/boards/${boardId}/lock`).send({ is_locked: true });

      const agent = supertest.agent(app);
      await agent.post('/api/join').send({ pin: boardPin, display_name: 'Charlie' });
      const res = await agent.post(`/api/boards/${boardId}/cards`).send({
        column: 'went_well',
        text: 'Too late'
      });
      expect(res.status).toBe(403);
    });

    it('rejects invalid column names', async () => {
      const agent = supertest.agent(app);
      await agent.post('/api/join').send({ pin: boardPin, display_name: 'Dave' });
      const res = await agent.post(`/api/boards/${boardId}/cards`).send({
        column: 'invalid_column',
        text: 'Oops'
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/cards/:id', () => {
    it('edits own card', async () => {
      const agent = supertest.agent(app);
      await agent.post('/api/join').send({ pin: boardPin, display_name: 'Eve' });
      const card = await agent.post(`/api/boards/${boardId}/cards`).send({
        column: 'to_improve',
        text: 'Original'
      });
      const res = await agent.patch(`/api/cards/${card.body.id}`).send({ text: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.text).toBe('Updated');
    });
  });

  describe('DELETE /api/cards/:id', () => {
    it('deletes own card', async () => {
      const agent = supertest.agent(app);
      await agent.post('/api/join').send({ pin: boardPin, display_name: 'Frank' });
      const card = await agent.post(`/api/boards/${boardId}/cards`).send({
        column: 'stop_doing',
        text: 'Delete me'
      });
      const res = await agent.delete(`/api/cards/${card.body.id}`);
      expect(res.status).toBe(200);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cards.test.js`

Expected: FAIL — `Cannot find module '../src/routes/cards'`

- [ ] **Step 3: Write the cards router**

Create `src/routes/cards.js`:
```js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireBoardAccess } = require('../middleware');

const VALID_COLUMNS = ['went_well', 'to_improve', 'stop_doing', 'action_items'];

function createCardsRouter(db) {
  const router = express.Router();

  router.post('/boards/:id/cards', requireBoardAccess(db), (req, res) => {
    const board = req.board;
    if (board.is_locked) {
      return res.status(403).json({ error: 'Board is locked' });
    }

    const { column, text, assignee } = req.body;
    if (!VALID_COLUMNS.includes(column)) {
      return res.status(400).json({ error: 'Invalid column. Must be one of: ' + VALID_COLUMNS.join(', ') });
    }
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Card text required' });
    }

    const boardAccess = req.session.boardAccess && req.session.boardAccess[board.id];
    if (!boardAccess && !req.session.adminId) {
      return res.status(403).json({ error: 'Must join the board first' });
    }

    const sessionId = boardAccess ? boardAccess.sessionId : `admin-${req.session.adminId}`;
    const author = boardAccess ? boardAccess.display_name : req.session.adminUsername;

    const id = uuidv4();
    db.prepare(
      'INSERT INTO cards (id, board_id, "column", text, author, session_id, assignee) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, board.id, column, text.trim(), author, sessionId, assignee || null);

    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
    res.status(201).json({ ...card, votes: 0 });
  });

  router.patch('/cards/:id', (req, res) => {
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(card.board_id);
    if (board.is_locked) {
      return res.status(403).json({ error: 'Board is locked' });
    }

    const boardAccess = req.session.boardAccess && req.session.boardAccess[card.board_id];
    const sessionId = boardAccess ? boardAccess.sessionId : (req.session.adminId ? `admin-${req.session.adminId}` : null);

    if (card.session_id !== sessionId) {
      return res.status(403).json({ error: 'Can only edit your own cards' });
    }

    const { text, assignee } = req.body;
    if (text !== undefined) {
      db.prepare('UPDATE cards SET text = ? WHERE id = ?').run(text.trim(), card.id);
    }
    if (assignee !== undefined) {
      db.prepare('UPDATE cards SET assignee = ? WHERE id = ?').run(assignee || null, card.id);
    }

    const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(card.id);
    const voteCount = db.prepare('SELECT COUNT(*) as count FROM votes WHERE card_id = ?').get(card.id);
    res.json({ ...updated, votes: voteCount.count });
  });

  router.delete('/cards/:id', (req, res) => {
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(card.board_id);
    if (board.is_locked) {
      return res.status(403).json({ error: 'Board is locked' });
    }

    const boardAccess = req.session.boardAccess && req.session.boardAccess[card.board_id];
    const sessionId = boardAccess ? boardAccess.sessionId : (req.session.adminId ? `admin-${req.session.adminId}` : null);

    if (card.session_id !== sessionId) {
      return res.status(403).json({ error: 'Can only delete your own cards' });
    }

    db.prepare('DELETE FROM cards WHERE id = ?').run(card.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createCardsRouter };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cards.test.js`

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/cards.js tests/cards.test.js
git commit -m "feat: add card CRUD routes"
```

---

### Task 7: Vote Route

**Files:**
- Create: `src/routes/votes.js`
- Create: `tests/votes.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/votes.test.js`:
```js
const { describe, it, expect, beforeEach } = require('vitest');
const express = require('express');
const supertest = require('supertest');
const session = require('express-session');
const { createTestDb } = require('./helpers');
const { createAuthRouter } = require('../src/routes/auth');
const { createBoardsRouter } = require('../src/routes/boards');
const { createJoinRouter } = require('../src/routes/join');
const { createCardsRouter } = require('../src/routes/cards');
const { createVotesRouter } = require('../src/routes/votes');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/boards', createBoardsRouter(db));
  app.use('/api/join', createJoinRouter(db));
  app.use('/api', createCardsRouter(db));
  app.use('/api', createVotesRouter(db));
  return app;
}

describe('vote routes', () => {
  let db, app, boardId, boardPin;

  beforeEach(async () => {
    db = createTestDb();
    app = createApp(db);
    const admin = supertest.agent(app);
    await admin.post('/api/auth/setup').send({ username: 'admin', password: 'secret123' });
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
    const boardRes = await admin.post('/api/boards').send({ title: 'Vote Test' });
    boardId = boardRes.body.id;
    boardPin = boardRes.body.pin;
  });

  it('upvotes a card', async () => {
    const author = supertest.agent(app);
    await author.post('/api/join').send({ pin: boardPin, display_name: 'Alice' });
    const card = await author.post(`/api/boards/${boardId}/cards`).send({ column: 'went_well', text: 'Nice' });

    const voter = supertest.agent(app);
    await voter.post('/api/join').send({ pin: boardPin, display_name: 'Bob' });
    const res = await voter.post(`/api/cards/${card.body.id}/vote`);
    expect(res.status).toBe(200);
    expect(res.body.votes).toBe(1);
  });

  it('prevents double voting', async () => {
    const author = supertest.agent(app);
    await author.post('/api/join').send({ pin: boardPin, display_name: 'Alice' });
    const card = await author.post(`/api/boards/${boardId}/cards`).send({ column: 'went_well', text: 'Nice' });

    const voter = supertest.agent(app);
    await voter.post('/api/join').send({ pin: boardPin, display_name: 'Bob' });
    await voter.post(`/api/cards/${card.body.id}/vote`);
    const res = await voter.post(`/api/cards/${card.body.id}/vote`);
    expect(res.status).toBe(409);
  });

  it('rejects votes on locked boards', async () => {
    const author = supertest.agent(app);
    await author.post('/api/join').send({ pin: boardPin, display_name: 'Alice' });
    const card = await author.post(`/api/boards/${boardId}/cards`).send({ column: 'went_well', text: 'Nice' });

    const admin = supertest.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
    await admin.patch(`/api/boards/${boardId}/lock`).send({ is_locked: true });

    const voter = supertest.agent(app);
    await voter.post('/api/join').send({ pin: boardPin, display_name: 'Bob' });
    const res = await voter.post(`/api/cards/${card.body.id}/vote`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/votes.test.js`

Expected: FAIL — `Cannot find module '../src/routes/votes'`

- [ ] **Step 3: Write the votes router**

Create `src/routes/votes.js`:
```js
const express = require('express');

function createVotesRouter(db) {
  const router = express.Router();

  router.post('/cards/:id/vote', (req, res) => {
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(card.board_id);
    if (board.is_locked) {
      return res.status(403).json({ error: 'Board is locked' });
    }

    const boardAccess = req.session.boardAccess && req.session.boardAccess[card.board_id];
    const sessionId = boardAccess ? boardAccess.sessionId : (req.session.adminId ? `admin-${req.session.adminId}` : null);

    if (!sessionId) {
      return res.status(403).json({ error: 'Must join the board first' });
    }

    const existing = db.prepare('SELECT id FROM votes WHERE card_id = ? AND session_id = ?').get(card.id, sessionId);
    if (existing) {
      return res.status(409).json({ error: 'Already voted on this card' });
    }

    db.prepare('INSERT INTO votes (card_id, session_id) VALUES (?, ?)').run(card.id, sessionId);
    const voteCount = db.prepare('SELECT COUNT(*) as count FROM votes WHERE card_id = ?').get(card.id);
    res.json({ card_id: card.id, votes: voteCount.count });
  });

  return router;
}

module.exports = { createVotesRouter };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/votes.test.js`

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/votes.js tests/votes.test.js
git commit -m "feat: add card voting route"
```

---

### Task 8: Markdown Export Route

**Files:**
- Create: `src/routes/export.js`
- Create: `tests/export.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/export.test.js`:
```js
const { describe, it, expect, beforeEach } = require('vitest');
const express = require('express');
const supertest = require('supertest');
const session = require('express-session');
const { createTestDb } = require('./helpers');
const { createAuthRouter } = require('../src/routes/auth');
const { createBoardsRouter } = require('../src/routes/boards');
const { createJoinRouter } = require('../src/routes/join');
const { createCardsRouter } = require('../src/routes/cards');
const { createVotesRouter } = require('../src/routes/votes');
const { createExportRouter } = require('../src/routes/export');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/boards', createBoardsRouter(db));
  app.use('/api/join', createJoinRouter(db));
  app.use('/api', createCardsRouter(db));
  app.use('/api', createVotesRouter(db));
  app.use('/api', createExportRouter(db));
  return app;
}

describe('export route', () => {
  let db, app, boardId, boardPin;

  beforeEach(async () => {
    db = createTestDb();
    app = createApp(db);
    const admin = supertest.agent(app);
    await admin.post('/api/auth/setup').send({ username: 'admin', password: 'secret123' });
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
    const boardRes = await admin.post('/api/boards').send({ title: 'Sprint 42 Retro' });
    boardId = boardRes.body.id;
    boardPin = boardRes.body.pin;
  });

  it('exports empty board as markdown', async () => {
    const admin = supertest.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
    const res = await admin.get(`/api/boards/${boardId}/export`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('# Sprint 42 Retro');
    expect(res.text).toContain('## Went Well');
    expect(res.text).toContain('## To Improve');
    expect(res.text).toContain('## Stop Doing');
    expect(res.text).toContain('## Action Items');
  });

  it('exports cards sorted by vote count descending', async () => {
    const alice = supertest.agent(app);
    await alice.post('/api/join').send({ pin: boardPin, display_name: 'Alice' });
    const card1 = await alice.post(`/api/boards/${boardId}/cards`).send({ column: 'went_well', text: 'Less votes' });
    const card2 = await alice.post(`/api/boards/${boardId}/cards`).send({ column: 'went_well', text: 'More votes' });

    const bob = supertest.agent(app);
    await bob.post('/api/join').send({ pin: boardPin, display_name: 'Bob' });
    await bob.post(`/api/cards/${card2.body.id}/vote`);

    const admin = supertest.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
    const res = await admin.get(`/api/boards/${boardId}/export`);

    const wentWellSection = res.text.split('## To Improve')[0];
    const moreIdx = wentWellSection.indexOf('More votes');
    const lessIdx = wentWellSection.indexOf('Less votes');
    expect(moreIdx).toBeLessThan(lessIdx);
  });

  it('includes assignee for action items', async () => {
    const alice = supertest.agent(app);
    await alice.post('/api/join').send({ pin: boardPin, display_name: 'Alice' });
    await alice.post(`/api/boards/${boardId}/cards`).send({
      column: 'action_items',
      text: 'Fix the tests',
      assignee: 'Bob'
    });

    const admin = supertest.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
    const res = await admin.get(`/api/boards/${boardId}/export`);
    expect(res.text).toContain('**Assigned to: Bob**');
  });

  it('omits vote indicator for zero-vote cards', async () => {
    const alice = supertest.agent(app);
    await alice.post('/api/join').send({ pin: boardPin, display_name: 'Alice' });
    await alice.post(`/api/boards/${boardId}/cards`).send({ column: 'went_well', text: 'No votes here' });

    const admin = supertest.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
    const res = await admin.get(`/api/boards/${boardId}/export`);

    const line = res.text.split('\n').find(l => l.includes('No votes here'));
    expect(line).not.toContain('👍');
  });

  it('includes participant list with anonymous count', async () => {
    await supertest(app).post('/api/join').send({ pin: boardPin, display_name: 'Alice' });
    await supertest(app).post('/api/join').send({ pin: boardPin, anonymous: true });
    await supertest(app).post('/api/join').send({ pin: boardPin, anonymous: true });

    const admin = supertest.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
    const res = await admin.get(`/api/boards/${boardId}/export`);
    expect(res.text).toContain('Alice');
    expect(res.text).toContain('2 anonymous');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/export.test.js`

Expected: FAIL — `Cannot find module '../src/routes/export'`

- [ ] **Step 3: Write the export router**

Create `src/routes/export.js`:
```js
const express = require('express');
const { requireBoardAccess } = require('../middleware');

const COLUMN_ORDER = [
  { key: 'went_well', label: 'Went Well' },
  { key: 'to_improve', label: 'To Improve' },
  { key: 'stop_doing', label: 'Stop Doing' },
  { key: 'action_items', label: 'Action Items' }
];

function createExportRouter(db) {
  const router = express.Router();

  router.get('/boards/:id/export', requireBoardAccess(db), (req, res) => {
    const board = req.board;

    const cards = db.prepare(`
      SELECT c.*, COUNT(v.id) as votes
      FROM cards c
      LEFT JOIN votes v ON v.card_id = c.id
      WHERE c.board_id = ?
      GROUP BY c.id
    `).all(board.id);

    const participants = db.prepare('SELECT display_name FROM participants WHERE board_id = ?').all(board.id);
    const named = participants.filter(p => p.display_name !== 'Anonymous').map(p => p.display_name);
    const anonCount = participants.filter(p => p.display_name === 'Anonymous').length;

    let participantList = [...new Set(named)].join(', ');
    if (anonCount > 0) {
      if (participantList) participantList += ', ';
      participantList += `${anonCount} anonymous`;
    }
    if (!participantList) {
      participantList = 'None';
    }

    const date = board.created_at.split(' ')[0] || board.created_at.split('T')[0];

    let md = `# ${board.title}\n`;
    md += `**Date:** ${date}\n`;
    md += `**Participants:** ${participantList}\n`;

    for (const col of COLUMN_ORDER) {
      md += `\n## ${col.label}\n`;

      const colCards = cards
        .filter(c => c.column === col.key)
        .sort((a, b) => b.votes - a.votes);

      if (colCards.length === 0) {
        md += '\n_No items_\n';
        continue;
      }

      for (const card of colCards) {
        let line = `- ${card.text}`;
        if (col.key === 'action_items' && card.assignee) {
          line += ` → **Assigned to: ${card.assignee}**`;
        }
        line += ` (${card.author})`;
        if (card.votes > 0) {
          line += ` 👍 ${card.votes}`;
        }
        md += line + '\n';
      }
    }

    const slug = board.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = `retro-${slug}-${date}.md`;

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(md);
  });

  return router;
}

module.exports = { createExportRouter };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/export.test.js`

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/export.js tests/export.test.js
git commit -m "feat: add Markdown export route"
```

---

### Task 9: Socket.IO Real-time & Presence

**Files:**
- Create: `src/socket.js`
- Modify: `server.js` — add Socket.IO, session sharing, mount all routes

- [ ] **Step 1: Write the Socket.IO handler**

Create `src/socket.js`:
```js
const { Server } = require('socket.io');

function initSocket(server, sessionMiddleware, db) {
  const io = new Server(server);

  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
  });

  const boardPresence = {};

  function getPresenceList(boardId) {
    const users = boardPresence[boardId] || {};
    const names = [];
    let anonCount = 0;

    for (const info of Object.values(users)) {
      if (info.display_name === 'Anonymous') {
        anonCount++;
      } else {
        names.push(info.display_name);
      }
    }

    return { names: [...new Set(names)], anonCount };
  }

  io.on('connection', (socket) => {
    socket.on('join-board', ({ boardId, sessionId, display_name }) => {
      socket.join(boardId);
      socket.boardId = boardId;
      socket.sessionId = sessionId;
      socket.display_name = display_name;

      if (!boardPresence[boardId]) {
        boardPresence[boardId] = {};
      }
      boardPresence[boardId][socket.id] = { display_name, sessionId };

      io.to(boardId).emit('presence:updated', getPresenceList(boardId));
    });

    socket.on('card:add', (data) => {
      io.to(socket.boardId).emit('card:added', data);
    });

    socket.on('card:edit', (data) => {
      io.to(socket.boardId).emit('card:edited', data);
    });

    socket.on('card:delete', (data) => {
      io.to(socket.boardId).emit('card:deleted', data);
    });

    socket.on('card:vote', (data) => {
      io.to(socket.boardId).emit('card:voted', data);
    });

    socket.on('board:lock', (data) => {
      io.to(socket.boardId).emit('board:locked', data);
    });

    let disconnectTimer;
    socket.on('disconnect', () => {
      const boardId = socket.boardId;
      if (!boardId) return;

      disconnectTimer = setTimeout(() => {
        if (boardPresence[boardId]) {
          delete boardPresence[boardId][socket.id];
          if (Object.keys(boardPresence[boardId]).length === 0) {
            delete boardPresence[boardId];
          }
        }
        io.to(boardId).emit('presence:updated', getPresenceList(boardId));
      }, 5000);
    });
  });

  return io;
}

module.exports = { initSocket };
```

- [ ] **Step 2: Wire everything together in server.js**

Replace `server.js` with the full wired version:
```js
const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const { getDb } = require('./src/db');
const { createAuthRouter } = require('./src/routes/auth');
const { createBoardsRouter } = require('./src/routes/boards');
const { createJoinRouter } = require('./src/routes/join');
const { createCardsRouter } = require('./src/routes/cards');
const { createVotesRouter } = require('./src/routes/votes');
const { createExportRouter } = require('./src/routes/export');
const { initSocket } = require('./src/socket');

const app = express();
const server = http.createServer(app);
const db = getDb();

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'retro-board-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
});

app.use(express.json());
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', createAuthRouter(db));
app.use('/api/boards', createBoardsRouter(db));
app.use('/api/join', createJoinRouter(db));
app.use('/api', createCardsRouter(db));
app.use('/api', createVotesRouter(db));
app.use('/api', createExportRouter(db));

app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/board/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'board.html')));

initSocket(server, sessionMiddleware, db);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Retro Board running at http://localhost:${PORT}`);
});

module.exports = { app, server };
```

- [ ] **Step 3: Verify all existing tests still pass**

Run: `npx vitest run`

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/socket.js server.js
git commit -m "feat: add Socket.IO real-time and presence handling"
```

---

### Task 10: Frontend — Join Page

**Files:**
- Modify: `public/index.html`
- Create: `public/css/style.css`
- Create: `public/js/join.js`

- [ ] **Step 1: Create the stylesheet**

Create `public/css/style.css`:
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
  color: #333;
  min-height: 100vh;
}

.container {
  max-width: 500px;
  margin: 80px auto;
  padding: 0 20px;
}

.card-form {
  background: #fff;
  border-radius: 8px;
  padding: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-form h1 {
  margin-bottom: 8px;
  font-size: 24px;
}

.card-form p {
  color: #666;
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: 14px;
}

.form-group input[type="text"],
.form-group input[type="password"] {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 16px;
}

.form-group input:focus {
  outline: none;
  border-color: #4a90d9;
  box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.1);
}

.checkbox-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-group input[type="checkbox"] {
  width: 18px;
  height: 18px;
}

.btn {
  display: inline-block;
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
}

.btn-primary {
  background: #4a90d9;
  color: #fff;
  width: 100%;
}

.btn-primary:hover {
  background: #357abd;
}

.error-msg {
  background: #fef2f2;
  color: #dc2626;
  padding: 10px 14px;
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 14px;
  display: none;
}

.admin-link {
  text-align: center;
  margin-top: 16px;
}

.admin-link a {
  color: #666;
  font-size: 14px;
}
```

- [ ] **Step 2: Create the join page HTML**

Replace `public/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Retro Board — Join</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div class="container">
    <div class="card-form">
      <h1>Join a Retro Board</h1>
      <p>Enter the board PIN to participate</p>
      <div class="error-msg" id="error"></div>
      <form id="join-form">
        <div class="form-group">
          <label for="pin">Board PIN</label>
          <input type="text" id="pin" maxlength="6" pattern="\d{6}" placeholder="6-digit PIN" required>
        </div>
        <div class="form-group">
          <label for="display-name">Your Name</label>
          <input type="text" id="display-name" placeholder="Enter your name">
        </div>
        <div class="form-group">
          <div class="checkbox-group">
            <input type="checkbox" id="anonymous">
            <label for="anonymous">Join anonymously</label>
          </div>
        </div>
        <button type="submit" class="btn btn-primary">Join Board</button>
      </form>
      <div class="admin-link">
        <a href="/login">Admin Login</a>
      </div>
    </div>
  </div>
  <script src="/js/join.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create the join page JavaScript**

Create `public/js/join.js`:
```js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('join-form');
  const pinInput = document.getElementById('pin');
  const nameInput = document.getElementById('display-name');
  const anonCheckbox = document.getElementById('anonymous');
  const errorEl = document.getElementById('error');

  anonCheckbox.addEventListener('change', () => {
    nameInput.disabled = anonCheckbox.checked;
    if (anonCheckbox.checked) {
      nameInput.value = '';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';

    const pin = pinInput.value.trim();
    const anonymous = anonCheckbox.checked;
    const display_name = anonymous ? undefined : nameInput.value.trim();

    if (!anonymous && !display_name) {
      errorEl.textContent = 'Please enter your name or join anonymously.';
      errorEl.style.display = 'block';
      return;
    }

    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, display_name, anonymous })
      });

      const data = await res.json();
      if (!res.ok) {
        errorEl.textContent = data.error || 'Failed to join board.';
        errorEl.style.display = 'block';
        return;
      }

      sessionStorage.setItem('sessionId', data.session_id);
      sessionStorage.setItem('displayName', data.display_name);
      window.location.href = `/board/${data.board_id}`;
    } catch (err) {
      errorEl.textContent = 'Connection error. Please try again.';
      errorEl.style.display = 'block';
    }
  });
});
```

- [ ] **Step 4: Verify manually**

Run: `npm start`

Visit `http://localhost:3000` — see the join form with PIN field, name field, anonymous checkbox, and admin link. Kill server.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/css/style.css public/js/join.js
git commit -m "feat: add join page frontend"
```

---

### Task 11: Frontend — Login Page

**Files:**
- Create: `public/login.html`
- Create: `public/js/login.js`

- [ ] **Step 1: Create the login page**

Create `public/login.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Retro Board — Admin Login</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div class="container">
    <div class="card-form">
      <h1 id="page-title">Admin Login</h1>
      <p id="page-subtitle">Sign in to manage your retro boards</p>
      <div class="error-msg" id="error"></div>
      <form id="auth-form">
        <div class="form-group">
          <label for="username">Username</label>
          <input type="text" id="username" required>
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" required>
        </div>
        <button type="submit" class="btn btn-primary" id="submit-btn">Log In</button>
      </form>
      <div class="admin-link">
        <a href="/">← Back to Join</a>
      </div>
    </div>
  </div>
  <script src="/js/login.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create the login JavaScript**

Create `public/js/login.js`:
```js
document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('auth-form');
  const title = document.getElementById('page-title');
  const subtitle = document.getElementById('page-subtitle');
  const submitBtn = document.getElementById('submit-btn');
  const errorEl = document.getElementById('error');

  const statusRes = await fetch('/api/auth/status');
  const status = await statusRes.json();

  if (status.logged_in) {
    window.location.href = '/dashboard';
    return;
  }

  let isSetup = status.needs_setup;

  if (isSetup) {
    title.textContent = 'Create Admin Account';
    subtitle.textContent = 'Set up your admin account to get started';
    submitBtn.textContent = 'Create Account';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    const endpoint = isSetup ? '/api/auth/setup' : '/api/auth/login';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        errorEl.textContent = data.error || 'Authentication failed.';
        errorEl.style.display = 'block';
        return;
      }

      window.location.href = '/dashboard';
    } catch (err) {
      errorEl.textContent = 'Connection error. Please try again.';
      errorEl.style.display = 'block';
    }
  });
});
```

- [ ] **Step 3: Verify manually**

Run: `npm start`

Visit `http://localhost:3000/login` — first time, see "Create Admin Account" form. Create an account, get redirected to `/dashboard` (which will 404 — that's expected, we build it next). Kill server.

- [ ] **Step 4: Commit**

```bash
git add public/login.html public/js/login.js
git commit -m "feat: add admin login page"
```

---

### Task 12: Frontend — Dashboard Page

**Files:**
- Create: `public/dashboard.html`
- Create: `public/js/dashboard.js`

- [ ] **Step 1: Create the dashboard HTML**

Create `public/dashboard.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Retro Board — Dashboard</title>
  <link rel="stylesheet" href="/css/style.css">
  <style>
    .dashboard { max-width: 800px; margin: 40px auto; padding: 0 20px; }
    .dashboard-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .dashboard-header h1 { font-size: 24px; }
    .header-actions { display: flex; gap: 12px; }
    .board-list { list-style: none; }
    .board-item { background: #fff; border-radius: 8px; padding: 16px 20px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: box-shadow 0.2s; }
    .board-item:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    .board-info h3 { font-size: 16px; margin-bottom: 4px; }
    .board-meta { font-size: 13px; color: #888; }
    .board-meta span { margin-right: 16px; }
    .board-status { font-size: 12px; padding: 4px 10px; border-radius: 12px; font-weight: 500; }
    .status-active { background: #dcfce7; color: #166534; }
    .status-locked { background: #fee2e2; color: #991b1b; }
    .modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 100; align-items: center; justify-content: center; }
    .modal-overlay.active { display: flex; }
    .modal { background: #fff; border-radius: 8px; padding: 32px; width: 400px; max-width: 90vw; }
    .modal h2 { margin-bottom: 16px; }
    .empty-state { text-align: center; padding: 60px 20px; color: #888; }
    .btn-secondary { background: #e5e7eb; color: #333; }
    .btn-secondary:hover { background: #d1d5db; }
    .btn-sm { padding: 8px 16px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="dashboard">
    <div class="dashboard-header">
      <h1>My Retro Boards</h1>
      <div class="header-actions">
        <button class="btn btn-primary btn-sm" id="new-board-btn">+ New Board</button>
        <button class="btn btn-secondary btn-sm" id="logout-btn">Log Out</button>
      </div>
    </div>
    <ul class="board-list" id="board-list">
      <li class="empty-state" id="empty-state">No boards yet. Create your first retro board!</li>
    </ul>
  </div>

  <div class="modal-overlay" id="modal">
    <div class="modal">
      <h2>New Retro Board</h2>
      <div class="error-msg" id="modal-error"></div>
      <form id="new-board-form">
        <div class="form-group">
          <label for="board-title">Board Title</label>
          <input type="text" id="board-title" placeholder="e.g. Sprint 42 Retro" required>
        </div>
        <div style="display: flex; gap: 12px;">
          <button type="submit" class="btn btn-primary" style="flex:1">Create Board</button>
          <button type="button" class="btn btn-secondary" id="cancel-btn" style="flex:1">Cancel</button>
        </div>
      </form>
    </div>
  </div>

  <script src="/js/dashboard.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create the dashboard JavaScript**

Create `public/js/dashboard.js`:
```js
document.addEventListener('DOMContentLoaded', async () => {
  const boardList = document.getElementById('board-list');
  const emptyState = document.getElementById('empty-state');
  const modal = document.getElementById('modal');
  const newBoardBtn = document.getElementById('new-board-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const newBoardForm = document.getElementById('new-board-form');
  const logoutBtn = document.getElementById('logout-btn');
  const modalError = document.getElementById('modal-error');

  const statusRes = await fetch('/api/auth/status');
  const status = await statusRes.json();
  if (!status.logged_in) {
    window.location.href = '/login';
    return;
  }

  async function loadBoards() {
    const res = await fetch('/api/boards');
    const boards = await res.json();

    boardList.innerHTML = '';

    if (boards.length === 0) {
      boardList.innerHTML = '<li class="empty-state">No boards yet. Create your first retro board!</li>';
      return;
    }

    for (const board of boards) {
      const li = document.createElement('li');
      li.className = 'board-item';
      li.onclick = () => { window.location.href = `/board/${board.id}`; };

      const date = new Date(board.created_at).toLocaleDateString();
      const statusClass = board.is_locked ? 'status-locked' : 'status-active';
      const statusText = board.is_locked ? 'Locked' : 'Active';

      li.innerHTML = `
        <div class="board-info">
          <h3>${board.title}</h3>
          <div class="board-meta">
            <span>PIN: ${board.pin}</span>
            <span>${date}</span>
          </div>
        </div>
        <span class="board-status ${statusClass}">${statusText}</span>
      `;
      boardList.appendChild(li);
    }
  }

  await loadBoards();

  newBoardBtn.addEventListener('click', () => {
    modal.classList.add('active');
    document.getElementById('board-title').focus();
  });

  cancelBtn.addEventListener('click', () => {
    modal.classList.remove('active');
    newBoardForm.reset();
    modalError.style.display = 'none';
  });

  newBoardForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    modalError.style.display = 'none';

    const title = document.getElementById('board-title').value.trim();
    if (!title) return;

    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });

      if (!res.ok) {
        const data = await res.json();
        modalError.textContent = data.error || 'Failed to create board.';
        modalError.style.display = 'block';
        return;
      }

      modal.classList.remove('active');
      newBoardForm.reset();
      await loadBoards();
    } catch (err) {
      modalError.textContent = 'Connection error. Please try again.';
      modalError.style.display = 'block';
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  });
});
```

- [ ] **Step 3: Verify manually**

Run: `npm start`

Visit `http://localhost:3000/login`, log in, see the dashboard. Create a board, see it appear in the list. Kill server.

- [ ] **Step 4: Commit**

```bash
git add public/dashboard.html public/js/dashboard.js
git commit -m "feat: add admin dashboard page"
```

---

### Task 13: Frontend — Board Page

**Files:**
- Create: `public/board.html`
- Create: `public/js/board.js`
- Create: `public/js/export.js`

- [ ] **Step 1: Create the board HTML**

Create `public/board.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Retro Board</title>
  <link rel="stylesheet" href="/css/style.css">
  <style>
    .board-header { background: #fff; padding: 16px 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
    .board-title { font-size: 20px; font-weight: 600; }
    .board-actions { display: flex; gap: 8px; align-items: center; }
    .presence { font-size: 13px; color: #666; padding: 8px 24px; background: #fafafa; border-bottom: 1px solid #eee; }
    .columns { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 24px; min-height: calc(100vh - 120px); }
    .column { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); display: flex; flex-direction: column; }
    .column-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; }
    .col-went-well .column-title { border-color: #22c55e; }
    .col-to-improve .column-title { border-color: #f59e0b; }
    .col-stop-doing .column-title { border-color: #ef4444; }
    .col-action-items .column-title { border-color: #3b82f6; }
    .cards-container { flex: 1; overflow-y: auto; margin-bottom: 12px; }
    .card-item { background: #f9fafb; border-radius: 6px; padding: 12px; margin-bottom: 8px; border: 1px solid #e5e7eb; }
    .card-text { font-size: 14px; margin-bottom: 6px; }
    .card-meta { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #888; }
    .card-author { font-style: italic; }
    .card-actions { display: flex; gap: 8px; align-items: center; }
    .vote-btn { background: none; border: 1px solid #ddd; border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 4px; }
    .vote-btn:hover { background: #f0f0f0; }
    .vote-btn.voted { background: #dbeafe; border-color: #93c5fd; }
    .edit-btn, .delete-btn { background: none; border: none; cursor: pointer; font-size: 12px; color: #888; padding: 2px 4px; }
    .edit-btn:hover { color: #4a90d9; }
    .delete-btn:hover { color: #dc2626; }
    .card-assignee { font-size: 12px; color: #3b82f6; margin-bottom: 4px; }
    .add-card { display: flex; gap: 8px; }
    .add-card input { flex: 1; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; }
    .add-card button { padding: 8px 14px; background: #4a90d9; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .add-card button:hover { background: #357abd; }
    .locked-banner { background: #fef2f2; color: #991b1b; text-align: center; padding: 8px; font-size: 14px; font-weight: 500; }
    .lock-toggle { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
    .lock-toggle input { width: 16px; height: 16px; }
    .btn-export { background: #f3f4f6; color: #333; border: 1px solid #ddd; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 13px; }
    .btn-export:hover { background: #e5e7eb; }

    @media (max-width: 900px) {
      .columns { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 600px) {
      .columns { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="board-header">
    <span class="board-title" id="board-title">Loading...</span>
    <div class="board-actions">
      <label class="lock-toggle" id="lock-toggle" style="display:none">
        <input type="checkbox" id="lock-checkbox">
        <span id="lock-label">Lock Board</span>
      </label>
      <button class="btn-export" id="export-btn">Export Markdown</button>
    </div>
  </div>
  <div class="presence" id="presence">Connecting...</div>
  <div class="locked-banner" id="locked-banner" style="display:none">This board is locked — read only</div>
  <div class="columns" id="columns">
    <div class="column col-went-well">
      <div class="column-title">Went Well</div>
      <div class="cards-container" id="cards-went_well"></div>
      <div class="add-card" id="add-went_well">
        <input type="text" placeholder="Add a card..." id="input-went_well">
        <button onclick="addCard('went_well')">+</button>
      </div>
    </div>
    <div class="column col-to-improve">
      <div class="column-title">To Improve</div>
      <div class="cards-container" id="cards-to_improve"></div>
      <div class="add-card" id="add-to_improve">
        <input type="text" placeholder="Add a card..." id="input-to_improve">
        <button onclick="addCard('to_improve')">+</button>
      </div>
    </div>
    <div class="column col-stop-doing">
      <div class="column-title">Stop Doing</div>
      <div class="cards-container" id="cards-stop_doing"></div>
      <div class="add-card" id="add-stop_doing">
        <input type="text" placeholder="Add a card..." id="input-stop_doing">
        <button onclick="addCard('stop_doing')">+</button>
      </div>
    </div>
    <div class="column col-action-items">
      <div class="column-title">Action Items</div>
      <div class="cards-container" id="cards-action_items"></div>
      <div class="add-card" id="add-action_items">
        <input type="text" placeholder="Add a card..." id="input-action_items">
        <input type="text" placeholder="Assignee (optional)" id="assignee-action_items" style="max-width:140px">
        <button onclick="addCard('action_items')">+</button>
      </div>
    </div>
  </div>
  <script src="/socket.io/socket.io.js"></script>
  <script src="/js/board.js"></script>
  <script src="/js/export.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create the board JavaScript**

Create `public/js/board.js`:
```js
const boardId = window.location.pathname.split('/').pop();
const sessionId = sessionStorage.getItem('sessionId');
const displayName = sessionStorage.getItem('displayName');
const socket = io();

let isAdmin = false;
let boardData = null;
let votedCards = new Set();

async function init() {
  const authRes = await fetch('/api/auth/status');
  const auth = await authRes.json();
  isAdmin = auth.logged_in;

  const res = await fetch(`/api/boards/${boardId}`);
  if (!res.ok) {
    document.body.innerHTML = '<div class="container"><div class="card-form"><h1>Access Denied</h1><p>You need a PIN to access this board. <a href="/">Go back</a></p></div></div>';
    return;
  }

  boardData = await res.json();
  document.getElementById('board-title').textContent = boardData.title;
  document.title = `Retro Board — ${boardData.title}`;

  if (isAdmin) {
    const lockToggle = document.getElementById('lock-toggle');
    lockToggle.style.display = 'flex';
    const lockCheckbox = document.getElementById('lock-checkbox');
    lockCheckbox.checked = !!boardData.is_locked;
    updateLockLabel(!!boardData.is_locked);

    lockCheckbox.addEventListener('change', async () => {
      const newState = lockCheckbox.checked;
      await fetch(`/api/boards/${boardId}/lock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_locked: newState })
      });
      socket.emit('board:lock', { is_locked: newState });
    });
  }

  updateLockState(!!boardData.is_locked);
  renderAllCards(boardData.cards);

  const joinName = isAdmin ? (auth.username || 'Admin') : (displayName || 'Anonymous');
  const joinSessionId = sessionId || `admin-${Date.now()}`;

  socket.emit('join-board', {
    boardId,
    sessionId: joinSessionId,
    display_name: joinName
  });
}

function updateLockLabel(locked) {
  document.getElementById('lock-label').textContent = locked ? 'Unlock Board' : 'Lock Board';
}

function updateLockState(locked) {
  const banner = document.getElementById('locked-banner');
  banner.style.display = locked ? 'block' : 'none';

  const addSections = document.querySelectorAll('.add-card');
  addSections.forEach(el => {
    el.style.display = locked ? 'none' : 'flex';
  });
}

function renderAllCards(cards) {
  const columns = ['went_well', 'to_improve', 'stop_doing', 'action_items'];
  columns.forEach(col => {
    document.getElementById(`cards-${col}`).innerHTML = '';
  });

  cards.forEach(card => renderCard(card));
}

function renderCard(card) {
  const container = document.getElementById(`cards-${card.column}`);
  const existing = document.getElementById(`card-${card.id}`);
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.className = 'card-item';
  div.id = `card-${card.id}`;

  const isOwn = card.session_id === sessionId || card.session_id === `admin-${sessionId}`;
  const hasVoted = votedCards.has(card.id);

  let html = '';
  if (card.assignee && card.column === 'action_items') {
    html += `<div class="card-assignee">→ ${card.assignee}</div>`;
  }
  html += `<div class="card-text">${escapeHtml(card.text)}</div>`;
  html += '<div class="card-meta">';
  html += `<span class="card-author">${escapeHtml(card.author)}</span>`;
  html += '<span class="card-actions">';
  html += `<button class="vote-btn ${hasVoted ? 'voted' : ''}" onclick="voteCard('${card.id}')" ${hasVoted ? 'disabled' : ''}>👍 <span id="votes-${card.id}">${card.votes || 0}</span></button>`;
  if (isOwn) {
    html += `<button class="edit-btn" onclick="editCard('${card.id}')">✏️</button>`;
    html += `<button class="delete-btn" onclick="deleteCard('${card.id}')">🗑️</button>`;
  }
  html += '</span></div>';

  div.innerHTML = html;
  container.appendChild(div);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function addCard(column) {
  const input = document.getElementById(`input-${column}`);
  const text = input.value.trim();
  if (!text) return;

  let assignee = null;
  if (column === 'action_items') {
    const assigneeInput = document.getElementById('assignee-action_items');
    assignee = assigneeInput.value.trim() || null;
    assigneeInput.value = '';
  }

  const res = await fetch(`/api/boards/${boardId}/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ column, text, assignee })
  });

  if (res.ok) {
    const card = await res.json();
    renderCard(card);
    socket.emit('card:add', card);
    input.value = '';
    input.focus();
  }
}

async function editCard(cardId) {
  const cardEl = document.getElementById(`card-${cardId}`);
  const textEl = cardEl.querySelector('.card-text');
  const currentText = textEl.textContent;

  const newText = prompt('Edit card:', currentText);
  if (newText === null || newText.trim() === '' || newText === currentText) return;

  const res = await fetch(`/api/cards/${cardId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: newText.trim() })
  });

  if (res.ok) {
    const updated = await res.json();
    renderCard(updated);
    socket.emit('card:edit', updated);
  }
}

async function deleteCard(cardId) {
  if (!confirm('Delete this card?')) return;

  const res = await fetch(`/api/cards/${cardId}`, { method: 'DELETE' });
  if (res.ok) {
    const el = document.getElementById(`card-${cardId}`);
    if (el) el.remove();
    socket.emit('card:delete', { id: cardId });
  }
}

async function voteCard(cardId) {
  const res = await fetch(`/api/cards/${cardId}/vote`, { method: 'POST' });
  if (res.ok) {
    const data = await res.json();
    votedCards.add(cardId);
    const votesEl = document.getElementById(`votes-${cardId}`);
    if (votesEl) votesEl.textContent = data.votes;
    const btn = votesEl?.closest('.vote-btn');
    if (btn) {
      btn.classList.add('voted');
      btn.disabled = true;
    }
    socket.emit('card:vote', { id: cardId, votes: data.votes });
  }
}

// Socket.IO event listeners
socket.on('card:added', (card) => {
  if (!document.getElementById(`card-${card.id}`)) {
    renderCard(card);
  }
});

socket.on('card:edited', (card) => {
  renderCard(card);
});

socket.on('card:deleted', (data) => {
  const el = document.getElementById(`card-${data.id}`);
  if (el) el.remove();
});

socket.on('card:voted', (data) => {
  const votesEl = document.getElementById(`votes-${data.id}`);
  if (votesEl) votesEl.textContent = data.votes;
});

socket.on('board:locked', (data) => {
  updateLockState(data.is_locked);
  if (isAdmin) {
    document.getElementById('lock-checkbox').checked = data.is_locked;
    updateLockLabel(data.is_locked);
  }
});

socket.on('presence:updated', (data) => {
  const parts = [];
  if (data.names.length > 0) parts.push(data.names.join(', '));
  if (data.anonCount > 0) parts.push(`${data.anonCount} anonymous`);
  document.getElementById('presence').textContent = 'Online: ' + (parts.join(', ') || 'Just you');
});

socket.on('connect', () => {
  if (boardData) {
    const authName = displayName || 'Admin';
    const sid = sessionId || `admin-${Date.now()}`;
    socket.emit('join-board', { boardId, sessionId: sid, display_name: authName });
  }
});

// Allow Enter key to add cards
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('.add-card input[id^="input-"]')) {
    const column = e.target.id.replace('input-', '');
    addCard(column);
  }
});

init();
```

- [ ] **Step 3: Create the export JavaScript**

Create `public/js/export.js`:
```js
document.getElementById('export-btn').addEventListener('click', async () => {
  const boardId = window.location.pathname.split('/').pop();
  const res = await fetch(`/api/boards/${boardId}/export`);

  if (!res.ok) {
    alert('Failed to export board.');
    return;
  }

  const text = await res.text();
  const disposition = res.headers.get('Content-Disposition') || '';
  const filenameMatch = disposition.match(/filename="(.+)"/);
  const filename = filenameMatch ? filenameMatch[1] : 'retro-export.md';

  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
});
```

- [ ] **Step 4: Verify manually — full end-to-end test**

Run: `npm start`

1. Visit `http://localhost:3000/login` — log in as admin
2. Create a board from the dashboard
3. Copy the PIN shown on the dashboard
4. Open a second browser tab (or incognito window) to `http://localhost:3000`
5. Enter the PIN and a name, join the board
6. Add cards in both tabs — verify they appear in real-time in the other tab
7. Upvote a card — verify count updates in both tabs
8. Edit and delete a card — verify changes propagate
9. Check the presence indicator shows both users
10. Lock the board from the admin tab — verify inputs disappear in both tabs
11. Click Export Markdown — verify the `.md` file downloads with correct content
12. Kill server.

- [ ] **Step 5: Commit**

```bash
git add public/board.html public/js/board.js public/js/export.js
git commit -m "feat: add board page with real-time collaboration"
```

---

### Task 14: Final Integration — Run All Tests & Verify

**Files:** No new files. Verification only.

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`

Expected: All tests PASS (db, auth, boards, cards, votes, join, export)

- [ ] **Step 2: Full manual walkthrough**

Run: `npm start`

Complete walkthrough:
1. Fresh start (delete `retro.db` if it exists): `rm -f retro.db && npm start`
2. Go to `http://localhost:3000/login` — see "Create Admin Account"
3. Create admin, get redirected to dashboard
4. Create a board "Sprint 42 Retro"
5. Note the PIN
6. Open incognito: go to `http://localhost:3000`, enter PIN, join as "Priya"
7. Open another incognito: join anonymously with the same PIN
8. Add cards to each column from different tabs
9. Verify real-time updates across all tabs
10. Upvote cards from different sessions
11. Edit and delete own cards
12. Check presence indicator: should show admin name, "Priya", and "1 anonymous"
13. Lock the board from admin tab — verify all tabs go read-only
14. Export to Markdown — verify file content
15. Unlock, verify editing works again
16. Log out from admin, verify redirect to login

- [ ] **Step 3: Commit any final fixes**

If any issues were found and fixed:
```bash
git add -A
git commit -m "fix: address integration issues from full walkthrough"
```

- [ ] **Step 4: Final commit — mark MVP complete**

```bash
git add -A
git commit -m "feat: complete retro board MVP — real-time boards with PIN auth, voting, and Markdown export"
```
