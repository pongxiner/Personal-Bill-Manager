/* ==================== 账户路由 ==================== */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authRequired } = require('../middleware/auth');
const { getDB } = require('../db');

// 延迟代理：请求时才访问 DB（确保在 initDB() 之后）
const db = new Proxy({}, { get(_, prop) { return getDB()[prop]; } });

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ?').all(req.userId);
  res.json({ accounts });
});

router.post('/', (req, res) => {
  const a = req.body;
  if (!a.name || !a.type) return res.status(400).json({ error: '缺少必填字段' });
  const id = a.id || uuidv4();
  db.prepare(
    'INSERT INTO accounts (id, user_id, name, type, currency, balance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.userId, a.name, a.type, a.currency || '¥', a.balance || 0, a.createdAt || new Date().toISOString());
  const created = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  res.json({ account: created });
});

router.put('/:id', (req, res) => {
  const a = req.body;
  const r = db.prepare(
    'UPDATE accounts SET name=?, type=?, currency=?, balance=? WHERE id=? AND user_id=?'
  ).run(a.name, a.type, a.currency || '¥', a.balance || 0, req.params.id, req.userId);
  if (r.changes === 0) return res.status(404).json({ error: '账户不存在' });
  const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  res.json({ account: updated });
});

router.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (r.changes === 0) return res.status(404).json({ error: '账户不存在' });
  res.json({ success: true });
});

module.exports = router;
