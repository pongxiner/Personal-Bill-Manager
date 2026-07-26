/* ==================== 用户认��路由 ==================== */
const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { signToken, authRequired } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

// ============ 发送验证码 ============
// 开发模式下验证码固定为 888888，并在响应中返回供调试
router.post('/send-code', (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ error: '请输入正确的手机号' });
  }

  const code = '888888'; // 开发模式下固定验证码
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // 清理旧验证码
  db.prepare('UPDATE verify_codes SET used = 1 WHERE phone = ? AND used = 0').run(phone);

  // 保存验证码
  db.prepare(
    'INSERT INTO verify_codes (phone, code, expires_at) VALUES (?, ?, ?)'
  ).run(phone, code, expiresAt);

  console.log(`[SMS] 验证码已发送到 ${phone}: ${code}`);
  res.json({ success: true, message: '验证码已发送' });
});

// ============ 用户注册 ============
router.post('/register', (req, res) => {
  const { phone, password, code, nickname } = req.body;

  if (!phone || !password || !code) {
    return res.status(400).json({ error: '请填写完整信息' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少6位' });
  }

  // 验证验证码
  const record = db.prepare(
    'SELECT * FROM verify_codes WHERE phone = ? AND code = ? AND used = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1'
  ).get(phone, code, new Date().toISOString());

  if (!record) {
    return res.status(400).json({ error: '验证码错误或已过期' });
  }

  // 标记验证码已使用
  db.prepare('UPDATE verify_codes SET used = 1 WHERE id = ?').run(record.id);

  // 检查手机号是否已注册
  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (existing) {
    return res.status(400).json({ error: '该手机号已注册，请直接登录' });
  }

  const now = new Date().toISOString();
  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO users (id, phone, password_hash, nickname, trial_start, trial_days, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, phone, passwordHash, nickname || '', now, 30, now);

  // 创建默认分类
  createDefaultCategories(id);

  // 创建默认账户
  createDefaultAccounts(id);

  const token = signToken({ id, phone });
  const user = db.prepare('SELECT id, phone, nickname, trial_start, trial_days, paid, paid_until FROM users WHERE id = ?').get(id);

  res.json({ token, user, message: '注册成功' });
});

// ============ 用户登录 ============
router.post('/login', (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: '请输入手机号和密码' });
  }

  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) {
    return res.status(400).json({ error: '手机号未注册' });
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(400).json({ error: '密码错误' });
  }

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      trial_start: user.trial_start,
      trial_days: user.trial_days,
      paid: user.paid,
      paid_until: user.paid_until
    }
  });
});

// ============ 获取当前用户信息（含试用期状态） ============
router.get('/me', authRequired, (req, res) => {
  const user = db.prepare(
    'SELECT id, phone, nickname, trial_start, trial_days, paid, paid_until, created_at FROM users WHERE id = ?'
  ).get(req.userId);

  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  // 计算试用期状态
  const trialStart = new Date(user.trial_start);
  const trialEnd = new Date(trialStart);
  trialEnd.setDate(trialEnd.getDate() + user.trial_days);
  const now = new Date();
  user.trial_end = trialEnd.toISOString();
  user.trial_expired = user.paid ? false : (now > trialEnd);
  user.trial_remaining_days = user.paid ? -1 : Math.max(0, Math.ceil((trialEnd - now) / 86400000));

  res.json({ user });
});

