const express = require('express');
const { requireBoardAccess } = require('../middleware');

const COLUMN_ORDER = [
  { key: 'went_well', label: 'Went Well' },
  { key: 'to_improve', label: 'To Improve' },
  { key: 'stop_doing', label: 'Stop Doing' },
  { key: 'action_items', label: 'Action Items' }
];

const AVATAR_LABELS = {
  chris_happy: 'Chris 😊', chris_grumpy: 'Chris 😠',
  phani_happy: 'Phani 😊', phani_grumpy: 'Phani 😠',
  scott_happy: 'Scott 😊', scott_grumpy: 'Scott 😠',
};

const REACTION_EMOJI = {
  thumbs_up: '👍', thumbs_down: '👎', heart: '❤️',
};

function createExportRouter(db) {
  const router = express.Router();

  router.get('/boards/:id/export', requireBoardAccess(db), (req, res) => {
    const board = req.board;

    const cards = db.prepare('SELECT * FROM cards WHERE board_id = ?').all(board.id);

    // Attach reaction summaries and total counts to each card
    const cardsWithReactions = cards.map(card => {
      const reactionRows = db.prepare(
        'SELECT type, COUNT(*) as count FROM reactions WHERE card_id = ? GROUP BY type'
      ).all(card.id);
      const reactions = {};
      let totalReactions = 0;
      reactionRows.forEach(r => {
        reactions[r.type] = r.count;
        totalReactions += r.count;
      });
      return { ...card, reactions, totalReactions };
    });

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

      const colCards = cardsWithReactions
        .filter(c => c.column === col.key)
        .sort((a, b) => b.totalReactions - a.totalReactions);

      if (colCards.length === 0) {
        md += '\n_No items_\n';
        continue;
      }

      for (const card of colCards) {
        let line = `- ${card.text || ''}`;
        if (col.key === 'action_items' && card.assignee) {
          line += ` → **Assigned to: ${card.assignee}**`;
        }
        line += ` (${card.author})`;

        // Build reaction string
        const reactionParts = [];
        // Standard emoji reactions first
        for (const [type, emoji] of Object.entries(REACTION_EMOJI)) {
          if (card.reactions[type]) {
            reactionParts.push(`${emoji} ${card.reactions[type]}`);
          }
        }
        // Avatar reactions
        for (const [type, label] of Object.entries(AVATAR_LABELS)) {
          if (card.reactions[type]) {
            reactionParts.push(`[${label}] ${card.reactions[type]}`);
          }
        }
        if (reactionParts.length > 0) {
          line += ' ' + reactionParts.join(' ');
        }

        md += line + '\n';

        // GIF line
        if (card.gif_url) {
          md += `  ![GIF](${card.gif_url})\n`;
        }
        // Avatar line
        if (card.avatar) {
          const avatarLabel = AVATAR_LABELS[card.avatar] || card.avatar;
          md += `  [Avatar Name]\n`;
        }
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
