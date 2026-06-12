const express = require('express');
const { requireBoardAccess } = require('../middleware');

const COLUMN_ORDER = [
  { key: 'went_well', label: 'Went Well' },
  { key: 'to_improve', label: 'To Improve' },
  { key: 'stop_doing', label: 'Stop Doing' },
  { key: 'action_items', label: 'Action Items' }
];

function createExportRouter(db) {
  const router = express.Router();

  router.get('/boards/:id/export', requireBoardAccess(db), (req, res) => {
    const board = req.board;

    const cards = db.prepare(`
      SELECT c.*, COUNT(v.id) as votes
      FROM cards c
      LEFT JOIN votes v ON v.card_id = c.id
      WHERE c.board_id = ?
      GROUP BY c.id
    `).all(board.id);

    const participants = db.prepare('SELECT display_name FROM participants WHERE board_id = ?').all(board.id);
    const named = participants.filter(p => p.display_name !== 'Anonymous').map(p => p.display_name);
    const anonCount = participants.filter(p => p.display_name === 'Anonymous').length;

    let participantList = [...new Set(named)].join(', ');
    if (anonCount > 0) {
      if (participantList) participantList += ', ';
      participantList += `${anonCount} anonymous`;
    }
    if (!participantList) {
      participantList = 'None';
    }

    const date = board.created_at.split(' ')[0] || board.created_at.split('T')[0];

    let md = `# ${board.title}\n`;
    md += `**Date:** ${date}\n`;
    md += `**Participants:** ${participantList}\n`;

    for (const col of COLUMN_ORDER) {
      md += `\n## ${col.label}\n`;

      const colCards = cards
        .filter(c => c.column === col.key)
        .sort((a, b) => b.votes - a.votes);

      if (colCards.length === 0) {
        md += '\n_No items_\n';
        continue;
      }

      for (const card of colCards) {
        let line = `- ${card.text}`;
        if (col.key === 'action_items' && card.assignee) {
          line += ` → **Assigned to: ${card.assignee}**`;
        }
        line += ` (${card.author})`;
        if (card.votes > 0) {
          line += ` 👍 ${card.votes}`;
        }
        md += line + '\n';
      }
    }

    const slug = board.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = `retro-${slug}-${date}.md`;

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(md);
  });

  return router;
}

module.exports = { createExportRouter };
