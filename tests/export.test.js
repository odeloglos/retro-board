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
