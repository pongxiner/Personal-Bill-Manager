/* ==================== 财务管理工作台 - 后端入口 ==================== */
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 静态文件（前端页面）
app.use(express.static(path.join(__dirname, '..')));

// API 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/budgets', require('./routes/budgets'));
app.use('/api/settings', require('./routes/settings'));

// SPA fallback — 前端路由处理
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: '接口不存在' });
  }
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[Server] 财务工作台后端已启动: http://localhost:${PORT}`);
  console.log(`[Server] API 文档:`);
  console.log(`  POST /api/auth/send-code    - 发送验证码`);
  console.log(`  POST /api/auth/register     - 注册`);
  console.log(`  POST /api/auth/login        - 登录`);
  console.log(`  GET  /api/auth/me           - 用户信息`);
  console.log(`  *    /api/transactions/*    - 交易 CRUD`);
  console.log(`  *    /api/accounts/*        - 账户 CRUD`);
  console.log(`  *    /api/categories/*      - 分类 CRUD`);
  console.log(`  *    /api/budgets/*         - 预算 CRUD`);
  console.log(`  *    /api/settings/*        - 设置`);
});
