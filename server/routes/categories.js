/* ==================== 分类路由 ==================== */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authRequired } = require('../middleware/auth');
const { getDB } = require('../db');

// 延迟代理：请求时才访问 DB（确保在 initDB() 之后）
const db = new Proxy({}, { get(_, prop) { return getDB()[prop]; } });

const router = express.Router();
router.use(authRequired);

function safeParseKeywords(raw) {
  try { return JSON.parse(raw || '[]'); } catch (e) { return []; }
}

router.get('/', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories WHERE user_id = ?').all(req.userId);
  const parsed = categories.map(c => {
    let keywords = [];
    try { keywords = JSON.parse(c.keywords || '[]'); } catch(e) { keywords = []; }
    return { ...c, keywords };
  });
  res.json({ categories: parsed });
});

router.post('/', (req, res) => {
  const c = req.body;
  if (!c.name || !c.type) return res.status(400).json({ error: '缺少必填字段' });
  const id = c.id || uuidv4();
  db.prepare(
    'INSERT OR REPLACE INTO categories (id, user_id, name, icon, color, type, keywords) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.userId, c.name, c.icon || '📦', c.color || '#8c8c8c', c.type, JSON.stringify(c.keywords || []));
  const created = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  res.json({ category: { ...created, keywords: safeParseKeywords(created.keywords) } });
});

router.put('/:id', (req, res) => {
  const c = req.body;
  const r = db.prepare(
    'UPDATE categories SET name=?, icon=?, color=?, type=?, keywords=? WHERE id=? AND user_id=?'
  ).run(c.name, c.icon || '📦', c.color || '#8c8c8c', c.type, JSON.stringify(c.keywords || []), req.params.id, req.userId);
  if (r.changes === 0) return res.status(404).json({ error: '分类不存在' });
  const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  res.json({ category: { ...updated, keywords: safeParseKeywords(updated.keywords) } });
});

router.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (r.changes === 0) return res.status(404).json({ error: '分类不存在' });
  res.json({ success: true });
});

// 恢复预设分类
router.post('/restore-defaults', (req, res) => {
  const now = new Date().toISOString();
  const defaults = [
    { id: 'cat_food', name: '餐饮', icon: '🍜', color: '#ff7875', type: 'expense' },
    { id: 'cat_transport', name: '交通', icon: '🚗', color: '#597ef7', type: 'expense' },
    { id: 'cat_shopping', name: '购物', icon: '🛍️', color: '#ffa940', type: 'expense' },
    { id: 'cat_living', name: '居住', icon: '🏠', color: '#9254de', type: 'expense' },
    { id: 'cat_entertainment', name: '娱乐', icon: '🎮', color: '#36cfc9', type: 'expense' },
    { id: 'cat_medical', name: '医疗', icon: '💊', color: '#ff85c0', type: 'expense' },
    { id: 'cat_education', name: '教育', icon: '📚', color: '#73d13d', type: 'expense' },
    { id: 'cat_communication', name: '通讯', icon: '📱', color: '#ffc53d', type: 'expense' },
    { id: 'cat_transfer', name: '转账', icon: '💸', color: '#bfbfbf', type: 'expense' },
    { id: 'cat_finance', name: '金融', icon: '💰', color: '#d48806', type: 'expense' },
    { id: 'cat_other_expense', name: '其他', icon: '📦', color: '#8c8c8c', type: 'expense' },
    { id: 'cat_salary', name: '工资', icon: '💵', color: '#52c41a', type: 'income' },
    { id: 'cat_bonus', name: '奖金', icon: '🏆', color: '#73d13d', type: 'income' },
    { id: 'cat_investment', name: '理财收益', icon: '📈', color: '#36cfc9', type: 'income' },
    { id: 'cat_reimburse', name: '报销退款', icon: '↩️', color: '#597ef7', type: 'income' },
    { id: 'cat_redpacket', name: '红包转账', icon: '🧧', color: '#ff4d4f', type: 'income' },
    { id: 'cat_other_income', name: '其他收入', icon: '✨', color: '#8c8c8c', type: 'income' }
  ];

  let restored = 0;
  const existStmt = db.prepare('SELECT id FROM categories WHERE id = ? AND user_id = ?');
  const insertStmt = db.prepare(
    'INSERT INTO categories (id, user_id, name, icon, color, type, keywords) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const updateStmt = db.prepare(
    'UPDATE categories SET name=?, icon=?, color=?, keywords=? WHERE id=? AND user_id=?'
  );

  for (const def of defaults) {
    const existing = existStmt.get(def.id, req.userId);
    if (existing) {
      updateStmt.run(def.name, def.icon, def.color, '[]', def.id, req.userId);
    } else {
      insertStmt.run(def.id, req.userId, def.name, def.icon, def.color, def.type, '[]');
    }
    restored++;
  }

  res.json({ success: true, restored });
});

module.exports = router;
