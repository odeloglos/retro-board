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
