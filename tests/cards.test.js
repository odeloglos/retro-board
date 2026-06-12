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
  let db, app, boardId, boardPin;

  beforeEach(async () => {
    db = createTestDb();
    app = createApp(db);

    const admin = supertest.agent(app);
    await admin.post('/api/auth/setup').send({ username: 'admin', password: 'secret123' });
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
    const boardRes = await admin.post('/api/boards').send({ title: 'Test' });
    boardId = boardRes.body.id;
    boardPin = boardRes.body.pin;
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
