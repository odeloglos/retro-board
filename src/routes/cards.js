const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireBoardAccess } = require('../middleware');

const VALID_COLUMNS = ['went_well', 'to_improve', 'stop_doing', 'action_items'];

function createCardsRouter(db) {
  const router = express.Router();

  router.post('/boards/:id/cards', requireBoardAccess(db), (req, res) => {
    const board = req.board;
    if (board.is_locked) {
      return res.status(403).json({ error: 'Board is locked' });
    }

    const { column, text, assignee } = req.body;
    if (!VALID_COLUMNS.includes(column)) {
      return res.status(400).json({ error: 'Invalid column. Must be one of: ' + VALID_COLUMNS.join(', ') });
    }
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Card text required' });
    }

    const boardAccess = req.session.boardAccess && req.session.boardAccess[board.id];
    if (!boardAccess && !req.session.adminId) {
      return res.status(403).json({ error: 'Must join the board first' });
    }

    const sessionId = boardAccess ? boardAccess.sessionId : `admin-${req.session.adminId}`;
    const author = boardAccess ? boardAccess.display_name : req.session.adminUsername;

    const id = uuidv4();
    db.prepare(
      'INSERT INTO cards (id, board_id, "column", text, author, session_id, assignee) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, board.id, column, text.trim(), author, sessionId, assignee || null);

    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
    res.status(201).json({ ...card, votes: 0 });
  });

  router.patch('/cards/:id', (req, res) => {
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

    if (card.session_id !== sessionId) {
      return res.status(403).json({ error: 'Can only edit your own cards' });
    }

    const { text, assignee } = req.body;
    if (text !== undefined) {
      db.prepare('UPDATE cards SET text = ? WHERE id = ?').run(text.trim(), card.id);
    }
    if (assignee !== undefined) {
      db.prepare('UPDATE cards SET assignee = ? WHERE id = ?').run(assignee || null, card.id);
    }

    const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(card.id);
    const voteCount = db.prepare('SELECT COUNT(*) as count FROM votes WHERE card_id = ?').get(card.id);
    res.json({ ...updated, votes: voteCount.count });
  });

  router.delete('/cards/:id', (req, res) => {
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

    if (card.session_id !== sessionId) {
      return res.status(403).json({ error: 'Can only delete your own cards' });
    }

    db.prepare('DELETE FROM cards WHERE id = ?').run(card.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createCardsRouter };
