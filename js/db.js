/* ==================== IndexedDB 数据存储层 ==================== */

const DB = (() => {
  const DB_NAME = 'finance_workbench';
  const DB_VERSION = 1;
  let db = null;

  function init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('transactions')) {
          const s = d.createObjectStore('transactions', { keyPath: 'id' });
          s.createIndex('date', 'date');
          s.createIndex('type', 'type');
          s.createIndex('category', 'category');
          s.createIndex('account', 'account');
        }
        if (!d.objectStoreNames.contains('accounts')) {
          d.createObjectStore('accounts', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('categories')) {
          d.createObjectStore('categories', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('budgets')) {
          d.createObjectStore('budgets', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('settings')) {
          d.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  function tx(store, mode = 'readonly') {
    return db.transaction(store, mode).objectStore(store);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- 通用 CRUD ---------- */
  function getAll(store) {
    return new Promise((resolve, reject) => {
      const r = tx(store).getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  function put(store, data) {
    return new Promise((resolve, reject) => {
      const r = tx(store, 'readwrite').put(data);
      r.onsuccess = () => resolve(data);
      r.onerror = () => reject(r.error);
    });
  }

  function del(store, id) {
    return new Promise((resolve, reject) => {
      const r = tx(store, 'readwrite').delete(id);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  }

  function clear(store) {
    return new Promise((resolve, reject) => {
      const r = tx(store, 'readwrite').clear();
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  }

  /* ---------- 交易 ---------- */
  async function addTransaction(t) {
    if (!t.id) t.id = uid();
    if (!t.createdAt) t.createdAt = new Date().toISOString();
    return put('transactions', t);
  }

  async function updateTransaction(t) {
    return put('transactions', t);
  }

  async function deleteTransaction(id) {
    return del('transactions', id);
  }

  async function getAllTransactions() {
    return getAll('transactions');
  }

  async function getTransactionsByMonth(year, month) {
    const all = await getAllTransactions();
    return all.filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === year && d.getMonth() === month;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async function getTransactionsByDateRange(start, end) {
    const all = await getAllTransactions();
    return all.filter(t => {
      const d = new Date(t.date);
      return d >= start && d <= end;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async function getRecentTransactions(n) {
    const all = await getAllTransactions();
    return all.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, n);
  }

  /* ---------- 账户 ---------- */
  async function getAccounts() {
    return getAll('accounts');
  }

  async function addAccount(a) {
    if (!a.id) a.id = uid();
    if (!a.createdAt) a.createdAt = new Date().toISOString();
    return put('accounts', a);
  }

  async function updateAccount(a) {
    return put('accounts', a);
  }

  async function deleteAccount(id) {
    return del('accounts', id);
  }

  async function getAccountById(id) {
    const all = await getAccounts();
    return all.find(a => a.id === id);
  }

  /* ---------- 分类 ---------- */
  async function getCategories() {
    return getAll('categories');
  }

  async function saveCategory(c) {
    if (!c.id) c.id = uid();
    return put('categories', c);
  }

  async function deleteCategory(id) {
    return del('categories', id);
  }

  /* ---------- 预算 ---------- */
  async function getBudgets() {
    return getAll('budgets');
  }

  async function saveBudget(b) {
    if (!b.id) b.id = 'budget_' + b.month + '_' + (b.category || 'total');
    return put('budgets', b);
  }

  async function getBudgetByMonth(month) {
    const all = await getBudgets();
    return all.filter(b => b.month === month);
  }

  /* ---------- 设置 ---------- */
  async function getSetting(key) {
    return new Promise((resolve, reject) => {
      const r = tx('settings').get(key);
      r.onsuccess = () => resolve(r.result ? r.result.value : null);
      r.onerror = () => reject(r.error);
    });
  }

  async function setSetting(key, value) {
    return put('settings', { key, value });
  }

  /* ---------- 批量操作 ---------- */
  async function bulkAddTransactions(list) {
    return new Promise((resolve, reject) => {
      const store = tx('transactions', 'readwrite');
      let count = 0;
      list.forEach(t => {
        if (!t.id) t.id = uid();
        if (!t.createdAt) t.createdAt = new Date().toISOString();
        const r = store.put(t);
        r.onsuccess = () => { count++; };
      });
      const transaction = store.transaction;
      transaction.oncomplete = () => resolve(count);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function clearAll() {
    await Promise.all([
      clear('transactions'),
      clear('accounts'),
      clear('budgets')
    ]);
  }

  /* ---------- 数据备份还原 ---------- */
  async function bulkRestore(data) {
    // 清空现有数据
    await Promise.all([
      clear('transactions'),
      clear('accounts'),
      clear('categories'),
      clear('budgets')
    ]);
    // 恢复交易
    if (data.transactions && data.transactions.length > 0) {
      await bulkAddTransactions(data.transactions);
    }
    // 恢复账户
    if (data.accounts && data.accounts.length > 0) {
      for (const a of data.accounts) {
        await addAccount(a);
      }
    }
  }

  return {
    init,
    uid,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    getAllTransactions,
    getTransactionsByMonth,
    getTransactionsByDateRange,
    getRecentTransactions,
    getAccounts,
    addAccount,
    updateAccount,
    deleteAccount,
    getAccountById,
    getCategories,
    saveCategory,
    deleteCategory,
    getBudgets,
    saveBudget,
    getBudgetByMonth,
    getSetting,
    setSetting,
    bulkAddTransactions,
    bulkRestore,
    clearAll
  };
})();
