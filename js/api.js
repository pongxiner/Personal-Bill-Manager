/* ==================== API 数据层（替代 IndexedDB） ==================== */
/* 接口与 db.js 完全兼容，所有调用方无需改动 */

const API_BASE = '/api';

// ============ 工具函数 ============
function getToken() {
  return localStorage.getItem('finance_token');
}

async function request(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(API_BASE + url, opts);
  // 处理未登录
  if (res.status === 401) {
    localStorage.removeItem('finance_token');
    if (window.Auth && typeof window.Auth.onUnauthorized === 'function') {
      window.Auth.onUnauthorized();
    }
    throw new Error('登录已过期');
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '请求失败');
  }
  return data;
}

function get(url) { return request('GET', url); }
function post(url, body) { return request('POST', url, body); }
function put(url, body) { return request('PUT', url, body); }
function del(url) { return request('DELETE', url); }

// ============ DB 兼容接口 ============
const DB = (() => {
  let cache_accounts = null;
  let cache_categories = null;

  async function init() {
    // 无需初始化，API 模式下不依赖本地数据库
    // 但要确保用户已登录
    const token = getToken();
    if (!token) {
      throw new Error('NOT_LOGGED_IN');
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- 交易 ---------- */
  async function addTransaction(t) {
    if (!t.id) t.id = uid();
    if (!t.createdAt) t.createdAt = new Date().toISOString();
    const res = await post('/transactions', t);
    return res.transaction;
  }

  async function updateTransaction(t) {
    const res = await put('/transactions/' + t.id, t);
    return res.transaction;
  }

  async function deleteTransaction(id) {
    return del('/transactions/' + id);
  }

  async function getAllTransactions() {
    const res = await get('/transactions');
    return res.transactions;
  }

  async function getTransactionsByMonth(year, month) {
    const res = await get('/transactions/month/' + year + '/' + month);
    return res.transactions;
  }

  async function getTransactionsByDateRange(start, end) {
    const res = await get('/transactions/range?start=' + fmtDate(start) + '&end=' + fmtDate(end));
    return res.transactions;
  }

  async function getRecentTransactions(n) {
    const res = await get('/transactions/recent/' + (n || 10));
    return res.transactions;
  }

  /* ---------- 账户 ---------- */
  async function getAccounts() {
    const res = await get('/accounts');
    return res.accounts;
  }

  async function addAccount(a) {
    if (!a.id) a.id = uid();
    if (!a.createdAt) a.createdAt = new Date().toISOString();
    const res = await post('/accounts', a);
    return res.account;
  }

  async function updateAccount(a) {
    const res = await put('/accounts/' + a.id, a);
    return res.account;
  }

  async function deleteAccount(id) {
    return del('/accounts/' + id);
  }

  async function getAccountById(id) {
    const accounts = await getAccounts();
    return accounts.find(a => a.id === id);
  }

  /* ---------- 分类 ---------- */
  async function getCategories() {
    const res = await get('/categories');
    return res.categories;
  }

  async function saveCategory(c) {
    // 判断是新增还是更新
    const cats = await getCategories();
    const existing = cats.find(x => x.id === c.id);
    if (existing) {
      const res = await put('/categories/' + c.id, c);
      return res.category;
    } else {
      const res = await post('/categories', c);
      return res.category;
    }
  }

  async function deleteCategory(id) {
    return del('/categories/' + id);
  }

  /* ---------- 预算 ---------- */
  async function getBudgets() {
    const res = await get('/budgets');
    return res.budgets;
  }

  async function saveBudget(b) {
    if (!b.id) b.id = 'budget_' + b.month + '_' + (b.category || 'total');
    const res = await post('/budgets', b);
    return res.budget;
  }

  async function getBudgetByMonth(month) {
    const res = await get('/budgets/month/' + month);
    return res.budgets;
  }

  /* ---------- 设置 ---------- */
  async function getSetting(key) {
    const res = await get('/settings/' + key);
    return res.value;
  }

  async function setSetting(key, value) {
    return put('/settings/' + key, { value });
  }

  /* ---------- 批量操作 ---------- */
  async function bulkAddTransactions(list) {
    const res = await post('/transactions/bulk', { transactions: list });
    return res.count;
  }

  async function clearAll() {
    // 服务端：需要调用所有清空接口
    // 简化处理：逐个删除各类型的全部数据
    const tx = await getAllTransactions();
    for (const t of tx) { await deleteTransaction(t.id); }
    const accts = await getAccounts();
    for (const a of accts) { if (!['cash','bank','wechat','alipay','credit'].includes(a.id)) await deleteAccount(a.id); }
  }

  async function bulkRestore(data) {
    if (data.transactions && data.transactions.length > 0) {
      await bulkAddTransactions(data.transactions);
    }
    if (data.accounts && data.accounts.length > 0) {
      for (const a of data.accounts) {
        await addAccount(a);
      }
    }
  }

  /* ---------- 恢复默认分类 ---------- */
  async function restoreDefaultCategories() {
    return post('/categories/restore-defaults');
  }

  function fmtDate(d) {
    if (typeof d === 'string') return d.slice(0, 10);
    return d.toISOString().slice(0, 10);
  }

  return {
    init, uid,
    addTransaction, updateTransaction, deleteTransaction,
    getAllTransactions, getTransactionsByMonth, getTransactionsByDateRange, getRecentTransactions,
    getAccounts, addAccount, updateAccount, deleteAccount, getAccountById,
    getCategories, saveCategory, deleteCategory,
    getBudgets, saveBudget, getBudgetByMonth,
    getSetting, setSetting,
    bulkAddTransactions, bulkRestore, clearAll,
    restoreDefaultCategories
  };
})();