// ============ 默认分类 ============
function createDefaultCategories(userId) {
  const now = new Date().toISOString();
  const defaults = [
    { id: 'cat_food', name: '餐饮', icon: '🍜', color: '#ff7875', type: 'expense', keywords: JSON.stringify(['餐', '饭', '食', '外卖', '美团', '饿了么', '麦当劳', '肯德基', '星巴克', '咖啡', '奶茶', '火锅', '烧烤', '面', '粉', '饺子', '早餐', '午餐', '晚餐', '小吃', '零食', '饮料']) },
    { id: 'cat_transport', name: '交通', icon: '🚗', color: '#597ef7', type: 'expense', keywords: JSON.stringify(['滴滴', '出租', '地铁', '公交', '高铁', '火车', '机票', '加油', '停车', '过路', '单车', '出行']) },
    { id: 'cat_shopping', name: '购物', icon: '🛍️', color: '#ffa940', type: 'expense', keywords: JSON.stringify(['淘宝', '京东', '拼多多', '天猫', '购物', '衣服', '鞋', '包', '数码', '电器', '家具', '日用品']) },
    { id: 'cat_living', name: '居住', icon: '🏠', color: '#9254de', type: 'expense', keywords: JSON.stringify(['房租', '租金', '水电', '物业', '燃气', '宽带', '网费', '暖气', '维修']) },
    { id: 'cat_entertainment', name: '娱乐', icon: '🎮', color: '#36cfc9', type: 'expense', keywords: JSON.stringify(['电影', 'KTV', '游戏', '娱乐', '演出', '门票', '旅游', '酒店', '民宿', '景点', '密室', '剧本杀', '直播']) },
    { id: 'cat_medical', name: '医疗', icon: '💊', color: '#ff85c0', type: 'expense', keywords: JSON.stringify(['医院', '药', '诊所', '体检', '挂号', '牙科', '眼科', '保健']) },
    { id: 'cat_education', name: '教育', icon: '📚', color: '#73d13d', type: 'expense', keywords: JSON.stringify(['书', '书店', '培训', '学费', '课程', '网课', '考试', '学习']) },
    { id: 'cat_communication', name: '通讯', icon: '📱', color: '#ffc53d', type: 'expense', keywords: JSON.stringify(['话费', '流量', '充值', '通讯']) },
    { id: 'cat_transfer', name: '转账', icon: '💸', color: '#bfbfbf', type: 'expense', keywords: JSON.stringify(['转账', '红包', '代付', 'AA']) },
    { id: 'cat_finance', name: '金融', icon: '💰', color: '#d48806', type: 'expense', keywords: JSON.stringify(['理财', '基金', '股票', '保险', '贷款', '还款', '信用卡', '利息', '手续费']) },
    { id: 'cat_other_expense', name: '其他', icon: '📦', color: '#8c8c8c', type: 'expense', keywords: JSON.stringify([]) },
    { id: 'cat_salary', name: '工资', icon: '💵', color: '#52c41a', type: 'income', keywords: JSON.stringify(['工资', '薪资', '薪水']) },
    { id: 'cat_bonus', name: '奖金', icon: '🎁', color: '#73d13d', type: 'income', keywords: JSON.stringify(['奖金', '年终', '绩效', '提成']) },
    { id: 'cat_investment', name: '理财收益', icon: '📈', color: '#36cfc9', type: 'income', keywords: JSON.stringify(['利息', '分红', '收益', '赎回']) },
    { id: 'cat_reimburse', name: '报销', icon: '🧾', color: '#597ef7', type: 'income', keywords: JSON.stringify(['报销', '退款', '退']) },
    { id: 'cat_redpacket', name: '红包', icon: '🧧', color: '#ff4d4f', type: 'income', keywords: JSON.stringify(['红包']) },
    { id: 'cat_other_income', name: '其他', icon: '📋', color: '#8c8c8c', type: 'income', keywords: JSON.stringify([]) }
  ];

  const stmt = db.prepare(
    'INSERT INTO categories (id, user_id, name, icon, color, type, keywords) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  for (const c of defaults) {
    stmt.run(c.id, userId, c.name, c.icon, c.color, c.type, c.keywords);
  }
}

// ============ 默认账户 ============
function createDefaultAccounts(userId) {
  const now = new Date().toISOString();
  const defaults = [
    { id: 'cash', name: '现金', type: 'cash', balance: 2000 },
    { id: 'bank', name: '银行卡', type: 'bank', balance: 20000 },
    { id: 'wechat', name: '微信零钱', type: 'wechat', balance: 1500 },
    { id: 'alipay', name: '支付宝', type: 'alipay', balance: 1000 },
    { id: 'credit', name: '信用卡', type: 'credit', balance: -3000 }
  ];
  const stmt = db.prepare(
    'INSERT INTO accounts (id, user_id, name, type, currency, balance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  for (const a of defaults) {
    stmt.run(a.id, userId, a.name, a.type, '¥', a.balance, now);
  }
}

module.exports = router;
