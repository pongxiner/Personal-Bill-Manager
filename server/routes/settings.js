/* ==================== 设置路由 ==================== */
const express = require('express');
const { authRequired } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();
router.use(authRequired);

router.get('/:key', (req, res) => {
  const setting = db.prepare('SELECT * FROM settings WHERE key = ? AND user_id = ?').get(req.params.key, req.userId);
  res.json({ value: setting ? setting.value : null });
});

router.put('/:key', (req, res) => {
  const { value } = req.body;
  const existing = db.prepare('SELECT key FROM settings WHERE key = ? AND user_id = ?').get(req.params.key, req.userId);
  if (existing) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ? AND user_id = ?').run(String(value), req.params.key, req.userId);
  } else {
    db.prepare('INSERT INTO settings (key, user_id, value) VALUES (?, ?, ?)').run(req.params.key, req.userId, String(value));
  }
  res.json({ success: true });
});

module.exports = router;
