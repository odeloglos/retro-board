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
