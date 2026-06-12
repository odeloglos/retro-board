const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const { getDb } = require('./src/db');
const { createAuthRouter } = require('./src/routes/auth');
const { createBoardsRouter } = require('./src/routes/boards');
const { createJoinRouter } = require('./src/routes/join');
const { createCardsRouter } = require('./src/routes/cards');
const { createReactionsRouter } = require('./src/routes/reactions');
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

app.set('trust proxy', 1);
app.use(express.json());
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', createAuthRouter(db));
app.use('/api/boards', createBoardsRouter(db));
app.use('/api/join', createJoinRouter(db));
app.use('/api', createCardsRouter(db));
app.use('/api', createReactionsRouter(db));
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
