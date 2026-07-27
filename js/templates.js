/* ==================== 快捷模板记账模块 ==================== */

const Templates = (() => {
  const STORAGE_KEY = 'finance_templates_v2';

  // 预置模板（首次使用时会写入 localStorage，之后全部可编辑）
  const presetTemplates = [
    // 支出模板
    { id: 'tpl_breakfast', icon: '🥐', name: '早餐', amount: 15, category: 'cat_food', type: 'expense', account: '' },
    { id: 'tpl_lunch', icon: '🍱', name: '午餐', amount: 35, category: 'cat_food', type: 'expense', account: '' },
    { id: 'tpl_dinner', icon: '🍲', name: '晚餐', amount: 45, category: 'cat_food', type: 'expense', account: '' },
    { id: 'tpl_coffee', icon: '☕', name: '咖啡', amount: 18, category: 'cat_food', type: 'expense', account: '' },
    { id: 'tpl_transport', icon: '🚇', name: '交通', amount: 6, category: 'cat_transport', type: 'expense', account: '' },
    { id: 'tpl_snack', icon: '🍿', name: '零食', amount: 10, category: 'cat_food', type: 'expense', account: '' },
    { id: 'tpl_shopping', icon: '🛒', name: '购物', amount: 99, category: 'cat_shopping', type: 'expense', account: '' },
    { id: 'tpl_movie', icon: '🎬', name: '看电影', amount: 45, category: 'cat_entertainment', type: 'expense', account: '' },
    // 收入模板
    { id: 'tpl_salary', icon: '💵', name: '工资', amount: 8000, category: 'cat_salary', type: 'income', account: '' },
    { id: 'tpl_bonus', icon: '🎁', name: '奖金', amount: 1000, category: 'cat_bonus', type: 'income', account: '' },
    { id: 'tpl_investment', icon: '📈', name: '理财', amount: 200, category: 'cat_investment', type: 'income', account: '' },
    { id: 'tpl_reimburse', icon: '🧾', name: '报销', amount: 100, category: 'cat_reimburse', type: 'income', account: '' },
    { id: 'tpl_redpacket', icon: '🧧', name: '红包', amount: 200, category: 'cat_redpacket', type: 'income', account: '' }
  ];

  let userTemplates = [];
  let usageCounts = {};

  function load() {
    try {
      let saved = localStorage.getItem(STORAGE_KEY);
      // 兼容旧版本模板数据
      if (!saved) {
        const old = localStorage.getItem('finance_templates');
        if (old) {
          localStorage.setItem(STORAGE_KEY, old);
          saved = old;
        }
      }
      if (saved) {
        const data = JSON.parse(saved);
        userTemplates = data.templates || [];
        usageCounts = data.counts || {};
        // 如果缺少收入模板，自动补全预置收入模板
        const hasIncome = userTemplates.some(t => t.type === 'income');
        if (!hasIncome) {
          presetTemplates.filter(t => t.type === 'income').forEach(t => userTemplates.push({ ...t }));
          save();
        }
      } else {
        // 首次使用，把预置模板转为用户模板
        userTemplates = presetTemplates.map(t => ({ ...t }));
        usageCounts = {};
        save();
      }
    } catch (e) {
      userTemplates = presetTemplates.map(t => ({ ...t }));
      usageCounts = {};
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        templates: userTemplates,
        counts: usageCounts
      }));
    } catch (e) {}
  }

  /* ---------- 获取模板 ---------- */
  function getAll(type) {
    let list = userTemplates.slice();
    if (type) {
      list = list.filter(t => t.type === type);
    }
    // 按使用频率排序
    list.sort((a, b) => {
      const ca = usageCounts[a.category + '|' + a.type + '|' + Math.round(a.amount)] || 0;
      const cb = usageCounts[b.category + '|' + b.type + '|' + Math.round(b.amount)] || 0;
      return cb - ca;
    });
    return list;
  }

  function getById(id) {
    return userTemplates.find(t => t.id === id);
  }

  /* ---------- 记录一次模板使用 ---------- */
  function recordUsage(category, type, amount) {
    const key = category + '|' + type + '|' + Math.round(amount);
    usageCounts[key] = (usageCounts[key] || 0) + 1;
    save();
  }

  /* ---------- 添加自定义模板 ---------- */
  function addTemplate(tpl) {
    const id = 'tpl_user_' + Date.now();
    const item = { ...tpl, id };
    userTemplates.push(item);
    save();
    return id;
  }

  /* ---------- 更新模板 ---------- */
  function updateTemplate(id, changes) {
    const idx = userTemplates.findIndex(t => t.id === id);
    if (idx === -1) return false;
    userTemplates[idx] = { ...userTemplates[idx], ...changes };
    save();
    return true;
  }

  /* ---------- 删除模板 ---------- */
  function deleteTemplate(id) {
    const idx = userTemplates.findIndex(t => t.id === id);
    if (idx === -1) return false;
    userTemplates.splice(idx, 1);
    save();
    return true;
  }

  /* ---------- 从最近交易生成模板 ---------- */
  function learnFromRecent(transactions) {
    const patterns = {};

    transactions.forEach(t => {
      if (t.type !== 'expense' && t.type !== 'income') return;
      const key = t.category + '|' + t.type + '|' + Math.round(t.amount);
      if (!patterns[key]) {
        patterns[key] = { count: 0, category: t.category, type: t.type, amount: t.amount, note: t.note, account: t.account || '' };
      }
      patterns[key].count++;
    });

    // 出现3次以上的模式加入用户模板
    Object.entries(patterns)
      .filter(([, v]) => v.count >= 3)
      .forEach(([key, v]) => {
        const dup = userTemplates.find(t => t.category === v.category && Math.abs(t.amount - v.amount) < 1 && t.type === v.type);
        if (!dup) {
          userTemplates.push({
            id: 'tpl_learned_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
            icon: Categories.getIcon(v.category) || '💰',
            name: Categories.getName(v.category) || v.note || '常用',
            amount: Math.round(v.amount),
            category: v.category,
            type: v.type,
            account: v.account || ''
          });
        }
      });

    save();
  }

  load();
  return { getAll, getById, recordUsage, addTemplate, updateTemplate, deleteTemplate, learnFromRecent };
})();
