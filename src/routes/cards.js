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

    const { column, text, assignee, gif_url, avatar } = req.body;
    if (!VALID_COLUMNS.includes(column)) {
      return res.status(400).json({ error: 'Invalid column. Must be one of: ' + VALID_COLUMNS.join(', ') });
    }
    const hasContent = (text && text.trim()) || gif_url || avatar;
    if (!hasContent) {
      return res.status(400).json({ error: 'Card must have text, gif_url, or avatar' });
    }

    const boardAccess = req.session.boardAccess && req.session.boardAccess[board.id];
    if (!boardAccess && !req.session.adminId) {
      return res.status(403).json({ error: 'Must join the board first' });
    }

    const sessionId = boardAccess ? boardAccess.sessionId : `admin-${req.session.adminId}`;
    const author = boardAccess ? boardAccess.display_name : req.session.adminUsername;

    const id = uuidv4();
    db.prepare(
      'INSERT INTO cards (id, board_id, "column", text, author, session_id, assignee, gif_url, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, board.id, column, text ? text.trim() : null, author, sessionId, assignee || null, gif_url || null, avatar || null);

    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
    res.status(201).json({ ...card, reactions: {} });
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

    const { text, assignee, gif_url, avatar } = req.body;
    if (text !== undefined) {
      db.prepare('UPDATE cards SET text = ? WHERE id = ?').run(text ? text.trim() : null, card.id);
    }
    if (assignee !== undefined) {
      db.prepare('UPDATE cards SET assignee = ? WHERE id = ?').run(assignee || null, card.id);
    }
    if (gif_url !== undefined) {
      db.prepare('UPDATE cards SET gif_url = ? WHERE id = ?').run(gif_url || null, card.id);
    }
    if (avatar !== undefined) {
      db.prepare('UPDATE cards SET avatar = ? WHERE id = ?').run(avatar || null, card.id);
    }

    const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(card.id);
    const reactionRows = db.prepare(
      'SELECT type, COUNT(*) as count FROM reactions WHERE card_id = ? GROUP BY type'
    ).all(card.id);
    const reactions = {};
    reactionRows.forEach(r => { reactions[r.type] = r.count; });
    res.json({ ...updated, reactions });
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
