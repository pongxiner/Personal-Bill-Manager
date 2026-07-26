/* ==================== 预算路由 ==================== */
const express = require('express');
const { authRequired } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ?').all(req.userId);
  res.json({ budgets });
});

router.get('/month/:month', (req, res) => {
  const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ? AND month = ?').all(req.userId, req.params.month);
  res.json({ budgets });
});

router.post('/', (req, res) => {
  const b = req.body;
  if (!b.month || !b.amount) return res.status(400).json({ error: '缺少必填字段' });
  const id = b.id || ('budget_' + b.month + '_' + (b.category || 'total'));

  const existing = db.prepare('SELECT id FROM budgets WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (existing) {
    db.prepare('UPDATE budgets SET amount = ? WHERE id = ? AND user_id = ?').run(b.amount, id, req.userId);
  } else {
    db.prepare(
      'INSERT INTO budgets (id, user_id, month, category, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, req.userId, b.month, b.category || 'total', b.amount, b.createdAt || new Date().toISOString());
  }

  const created = db.prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?').get(id, req.userId);
  res.json({ budget: created });
});

module.exports = router;
