function requireAdmin(req, res, next) {
  if (!req.session.adminId) {
    return res.status(401).json({ error: 'Admin login required' });
  }
  next();
}

function requireBoardAccess(db) {
  return (req, res, next) => {
    const boardId = req.params.id || req.params.boardId;
    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId);

    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    if (req.session.adminId) {
      req.board = board;
      return next();
    }

    if (req.session.boardAccess && req.session.boardAccess[boardId]) {
      req.board = board;
      return next();
    }

    return res.status(403).json({ error: 'Board access required. Join with a PIN.' });
  };
}

module.exports = { requireAdmin, requireBoardAccess };
