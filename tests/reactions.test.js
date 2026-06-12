const express = require('express');
const supertest = require('supertest');
const session = require('express-session');
const { createTestDb } = require('./helpers');
const { createAuthRouter } = require('../src/routes/auth');
const { createBoardsRouter } = require('../src/routes/boards');
const { createJoinRouter } = require('../src/routes/join');
const { createCardsRouter } = require('../src/routes/cards');
const { createReactionsRouter } = require('../src/routes/reactions');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/boards', createBoardsRouter(db));
  app.use('/api/join', createJoinRouter(db));
  app.use('/api', createCardsRouter(db));
  app.use('/api', createReactionsRouter(db));
  return app;
}

describe('reaction routes', () => {
  let db, app, boardId, boardPin;

  beforeEach(async () => {
    db = createTestDb();
    app = createApp(db);
    const admin = supertest.agent(app);
    await admin.post('/api/auth/setup').send({ username: 'admin', password: 'secret123' });
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
    const boardRes = await admin.post('/api/boards').send({ title: 'Reaction Test' });
    boardId = boardRes.body.id;
    boardPin = boardRes.body.pin;
  });

  it('adds a reaction to a card', async () => {
    const author = supertest.agent(app);
    await author.post('/api/join').send({ pin: boardPin, display_name: 'Alice' });
    const card = await author.post(`/api/boards/${boardId}/cards`).send({ column: 'went_well', text: 'Nice' });

    const reactor = supertest.agent(app);
    await reactor.post('/api/join').send({ pin: boardPin, display_name: 'Bob' });
    const res = await reactor.post(`/api/cards/${card.body.id}/react`).send({ type: 'thumbs_up' });
    expect(res.status).toBe(200);
    expect(res.body.reactions.thumbs_up).toBe(1);
  });

  it('toggles off a reaction when same type sent again', async () => {
    const author = supertest.agent(app);
    await author.post('/api/join').send({ pin: boardPin, display_name: 'Alice' });
    const card = await author.post(`/api/boards/${boardId}/cards`).send({ column: 'went_well', text: 'Nice' });

    const reactor = supertest.agent(app);
    await reactor.post('/api/join').send({ pin: boardPin, display_name: 'Bob' });
    await reactor.post(`/api/cards/${card.body.id}/react`).send({ type: 'thumbs_up' });
    const res = await reactor.post(`/api/cards/${card.body.id}/react`).send({ type: 'thumbs_up' });
    expect(res.status).toBe(200);
    expect(res.body.reactions.thumbs_up).toBeUndefined();
  });

  it('swaps reaction when different type sent', async () => {
    const author = supertest.agent(app);
    await author.post('/api/join').send({ pin: boardPin, display_name: 'Alice' });
    const card = await author.post(`/api/boards/${boardId}/cards`).send({ column: 'went_well', text: 'Nice' });

    const reactor = supertest.agent(app);
    await reactor.post('/api/join').send({ pin: boardPin, display_name: 'Bob' });
    await reactor.post(`/api/cards/${card.body.id}/react`).send({ type: 'thumbs_up' });
    const res = await reactor.post(`/api/cards/${card.body.id}/react`).send({ type: 'heart' });
    expect(res.status).toBe(200);
    expect(res.body.reactions.thumbs_up).toBeUndefined();
    expect(res.body.reactions.heart).toBe(1);
  });

  it('rejects invalid reaction type', async () => {
    const author = supertest.agent(app);
    await author.post('/api/join').send({ pin: boardPin, display_name: 'Alice' });
    const card = await author.post(`/api/boards/${boardId}/cards`).send({ column: 'went_well', text: 'Nice' });

    const reactor = supertest.agent(app);
    await reactor.post('/api/join').send({ pin: boardPin, display_name: 'Bob' });
    const res = await reactor.post(`/api/cards/${card.body.id}/react`).send({ type: 'invalid_type' });
    expect(res.status).toBe(400);
  });

  it('rejects reactions on locked boards', async () => {
    const author = supertest.agent(app);
    await author.post('/api/join').send({ pin: boardPin, display_name: 'Alice' });
    const card = await author.post(`/api/boards/${boardId}/cards`).send({ column: 'went_well', text: 'Nice' });

    const admin = supertest.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
    await admin.patch(`/api/boards/${boardId}/lock`).send({ is_locked: true });

    const reactor = supertest.agent(app);
    await reactor.post('/api/join').send({ pin: boardPin, display_name: 'Bob' });
    const res = await reactor.post(`/api/cards/${card.body.id}/react`).send({ type: 'thumbs_up' });
    expect(res.status).toBe(403);
  });

  it('rejects reactions without board access', async () => {
    const author = supertest.agent(app);
    await author.post('/api/join').send({ pin: boardPin, display_name: 'Alice' });
    const card = await author.post(`/api/boards/${boardId}/cards`).send({ column: 'went_well', text: 'Nice' });

    const stranger = supertest.agent(app);
    const res = await stranger.post(`/api/cards/${card.body.id}/react`).send({ type: 'thumbs_up' });
    expect(res.status).toBe(403);
  });
});
