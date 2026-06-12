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
