const express = require('express');

function createVotesRouter(db) {
  const router = express.Router();

  router.post('/cards/:id/vote', (req, res) => {
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(card.board_id);
    if (board.is_locked) {
      return res.status(403).json({ error: 'Board is locked' });
    }

    const boardAccess = req.session.boardAccess && req.session.boardAccess[card.board_id];
    const sessionId = boardAccess ? boardAccess.sessionId : (req.session.adminId ? `admin-${req.session.adminId}` : null);

    if (!sessionId) {
      return res.status(403).json({ error: 'Must join the board first' });
    }

    const existing = db.prepare('SELECT id FROM votes WHERE card_id = ? AND session_id = ?').get(card.id, sessionId);
    if (existing) {
      return res.status(409).json({ error: 'Already voted on this card' });
    }

    db.prepare('INSERT INTO votes (card_id, session_id) VALUES (?, ?)').run(card.id, sessionId);
    const voteCount = db.prepare('SELECT COUNT(*) as count FROM votes WHERE card_id = ?').get(card.id);
    res.json({ card_id: card.id, votes: voteCount.count });
  });

  return router;
}

module.exports = { createVotesRouter };
