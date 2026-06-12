const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAdmin, requireBoardAccess } = require('../middleware');

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function createBoardsRouter(db) {
  const router = express.Router();

  router.post('/', requireAdmin, (req, res) => {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title required' });
    }

    const id = uuidv4();
    const pin = generatePin();
    db.prepare('INSERT INTO boards (id, title, pin, admin_id) VALUES (?, ?, ?, ?)')
      .run(id, title, pin, req.session.adminId);

    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(id);
    res.status(201).json(board);
  });

  router.get('/', requireAdmin, (req, res) => {
    const boards = db.prepare('SELECT * FROM boards ORDER BY created_at DESC, rowid DESC').all();
    res.json(boards);
  });

  router.get('/:id', requireBoardAccess(db), (req, res) => {
    const board = req.board;
    const cards = db.prepare('SELECT * FROM cards WHERE board_id = ? ORDER BY created_at ASC').all(board.id);
    const cardIds = cards.map(c => c.id);

    let voteCounts = {};
    if (cardIds.length > 0) {
      const placeholders = cardIds.map(() => '?').join(',');
      const votes = db.prepare(
        `SELECT card_id, COUNT(*) as count FROM votes WHERE card_id IN (${placeholders}) GROUP BY card_id`
      ).all(...cardIds);
      votes.forEach(v => { voteCounts[v.card_id] = v.count; });
    }

    const cardsWithVotes = cards.map(card => ({
      ...card,
      votes: voteCounts[card.id] || 0
    }));

    res.json({ ...board, cards: cardsWithVotes });
  });

  router.patch('/:id/lock', requireAdmin, (req, res) => {
    const { is_locked } = req.body;
    const boardId = req.params.id;
    db.prepare('UPDATE boards SET is_locked = ? WHERE id = ?').run(is_locked ? 1 : 0, boardId);
    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    res.json(board);
  });

  return router;
}

module.exports = { createBoardsRouter };
