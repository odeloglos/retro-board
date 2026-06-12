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
