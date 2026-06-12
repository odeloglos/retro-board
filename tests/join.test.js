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
