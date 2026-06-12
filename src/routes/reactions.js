const express = require('express');

const VALID_REACTIONS = [
  'thumbs_up', 'thumbs_down', 'heart',
  'chris_happy', 'chris_grumpy',
  'phani_happy', 'phani_grumpy',
  'scott_happy', 'scott_grumpy'
];

function getReactionSummary(db, cardId) {
  const rows = db.prepare(
    'SELECT type, COUNT(*) as count FROM reactions WHERE card_id = ? GROUP BY type'
  ).all(cardId);
  const summary = {};
  rows.forEach(r => { summary[r.type] = r.count; });
  return summary;
}

function createReactionsRouter(db) {
  const router = express.Router();

  router.post('/cards/:id/react', (req, res) => {
    const { type } = req.body;
    if (!type || !VALID_REACTIONS.includes(type)) {
      return res.status(400).json({ error: 'Invalid reaction type' });
    }

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

    const existing = db.prepare('SELECT * FROM reactions WHERE card_id = ? AND session_id = ?').get(card.id, sessionId);

    if (existing) {
      if (existing.type === type) {
        // Toggle off - remove reaction
        db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
      } else {
        // Swap to different type
        db.prepare('UPDATE reactions SET type = ? WHERE id = ?').run(type, existing.id);
      }
    } else {
      // New reaction
      db.prepare('INSERT INTO reactions (card_id, session_id, type) VALUES (?, ?, ?)').run(card.id, sessionId, type);
    }

    const reactions = getReactionSummary(db, card.id);
    res.json({ card_id: card.id, reactions });
  });

  return router;
}

module.exports = { createReactionsRouter, getReactionSummary, VALID_REACTIONS };
