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
