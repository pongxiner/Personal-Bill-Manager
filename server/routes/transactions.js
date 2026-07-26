/* ==================== 交易路由 ==================== */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authRequired } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

// 所有路由都需要登录
router.use(authRequired);

// 获取全部交易
router.get('/', (req, res) => {
  const tx = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC').all(req.userId);
  res.json({ transactions: tx });
});

// 按月份获取
router.get('/month/:year/:month', (req, res) => {
  const year = parseInt(req.params.year);
  const month = parseInt(req.params.month);
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const end = new Date(year, month + 1, 0).toISOString().slice(0, 10);

  const tx = db.prepare(
    'SELECT * FROM transactions WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date DESC'
  ).all(req.userId, start, end);
  res.json({ transactions: tx });
});

// 按日期范围获取
router.get('/range', (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: '请指定日期范围' });
  }
  const tx = db.prepare(
    'SELECT * FROM transactions WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date DESC'
  ).all(req.userId, start, end);
  res.json({ transactions: tx });
});

// 获取最近 N 条
router.get('/recent/:n', (req, res) => {
  const n = parseInt(req.params.n) || 10;
  const tx = db.prepare(
    'SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC LIMIT ?'
  ).all(req.userId, n);
  res.json({ transactions: tx });
});

// 添加交易
router.post('/', (req, res) => {
  const t = req.body;
  if (!t.type || !t.category || !t.amount || !t.date) {
    return res.status(400).json({ error: '缺少必填字段' });
  }

  const id = t.id || uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO transactions (id, user_id, type, category, amount, account, to_account, date, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.userId, t.type, t.category, t.amount,
    t.account || null, t.to_account || null, t.date, t.note || '', t.createdAt || now
  );

  const created = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  res.json({ transaction: created });
});

// 更新交易
router.put('/:id', (req, res) => {
  const t = req.body;
  const existing = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) {
    return res.status(404).json({ error: '记录不存在' });
  }

  db.prepare(`
    UPDATE transactions SET type=?, category=?, amount=?, account=?, to_account=?, date=?, note=?
    WHERE id=? AND user_id=?
  `).run(
    t.type, t.category, t.amount, t.account || null,
    t.to_account || null, t.date, t.note || '', req.params.id, req.userId
  );

  const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  res.json({ transaction: updated });
});

// 删除交易
router.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (r.changes === 0) {
    return res.status(404).json({ error: '记录不存在' });
  }
  res.json({ success: true });
});

// 批量导入
router.post('/bulk', (req, res) => {
  const { transactions } = req.body;
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.status(400).json({ error: '请提供交易列表' });
  }

  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO transactions (id, user_id, type, category, amount, account, to_account, date, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((txList) => {
    let count = 0;
    for (const t of txList) {
      stmt.run(
        t.id || uuidv4(), req.userId, t.type, t.category, t.amount,
        t.account || null, t.to_account || null, t.date, t.note || '', t.createdAt || now
      );
      count++;
    }
    return count;
  });

  const count = insertMany(transactions);
  res.json({ success: true, count });
});

module.exports = router;
