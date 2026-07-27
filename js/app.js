/* ==================== 主应用控制器 ==================== */

const App = (() => {
  // 状态
  let currentPage = 'home';
  let homeMonth = new Date();
  let recordsMonth = new Date();
  let statsPeriod = 'month';   // week | month | year
  let statsType = 'expense';   // expense | income
  let statsAnchor = new Date(); // 当前选中的周期锚点
  let selectedTab = 'expense';
  let selectedCategory = null;
  let importPlatform = 'wechat';
  let importData = [];
  let filterType = 'all';
  let filterCategory = 'all';
  let filterSearch = '';
  let editingTransactionId = null;
  let recordsDateFilter = null; // 图表点击跳转时设置的日期筛选
  let templatesEditMode = false;
  let catMgmtType = 'expense';
  let detailDate = null;    // 图表点击对应的日期
  let detailCategory = null; // 排行点击对应的分类
  let pickerYear = new Date().getFullYear();
  let pickerMonth = new Date().getMonth();

  /* ---------- 初始化 ---------- */
  async function init() {
    console.log('[App] init() 开始, 模式:', APP_MODE);
    try {
      // 本地模式：跳过登录，直接用 IndexedDB
      if (APP_MODE === 'local') {
        document.getElementById('page-auth').style.display = 'none';
        document.getElementById('app').style.removeProperty('display');
        document.getElementById('bottom-nav').style.removeProperty('display');
        var logoutBtn = document.getElementById('menu-logout');
        if (logoutBtn) logoutBtn.style.display = 'none';
        await startApp();
        return;
      }

      // 服务器模式：需要登录认证
      console.log('[App] 调用 Auth.initAuth()...');
      const loggedIn = await Auth.initAuth();
      console.log('[App] Auth.initAuth() 返回:', loggedIn);
      if (!loggedIn) {
        console.log('[App] 未登录，等待用户操作');
        return; // 停在这里，等待用户登录
      }

    // 登录成功，检查试用期
    if (Auth.isTrialExpired()) {
      showPaymentModal();
      return;
    }

    // 初始化业务
    await startApp();
    } catch (err) {
      console.error('[App] init() 出错:', err);
      toast('初始化失败: ' + err.message);
    }
  }

  async function startApp() {
    // 初始化数据层
    await DB.init();
    await Categories.init();
    const accounts = await DB.getAccounts();
    if (accounts.length === 0) {
      await initDefaultAccounts();
    }
    setDates();
    bindEvents();
    initVoice();
    initNumpad();
    switchPage('home');
    learnTemplates();
    if (APP_MODE === 'server') updateTrialBanner();
  }

  async function learnTemplates() {
    const tx = await DB.getAllTransactions();
    if (tx.length > 0) {
      Templates.learnFromRecent(tx);
    }
  }

  async function initDefaultAccounts() {
    const accounts = await DB.getAccounts();
    if (accounts.length === 0) {
      const defaults = [
        { name: '现金', type: 'cash', currency: '¥', balance: 2000 },
        { name: '银行卡', type: 'bank', currency: '¥', balance: 20000 },
        { name: '微信零钱', type: 'wechat', currency: '¥', balance: 1500 },
        { name: '支付宝', type: 'alipay', currency: '¥', balance: 1000 },
        { name: '信用卡', type: 'credit', currency: '¥', balance: -3000 }
      ];
      for (const a of defaults) {
        await DB.addAccount(a);
      }
    }
  }

  function setDates() {
    const now = new Date();
    homeMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    recordsMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    statsAnchor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    updateMonthLabels();
  }

  function updateMonthLabels() {
    const fmt = d => d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
    document.getElementById('home-month-label').textContent = fmt(homeMonth);
    const recEl = document.getElementById('records-month-label');
    if (recEl) {
      const txt = recEl.querySelector('#records-month-text');
      if (txt) txt.textContent = fmt(recordsMonth);
      else recEl.textContent = fmt(recordsMonth);
    }
  }

  /* ---------- 事件绑定 ---------- */
  // 安全绑定：元素不存在时跳过，不崩溃
  function on(id, evt, handler) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (el) el.addEventListener(evt, handler);
    else console.warn('[bindEvents] 元素不存在:', id);
  }

  function bindEvents() {
    // 底部导航
    document.querySelectorAll('#bottom-nav .nav-btn').forEach(btn => {
      btn.addEventListener('click', () => switchPage(btn.dataset.page));
    });
    on('fab-add', 'click', openAddModal);

    // 首页
    on('home-prev-month', 'click', () => { homeMonth.setMonth(homeMonth.getMonth() - 1); refreshHome(); });
    on('home-next-month', 'click', () => { homeMonth.setMonth(homeMonth.getMonth() + 1); refreshHome(); });
    on('quick-import', 'click', () => openImportModal());
    on('quick-advice', 'click', () => openAdviceModal());
    on('quick-accounts', 'click', () => openAccountModal());

    // 账单
    on('records-prev-month', 'click', () => { recordsMonth.setMonth(recordsMonth.getMonth() - 1); recordsDateFilter = null; refreshRecords(); });
    on('records-next-month', 'click', () => { recordsMonth.setMonth(recordsMonth.getMonth() + 1); recordsDateFilter = null; refreshRecords(); });
    on('records-filter', 'click', toggleFilter);
    on('records-month-label', 'click', openMonthPicker);
    on('month-picker-close', 'click', closeMonthPicker);
    on('picker-prev-year', 'click', () => { pickerYear--; renderMonthPicker(); });
    on('picker-next-year', 'click', () => { pickerYear++; renderMonthPicker(); });
    on('picker-go-current', 'click', () => {
      const now = new Date();
      pickerYear = now.getFullYear();
      pickerMonth = now.getMonth();
      applyMonthPicker();
    });
    document.querySelectorAll('#month-grid .month-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        pickerMonth = parseInt(cell.dataset.m, 10);
        applyMonthPicker();
      });
    });
    // 筛选chips
    document.querySelectorAll('#filter-type .chip').forEach(c => {
      c.addEventListener('click', () => {
        filterType = c.dataset.val;
        document.querySelectorAll('#filter-type .chip').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        refreshRecords();
      });
    });
    on('filter-search', 'input', (e) => {
      filterSearch = e.target.value;
      refreshRecords();
    });
    on('records-search', 'input', (e) => {
      filterSearch = e.target.value;
      const clearBtn = document.getElementById('records-search-clear');
      if (clearBtn) clearBtn.style.display = e.target.value ? 'flex' : 'none';
      refreshRecords();
    });
    on('records-search-clear', 'click', () => {
      const input = document.getElementById('records-search');
      if (input) input.value = '';
      filterSearch = '';
      const clearBtn = document.getElementById('records-search-clear');
      if (clearBtn) clearBtn.style.display = 'none';
      refreshRecords();
    });

    // 统计：支出/收入切换
    document.querySelectorAll('#stats-type-toggle .stats-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        statsType = btn.dataset.type;
        document.querySelectorAll('#stats-type-toggle .stats-type-btn').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        refreshStats();
      });
    });

    // 统计：周/月/年切换
    document.querySelectorAll('#period-tabs .period-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        statsPeriod = tab.dataset.period;
        document.querySelectorAll('#period-tabs .period-tab').forEach(x => x.classList.remove('active'));
        tab.classList.add('active');
        statsAnchor = new Date();
        refreshStats();
      });
    });

    // 统计：周期前后导航
    on('period-prev', 'click', () => shiftPeriod(-1));
    on('period-next', 'click', () => shiftPeriod(1));

    // 我的
    on('menu-accounts', 'click', openAccountModal);
    on('menu-advice', 'click', openAdviceModal);
    on('menu-import', 'click', openImportModal);
    on('menu-budget', 'click', openBudgetModal);
    on('menu-categories', 'click', openCategoryModal);
    on('menu-export', 'click', exportData);
    on('menu-restore', 'click', openRestoreModal);
    on('menu-clear', 'click', clearAllData);

    // 备份还原
    on('restore-close', 'click', closeRestoreModal);
    on('restore-file-input', 'change', handleRestoreFile);

    // 交易明细弹窗
    on('detail-close', 'click', closeDetailModal);

    // 记一笔
    on('add-close', 'click', closeAddModal);
    on('add-save', 'click', saveTransaction);
    on('add-delete', 'click', deleteCurrentTransaction);
    on('add-amount-display', 'click', openAmountModal);

    // 金额输入弹窗
    on('amount-close', 'click', closeAmountModal);
    on('amount-confirm', 'click', confirmAmountModal);
    on('modal-amount', 'click', (e) => { if (e.target.id === 'modal-amount') closeAmountModal(); });
    document.querySelectorAll('#add-type-tabs .type-tab').forEach(t => {
      t.addEventListener('click', () => {
        selectedTab = t.dataset.type;
        document.querySelectorAll('#add-type-tabs .type-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        updateAddMode();
      });
    });
    // 语音按钮
    on('voice-btn', 'click', toggleVoiceInput);

    // 导入
    on('import-close', 'click', closeImportModal);
    on('import-confirm', 'click', confirmImport);
    document.querySelectorAll('.platform-tab').forEach(t => {
      const switchPlatform = () => {
        importPlatform = t.dataset.platform;
        document.querySelectorAll('.platform-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const w = document.getElementById('import-guide-wechat');
        const a = document.getElementById('import-guide-alipay');
        if (w) w.style.display = importPlatform === 'wechat' ? '' : 'none';
        if (a) a.style.display = importPlatform === 'alipay' ? '' : 'none';
      };
      t.addEventListener('click', switchPlatform);
    });
    on('import-file-input', 'change', handleFileSelect);

    // 账户
    on('account-close', 'click', closeAccountModal);
    on('account-add', 'click', addNewAccount);

    // 建议
    on('advice-close', 'click', closeAdviceModal);

    // 预算
    on('budget-close', 'click', closeBudgetModal);
    on('budget-save', 'click', saveBudget);

    // 分类管理
    on('cat-close', 'click', closeCategoryModal);
    on('cat-add-btn', 'click', addCategory);
    on('cat-restore-defaults', 'click', restoreDefaultCategories);
    document.querySelectorAll('.cat-mgmt-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        catMgmtType = tab.dataset.type;
        document.querySelectorAll('.cat-mgmt-tab').forEach(x => x.classList.remove('active'));
        tab.classList.add('active');
        resetCatAddForm();
        renderCategoryList();
      });
    });

    // 每日贴士刷新
    on('daily-tip-refresh', 'click', () => showDailyTip(true));

    // 月度导入提醒 - header按钮点击打开导入弹窗
    on('header-import-btn', 'click', openImportModal);
    on('toggle-monthly-reminder', 'click', toggleMonthlyReminder);

    // 页面导航快捷方式
    document.querySelectorAll('[data-page]').forEach(el => {
      if (el.classList.contains('nav-btn')) return;
      el.addEventListener('click', () => switchPage(el.dataset.page));
    });

    // 分类详情页
    on('cat-detail-back', 'click', closeCategoryDetail);
    on('cd-sort-amount', 'click', () => { cdSort = 'amount'; document.getElementById('cd-sort-amount').classList.add('active'); document.getElementById('cd-sort-time').classList.remove('active'); refreshCategoryDetail(); });
    on('cd-sort-time', 'click', () => { cdSort = 'time'; document.getElementById('cd-sort-time').classList.add('active'); document.getElementById('cd-sort-amount').classList.remove('active'); refreshCategoryDetail(); });

    // 付费弹窗
    on('btn-payment-close', 'click', () => {
      document.getElementById('modal-payment').classList.remove('show');
    });

    // 退出登录
    on('menu-logout', 'click', async () => {
      if (await showConfirm({ title: '退出登录', message: '确定要退出登录吗？数据会保留在云端。', danger: false })) {
        Auth.logout();
      }
    });
  }

  /* ---------- 认证事件绑定（在未登录时绑定一次即可） ---------- */
  function bindAuthEvents() {
    // 内联脚本已通过 onclick 处理所有认证逻辑，此处不再重复绑定
    console.log('[App] bindAuthEvents: 已由内联脚本处理，跳过');
  }

  /* ---------- 试用期 ---------- */
  function updateTrialBanner() {
    if (APP_MODE !== 'server') return;
    const remaining = Auth.getTrialRemainingDays();
    const user = Auth.getUser();
    if (!user) return;
    if (user.paid) return; // 付费用户不显示

    // 在首页底部注入试用提醒
    let banner = document.getElementById('trial-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'trial-banner';
      banner.className = 'trial-banner';
      banner.innerHTML = '<span class="trial-banner-text"></span>';
      banner.addEventListener('click', () => {
        if (remaining <= 7) {
          showPaymentModal();
        }
      });
      document.getElementById('page-home').appendChild(banner);
    }

    if (remaining > 7) {
      banner.querySelector('.trial-banner-text').textContent = '🎁 试用期还剩 ' + remaining + ' 天';
    } else if (remaining > 0) {
      banner.querySelector('.trial-banner-text').textContent = '⚠️ 试用期仅剩 ' + remaining + ' 天，点击续费';
      banner.classList.add('urgent');
    } else {
      showPaymentModal();
    }
  }

  function showPaymentModal() {
    Auth.hideLoginPage();
    document.getElementById('modal-payment').classList.add('show');
  }

  /* ---------- 语音记账 ---------- */
  let voiceSupported = false;

  function initVoice() {
    voiceSupported = Voice.isSupported();
    const btn = document.getElementById('voice-btn');
    if (!voiceSupported) {
      btn.style.opacity = '0.4';
      btn.title = '当前浏览器不支持语音识别（请使用Chrome）';
      document.getElementById('voice-status-text').textContent = '浏览器不支持语音（请使用Chrome）';
    }
  }

  function toggleVoiceInput() {
    if (!voiceSupported) {
      toast('请使用Chrome浏览器使用语音功能');
      return;
    }

    const btn = document.getElementById('voice-btn');
    const wave = document.getElementById('voice-wave');
    const statusText = document.getElementById('voice-status-text');

    if (Voice.isListening()) {
      Voice.stop();
      return;
    }

    btn.classList.add('listening');
    btn.querySelector('.voice-label').textContent = '正在听...';
    wave.classList.add('show');
    statusText.textContent = '';

    Voice.start(
      // onResult
      (text) => {
        btn.classList.remove('listening');
        btn.querySelector('.voice-label').textContent = '语音记账';
        wave.classList.remove('show');
        statusText.innerHTML = '<span class="voice-interim">' + text + '</span>';

        // 解析语音
        const result = Voice.parseVoice(text);
        if (result.amount > 0 || result.category) {
          showVoiceResult(result);
        } else {
          toast('未识别到金额，请试试说"午餐花了35块钱"');
        }
      },
      // onStatusChange
      (status, interim) => {
        if (status === 'listening' && interim) {
          statusText.innerHTML = '<span class="voice-interim">' + interim + '</span>';
        } else if (status === 'ended') {
          btn.classList.remove('listening');
          btn.querySelector('.voice-label').textContent = '语音记账';
          wave.classList.remove('show');
        } else if (status === 'error') {
          btn.classList.remove('listening');
          btn.querySelector('.voice-label').textContent = '语音记账';
          wave.classList.remove('show');
          if (interim === 'not-allowed') {
            toast('请允许麦克风权限后重试');
          } else if (interim === 'no-speech') {
            statusText.textContent = '未检测到语音，请再试一次';
          }
        }
      }
    );
  }

  function showVoiceResult(result) {
    // 移除旧的结果弹窗
    const old = document.querySelector('.voice-result-toast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.className = 'voice-result-toast';

    const icon = Categories.getIcon(result.category) || '💰';
    const catName = Categories.getName(result.category) || '其他';
    const prefix = result.type === 'income' ? '+' : '-';

    toast.innerHTML = `
      <span class="vrt-icon">${icon}</span>
      <div class="vrt-info">
        <div class="vrt-amount" style="color:${result.type === 'income' ? 'var(--income)' : 'var(--expense)'}">
          ${prefix}¥${result.amount.toFixed(2)}
        </div>
        <div class="vrt-note">${catName} · ${result.note}</div>
      </div>
      <div class="vrt-btns">
        <button class="vrt-cancel">重说</button>
        <button class="vrt-confirm">确认</button>
      </div>
    `;

    document.body.appendChild(toast);

    toast.querySelector('.vrt-confirm').addEventListener('click', async () => {
      const accounts = await DB.getAccounts();
      const accountId = accounts.length > 0 ? accounts[0].id : null;

      await DB.addTransaction({
        type: result.type,
        amount: result.amount,
        category: result.category,
        account: accountId,
        date: new Date().toISOString(),
        note: result.note,
        source: 'voice'
      });

      toast.remove();
      toast('已记录 ' + (result.type === 'income' ? '收入' : '支出') + ' ¥' + result.amount.toFixed(2));
      refreshAll();

      // 记录模板使用
      Templates.recordUsage(result.category, result.type, result.amount);
    });

    toast.querySelector('.vrt-cancel').addEventListener('click', () => {
      toast.remove();
      toggleVoiceInput();
    });

    // 5秒后自动消失
    setTimeout(() => {
      if (document.body.contains(toast)) toast.remove();
    }, 8000);
  }

  /* ---------- 数字键盘（金额弹窗内） ---------- */
  function initNumpad() {
    document.querySelectorAll('#amount-numpad .numpad-key').forEach(key => {
      key.addEventListener('click', () => {
        const val = key.dataset.key;
        if (val === 'del') {
          deleteAmountDigit();
        } else {
          appendAmountDigit(val);
        }
        // 轻触反馈
        key.style.transform = 'scale(0.92)';
        setTimeout(() => { key.style.transform = ''; }, 100);
      });
    });

    // 物理键盘也支持
    document.addEventListener('keydown', (e) => {
      const amountModal = document.getElementById('modal-amount');
      if (!amountModal.classList.contains('show')) return;
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      if (e.key >= '0' && e.key <= '9') appendAmountDigit(e.key);
      else if (e.key === '.' || e.key === '。') appendAmountDigit('.');
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteAmountDigit(); }
      else if (e.key === 'Enter') confirmAmountModal();
    });
  }

  function getAmountModalText() {
    return document.getElementById('amount-modal-text');
  }

  function appendAmountDigit(d) {
    const el = getAmountModalText();
    let val = el.textContent;
    if (val === '0' && d !== '.') val = '';
    if (d === '.' && val.includes('.')) return;
    if (val.replace('.', '').length >= 9) return;
    val += d;
    el.textContent = val;
  }

  function deleteAmountDigit() {
    const el = getAmountModalText();
    let val = el.textContent.slice(0, -1);
    if (val === '' || val === '0') val = '0';
    el.textContent = val;
  }

  function openAmountModal() {
    const current = document.getElementById('add-amount-text').textContent || '0';
    document.getElementById('amount-modal-text').textContent = current;
    document.getElementById('modal-amount').classList.add('show');
  }

  function closeAmountModal() {
    document.getElementById('modal-amount').classList.remove('show');
  }

  function confirmAmountModal() {
    const val = document.getElementById('amount-modal-text').textContent || '0';
    document.getElementById('add-amount-text').textContent = val;
    closeAmountModal();
  }

  /* ---------- 快捷模板 ---------- */
  function renderTemplates() {
    const container = document.getElementById('templates-list');
    if (!container) return;
    const templates = Templates.getAll(selectedTab).slice(0, 10);

    let html = '';
    if (templatesEditMode) {
      html += templates.map(t => `
        <div class="template-chip template-edit" data-id="${t.id}">
          <button class="tpl-delete" data-id="${t.id}">×</button>
          <span class="template-icon">${t.icon}</span>
          <span class="template-name">${t.name}</span>
          <span class="template-amount">¥${t.amount}</span>
        </div>
      `).join('');
      html += `<button class="template-chip template-add" id="tpl-add-new">
        <span class="template-icon">＋</span>
        <span class="template-name">新建</span>
        <span class="template-amount">模板</span>
      </button>`;
    } else {
      html += templates.map(t => `
        <button class="template-chip" data-id="${t.id}" data-cat="${t.category}" data-amount="${t.amount}" data-type="${t.type}">
          <span class="template-icon">${t.icon}</span>
          <span class="template-name">${t.name}</span>
          <span class="template-amount">¥${t.amount}</span>
        </button>
      `).join('');
    }

    // 编辑开关
    html += `<button class="template-chip template-edit-toggle ${templatesEditMode ? 'active' : ''}" id="tpl-edit-toggle">
      <span class="template-icon">✎</span>
      <span class="template-name">${templatesEditMode ? '完成' : '编辑'}</span>
      <span class="template-amount">模板</span>
    </button>`;

    container.innerHTML = html;

    // 编辑开关
    const editBtn = document.getElementById('tpl-edit-toggle');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        templatesEditMode = !templatesEditMode;
        renderTemplates();
      });
    }

    if (templatesEditMode) {
      // 删除
      container.querySelectorAll('.tpl-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          if (!await showConfirm({ title: '删除模板', message: '确定删除这个快捷模板吗？', danger: true })) return;
          Templates.deleteTemplate(id);
          renderTemplates();
        });
      });
      // 编辑（名称/分类/金额/账户）
      container.querySelectorAll('.template-edit').forEach(chip => {
        chip.addEventListener('click', async () => {
          const id = chip.dataset.id;
          const tpl = Templates.getById(id);
          if (!tpl) return;

          // Step 1: 名称
          const name = await showPrompt({ title: '模板名称', defaultValue: tpl.name, placeholder: '如：早餐' });
          if (name === null) return;

          // Step 2: 分类
          const cats = Categories.getByType(tpl.type);
          const catIdx = cats.findIndex(c => c.id === tpl.category);
          const catMsg = cats.map((c, i) => (i + 1) + '.' + c.icon + c.name).join('  ');
          const catChoice = await showPrompt({
            title: '选择分类 (输入序号)',
            defaultValue: catIdx >= 0 ? String(catIdx + 1) : '',
            placeholder: '输入序号: ' + catMsg,
            maxLength: 2
          });
          if (catChoice === null) return;
          const catNum = parseInt(catChoice, 10);
          let category = tpl.category;
          if (catChoice !== '' && catNum >= 1 && catNum <= cats.length) {
            category = cats[catNum - 1].id;
          }

          // Step 3: 金额
          const amountStr = await showPrompt({ title: '模板金额', defaultValue: String(tpl.amount), placeholder: '0.00' });
          if (amountStr === null) return;
          const amount = parseFloat(amountStr);
          if (isNaN(amount) || amount <= 0) { toast('请输入有效金额'); return; }

          // Step 4: 账户
          const accounts = await DB.getAccounts();
          const acctIdx = accounts.findIndex(a => a.id === tpl.account);
          const acctMsg = accounts.map((a, i) => (i + 1) + '.' + a.name).join('  ');
          const acctChoice = await showPrompt({
            title: '选择账户 (输入序号)',
            defaultValue: acctIdx >= 0 ? String(acctIdx + 1) : '',
            placeholder: '输入序号: ' + acctMsg + '  留空=不指定',
            maxLength: 2
          });
          if (acctChoice === null) return;
          const acctNum = parseInt(acctChoice, 10);
          let account = tpl.account || '';
          if (acctChoice === '') account = '';
          else if (acctNum >= 1 && acctNum <= accounts.length) {
            account = accounts[acctNum - 1].id;
          }

          const icon = category !== tpl.category ? (Categories.getIcon(category) || tpl.icon) : tpl.icon;
          Templates.updateTemplate(id, { name, category, amount, account, icon });
          renderTemplates();
        });
      });
      // 新建
      const addBtn = document.getElementById('tpl-add-new');
      if (addBtn) {
        addBtn.addEventListener('click', async () => {
          // Step 1: 名称
          const name = await showPrompt({ title: '新建模板名称', defaultValue: '', placeholder: '如：打车' });
          if (!name) return;

          // Step 2: 选择分类
          const cats = Categories.getByType(selectedTab);
          if (cats.length === 0) { toast('没有可用分类'); return; }
          const catMsg = cats.map((c, i) => (i + 1) + '.' + c.icon + c.name).join('  ');
          const catChoice = await showPrompt({
            title: '选择分类 (输入序号)',
            defaultValue: '1',
            placeholder: '输入序号: ' + catMsg,
            maxLength: 2
          });
          if (catChoice === null) return;
          const catNum = parseInt(catChoice, 10);
          if (isNaN(catNum) || catNum < 1 || catNum > cats.length) { toast('无效的分类序号'); return; }
          const category = cats[catNum - 1].id;

          // Step 3: 金额
          const amountStr = await showPrompt({ title: '模板金额', defaultValue: '', placeholder: '0.00' });
          if (!amountStr) return;
          const amount = parseFloat(amountStr);
          if (isNaN(amount) || amount <= 0) { toast('请输入有效金额'); return; }

          // Step 4: 选择账户
          const accounts = await DB.getAccounts();
          if (accounts.length === 0) { toast('没有可用账户'); return; }
          const acctMsg = accounts.map((a, i) => (i + 1) + '.' + a.name).join('  ');
          const acctChoice = await showPrompt({
            title: '选择账户 (输入序号)',
            defaultValue: '1',
            placeholder: '输入序号: ' + acctMsg + '  留空=不指定',
            maxLength: 2
          });
          if (acctChoice === null) return;
          let account = '';
          if (acctChoice !== '') {
            const acctNum = parseInt(acctChoice, 10);
            if (isNaN(acctNum) || acctNum < 1 || acctNum > accounts.length) { toast('无效的账户序号'); return; }
            account = accounts[acctNum - 1].id;
          }

          const icon = Categories.getIcon(category) || '💰';
          Templates.addTemplate({ name, amount, category, type: selectedTab, icon, account });
          renderTemplates();
        });
      }
    } else {
      // 正常使用
      container.querySelectorAll('.template-chip[data-id]').forEach(chip => {
        chip.addEventListener('click', async () => {
          const amount = parseFloat(chip.dataset.amount);
          const catId = chip.dataset.cat;
          const type = chip.dataset.type;

          // 切换类型
          if (type !== selectedTab) {
            selectedTab = type;
            document.querySelectorAll('#add-type-tabs .type-tab').forEach(x => x.classList.remove('active'));
            const tab = document.getElementById('add-type-tabs').querySelector('[data-type="' + type + '"]');
            if (tab) tab.classList.add('active');
            updateAddMode();
          }

          // 设置金额
          document.getElementById('add-amount-text').textContent = amount.toString();

          // 选择分类
          selectedCategory = catId;
          const catSel = document.getElementById('add-category-select');
          if (catSel) {
            catSel.value = catId;
            const opt = catSel.querySelector('option[value="' + catId + '"]');
            if (!opt) {
              setTimeout(() => updateAddMode(), 0);
            }
          }

          // 应用模板预设账户（如有）
          const tpl = Templates.getById(chip.dataset.id);
          if (tpl && tpl.account) {
            const acctSel = document.getElementById('add-account');
            if (acctSel && acctSel.querySelector('option[value="' + tpl.account + '"]')) {
              acctSel.value = tpl.account;
            }
          }

          // 记录模板使用
          Templates.recordUsage(catId, type, amount);
        });
      });
    }
  }
  function switchPage(page) {
    currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const nav = document.querySelector('.nav-btn[data-page="' + page + '"]');
    if (nav) nav.classList.add('active');

    if (page === 'home') refreshHome();
    else if (page === 'records') refreshRecords();
    else if (page === 'stats') refreshStats();
    else if (page === 'profile') refreshProfile();
  }

  /* ---------- 首页 ---------- */
  async function refreshHome() {
    updateMonthLabels();
    const y = homeMonth.getFullYear();
    const m = homeMonth.getMonth();
    const tx = await DB.getTransactionsByMonth(y, m);

    const income = tx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = tx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balance = income - expense;
    const rate = income > 0 ? ((balance / income) * 100) : 0;

    document.getElementById('home-income').textContent = formatMoney(income);
    document.getElementById('home-expense').textContent = formatMoney(expense);
    document.getElementById('home-balance').textContent = formatMoney(balance);
    document.getElementById('home-savings-rate').textContent = rate.toFixed(1) + '%';
    document.getElementById('home-savings-bar').style.width = Math.min(100, Math.max(0, rate)) + '%';

    // 近7天趋势
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    const labels = days.map(d => d.getMonth() + 1 + '/' + d.getDate());
    const values = days.map(d => {
      return tx
        .filter(t => t.type === 'expense' && new Date(t.date).toDateString() === d.toDateString())
        .reduce((s, t) => s + t.amount, 0);
    });
    Charts.renderHomeTrend(document.getElementById('home-trend-chart'), {
      labels, values,
      onClick: async (idx, label, value) => {
        if (!value || value === 0) return;
        // 计算目标日期并跳转到账单页
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - (6 - idx));
        recordsMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
        recordsDateFilter = fmtLocalDate(targetDate);
        switchPage('records');
      }
    });

    // 每日理财贴士
    showDailyTip(false);

    // 月度导入提醒
    checkMonthlyReminder();

    // 更新快捷入口
    if (document.querySelector('[data-page="records"].nav-btn')) {
      document.querySelectorAll('[data-page="records"]').forEach(el => {
        el.addEventListener('click', () => switchPage('records'), { once: true });
      });
    }
  }

  /* ---------- 账单页 ---------- */
  async function refreshRecords() {
    updateMonthLabels();
    const y = recordsMonth.getFullYear();
    const m = recordsMonth.getMonth();
    let allTx = await DB.getTransactionsByMonth(y, m);

    // 日期筛选（来自图表点击跳转）
    if (recordsDateFilter) {
      allTx = allTx.filter(t => {
        const d = new Date(t.date);
        const f = new Date(recordsDateFilter);
        return d.getFullYear() === f.getFullYear() && d.getMonth() === f.getMonth() && d.getDate() === f.getDate();
      });
    }

    // 应用筛选
    if (filterType !== 'all') {
      allTx = allTx.filter(t => t.type === filterType);
    }
    if (filterCategory !== 'all') {
      allTx = allTx.filter(t => t.category === filterCategory);
    }
    if (filterSearch) {
      const s = filterSearch.toLowerCase().trim();
      allTx = allTx.filter(t => {
        const note = (t.note || '').toLowerCase();
        const catName = (Categories.getName(t.category) || '').toLowerCase();
        const amountStr = t.amount.toFixed(2);
        return note.includes(s) || catName.includes(s) || amountStr.includes(s) || (t.category || '').toLowerCase().includes(s);
      });
    }

    const income = allTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = allTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    document.getElementById('records-income').textContent = formatMoney(income);
    document.getElementById('records-expense').textContent = formatMoney(expense);
    document.getElementById('records-balance').textContent = formatMoney(income - expense);

    // 更新日期筛选提示
    const list = document.getElementById('records-list');
    const empty = document.getElementById('records-empty');
    const dateFilterHint = document.getElementById('records-date-filter-hint');
    if (recordsDateFilter) {
      if (!dateFilterHint) {
        const hint = document.createElement('div');
        hint.id = 'records-date-filter-hint';
        hint.style.cssText = 'text-align:center;padding:6px 0;font-size:13px;color:var(--primary);cursor:pointer;';
        hint.textContent = '📅 已筛选: ' + new Date(recordsDateFilter).toLocaleDateString('zh-CN', { month:'long', day:'numeric' }) + ' · 点击清除';
        hint.onclick = () => { recordsDateFilter = null; refreshRecords(); };
        const overview = document.getElementById('records-overview');
        if (overview) overview.after(hint);
      } else {
        dateFilterHint.textContent = '📅 已筛选: ' + new Date(recordsDateFilter).toLocaleDateString('zh-CN', { month:'long', day:'numeric' }) + ' · 点击清除';
        dateFilterHint.style.display = '';
      }
    } else if (dateFilterHint) {
      dateFilterHint.style.display = 'none';
    }

    if (allTx.length === 0) {
      list.textContent = '';
      empty.style.display = '';
    } else {
      empty.style.display = 'none';
      renderTxList('records-list', allTx, true);
    }

    // 更新筛选分类chips
    updateFilterCategories();
  }

  function toggleFilter() {
    const panel = document.getElementById('filter-panel');
    panel.classList.toggle('open');
  }

  async function updateFilterCategories() {
    const container = document.getElementById('filter-category');
    const cats = Categories.getByType('expense');
    let html = '<button class="chip active" data-val="all">全部</button>';
    cats.forEach(c => {
      html += '<button class="chip" data-val="' + c.id + '">' + c.icon + ' ' + c.name + '</button>';
    });
    container.innerHTML = html;
    container.querySelectorAll('.chip').forEach(c => {
      c.addEventListener('click', () => {
        filterCategory = c.dataset.val;
        container.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        refreshRecords();
      });
    });
  }

  /* ---------- 年月选择器 ---------- */
  function openMonthPicker() {
    pickerYear = recordsMonth.getFullYear();
    pickerMonth = recordsMonth.getMonth();
    renderMonthPicker();
    document.getElementById('modal-month-picker').classList.add('show');
  }

  function closeMonthPicker() {
    document.getElementById('modal-month-picker').classList.remove('show');
  }

  function renderMonthPicker() {
    document.getElementById('picker-year-display').textContent = pickerYear + '年';
    const now = new Date();
    const currentY = now.getFullYear();
    const currentM = now.getMonth();
    document.querySelectorAll('#month-grid .month-cell').forEach(cell => {
      const m = parseInt(cell.dataset.m, 10);
      cell.classList.remove('selected', 'current');
      if (m === pickerMonth) cell.classList.add('selected');
      if (m === currentM && pickerYear === currentY) cell.classList.add('current');
    });
  }

  function applyMonthPicker() {
    recordsMonth = new Date(pickerYear, pickerMonth, 1);
    closeMonthPicker();
    refreshRecords();
  }

  /* ---------- 交易列表渲染 ---------- */
  function renderTxList(containerId, transactions, grouped) {
    const container = document.getElementById(containerId);
    if (transactions.length === 0) {
      container.textContent = '';
      container.innerHTML = '<div class="empty-state" style="padding:20px"><span class="empty-icon">📝</span><p style="color:#9ca3af;font-size:13px">暂无记录</p></div>';
      return;
    }

    let html = '';
    let lastDate = '';

    if (grouped) {
      transactions.forEach(t => {
        const d = new Date(t.date);
        const dateStr = d.getMonth() + 1 + '月' + d.getDate() + '日';
        const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];

        if (dateStr !== lastDate) {
          lastDate = dateStr;
          const total = transactions
            .filter(x => new Date(x.date).toDateString() === d.toDateString() && x.type === 'expense')
            .reduce((s, x) => s + x.amount, 0);
          html += '<div class="tx-group-header">' + dateStr + ' 星期' + dayOfWeek + (total > 0 ? '   支出 ¥' + total.toFixed(2) : '') + '</div>';
        }
        html += renderTxItem(t);
      });
    } else {
      transactions.forEach(t => {
        html += renderTxItem(t);
      });
    }

    container.innerHTML = html;
  }

  function renderTxItem(t) {
    const icon = Categories.getIcon(t.category);
    const name = t.transferFrom ? '转账' : (t.note || Categories.getName(t.category));
    const dateStr = new Date(t.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    const amountClass = t.type === 'income' ? 'income' : (t.type === 'transfer' ? 'transfer' : 'expense');
    const prefix = t.type === 'income' ? '+' : (t.type === 'transfer' ? '' : '-');

    return `
      <div class="tx-item" data-tx-id="${t.id}" onclick="App.openEditModal('${t.id}')">
        <div class="tx-icon">${icon}</div>
        <div class="tx-info">
          <div class="tx-category">${name}</div>
          <div class="tx-note">${dateStr}${t.source ? ' · ' + (t.source === 'wechat' ? '微信' : '支付宝') : ''}</div>
        </div>
        <div class="tx-amount ${amountClass}">${prefix}¥${t.amount.toFixed(2)}</div>
      </div>
    `;
  }

  /* ---------- 统计页 ---------- */

  /** 根据周期类型和锚点日期，计算起止日期和标签 */
  function getPeriodRange(period, anchor) {
    const a = new Date(anchor);
    if (period === 'week') {
      // 周一为一周起始
      const day = a.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const start = new Date(a.getFullYear(), a.getMonth(), a.getDate() + diff);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    } else if (period === 'month') {
      const start = new Date(a.getFullYear(), a.getMonth(), 1);
      const end = new Date(a.getFullYear(), a.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end };
    } else {
      const start = new Date(a.getFullYear(), 0, 1);
      const end = new Date(a.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start, end };
    }
  }

  /** 偏移锚点日期 */
  function shiftPeriod(dir) {
    const a = new Date(statsAnchor);
    if (statsPeriod === 'week') {
      a.setDate(a.getDate() + dir * 7);
    } else if (statsPeriod === 'month') {
      a.setMonth(a.getMonth() + dir);
    } else {
      a.setFullYear(a.getFullYear() + dir);
    }
    statsAnchor = a;
    refreshStats();
  }

  /** 生成周期标签 */
  function periodLabel(period, date) {
    if (period === 'week') {
      const { start, end } = getPeriodRange('week', date);
      return (start.getMonth() + 1) + '/' + start.getDate() + ' - ' + (end.getMonth() + 1) + '/' + end.getDate();
    } else if (period === 'month') {
      return date.getFullYear() + '年' + (date.getMonth() + 1) + '月';
    } else {
      return date.getFullYear() + '年';
    }
  }

  /** 渲染周期滑动条 */
  function renderPeriodStrip() {
    const strip = document.getElementById('period-strip');
    const items = [];
    for (let i = -2; i <= 2; i++) {
      const d = new Date(statsAnchor);
      if (statsPeriod === 'week') d.setDate(d.getDate() + i * 7);
      else if (statsPeriod === 'month') d.setMonth(d.getMonth() + i);
      else d.setFullYear(d.getFullYear() + i);

      const label = statsPeriod === 'week'
        ? ((d.getMonth() + 1) + '/' + d.getDate())
        : statsPeriod === 'month'
          ? ((d.getMonth() + 1) + '月')
          : (d.getFullYear() + '');
      const active = i === 0;
      items.push('<div class="period-cell' + (active ? ' active' : '') + '" data-offset="' + i + '">' + label + '</div>');
    }
    strip.innerHTML = items.join('');

    strip.querySelectorAll('.period-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const offset = parseInt(cell.dataset.offset);
        if (offset !== 0) shiftPeriod(offset);
      });
    });
  }

  async function refreshStats() {
    renderPeriodStrip();

    const { start, end } = getPeriodRange(statsPeriod, statsAnchor);
    const allTx = await DB.getTransactionsByDateRange(start, end);

    // 按类型筛选
    const typeTx = allTx.filter(t => t.type === statsType);
    const total = typeTx.reduce((s, t) => s + t.amount, 0);

    // 平均值
    let avgLabel, avgValue;
    if (statsPeriod === 'week') {
      avgLabel = '日均';
      avgValue = total / 7;
    } else if (statsPeriod === 'month') {
      const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      avgLabel = '日均';
      avgValue = total / days;
    } else {
      avgLabel = '月均';
      avgValue = total / 12;
    }

    const typeLabel = statsType === 'expense' ? '支出' : '收入';
    document.getElementById('stats-period-total').textContent = '总' + typeLabel + '：¥' + total.toFixed(2);
    document.getElementById('stats-period-avg').textContent = avgLabel + '：¥' + avgValue.toFixed(2);
    document.getElementById('stats-rank-title').textContent = typeLabel + '排行榜';

    // 趋势图数据
    let labels = [], values = [], pointRanges = [];
    if (statsPeriod === 'week') {
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        labels.push((d.getMonth() + 1) + '/' + d.getDate());
        values.push(allTx.filter(t => t.type === statsType && new Date(t.date).toDateString() === d.toDateString()).reduce((s, t) => s + t.amount, 0));
        pointRanges.push({ start: new Date(d.getFullYear(), d.getMonth(), d.getDate()), end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999) });
      }
    } else if (statsPeriod === 'month') {
      const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      for (let i = 1; i <= days; i++) {
        labels.push(i + '');
        values.push(allTx.filter(t => t.type === statsType && new Date(t.date).getDate() === i).reduce((s, t) => s + t.amount, 0));
        pointRanges.push({ start: new Date(start.getFullYear(), start.getMonth(), i), end: new Date(start.getFullYear(), start.getMonth(), i, 23, 59, 59, 999) });
      }
    } else {
      for (let i = 0; i < 12; i++) {
        labels.push((i + 1) + '月');
        values.push(allTx.filter(t => t.type === statsType && new Date(t.date).getMonth() === i).reduce((s, t) => s + t.amount, 0));
        pointRanges.push({ start: new Date(start.getFullYear(), i, 1), end: new Date(start.getFullYear(), i + 1, 0, 23, 59, 59, 999) });
      }
    }

    // 每个点对应的最大 3 笔交易
    const top3Data = pointRanges.map(r => {
      return typeTx
        .filter(t => {
          const d = new Date(t.date);
          return d >= r.start && d <= r.end;
        })
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3)
        .map(t => ({
          icon: Categories.getIcon(t.category) || '💰',
          name: t.note || Categories.getName(t.category) || '未命名',
          amount: t.amount,
          date: new Date(t.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
        }));
    });

    const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    Charts.renderTrend(document.getElementById('stats-line-chart'), {
      labels, values, average: avg,
      top3Data,
      onClick: onChartPointClick
    });

    // 分类排行
    const byCategory = {};
    typeTx.forEach(t => {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    });
    const ranked = Object.entries(byCategory)
      .map(([id, amt]) => ({ id, name: Categories.getName(id), amount: amt, icon: Categories.getIcon(id), color: Categories.getColor(id) }))
      .sort((a, b) => b.amount - a.amount);

    // 饼图：分类占比（用排行榜中前10的数据）
    const pieTitle = document.getElementById('stats-pie-title');
    if (pieTitle) pieTitle.textContent = typeLabel + '分类占比';
    const pieData = ranked.slice(0, 10).map(d => ({ id: d.id, name: d.name, amount: d.amount, color: d.color }));
    // 合并剩余分类为"其他"
    if (ranked.length > 10) {
      const restAmount = ranked.slice(10).reduce((s, d) => s + d.amount, 0);
      if (restAmount > 0) {
        pieData.push({ id: '_other', name: '其他', amount: restAmount, color: '#bfbfbf' });
      }
    }
    Charts.renderPie(document.getElementById('stats-pie-chart'), Object.assign(pieData, {
      onClick: (catId, catName) => {
        if (catId === '_other') return;
        openCategoryDetail(catId, statsType);
      }
    }));

    const rankHtml = ranked.map((d, i) => {
      const pct = total > 0 ? (d.amount / total) * 100 : 0;
      return '<div class="rank-item rank-clickable" data-cat="' + d.id + '">' +
        '<span class="rank-icon">' + (d.icon || '💰') + '</span>' +
        '<span class="rank-name">' + d.name + '</span>' +
        '<div class="rank-bar-wrap"><div class="rank-bar" style="width:' + Math.max(pct, 2) + '%;background:' + (d.color || '#5b6ef5') + '"></div></div>' +
        '<span class="rank-amount">¥' + d.amount.toFixed(0) + '</span>' +
        '<span class="rank-pct">' + pct.toFixed(1) + '%</span>' +
      '</div>';
    }).join('');
    document.getElementById('stats-category-ranking').innerHTML = rankHtml || '<div class="empty-state" style="padding:20px"><p style="font-size:13px;color:#9ca3af">暂无' + typeLabel + '数据</p></div>';

    // 排行点击查看分类明细
    document.querySelectorAll('.rank-clickable').forEach(item => {
      item.addEventListener('click', () => {
        const catId = item.dataset.cat;
        openCategoryDetail(catId, statsType);
      });
    });
  }

  /* ---------- 分类详情页 ---------- */
  let cdCatId = null;
  let cdType = 'expense';
  let cdSort = 'amount';
  let cdChart = null;
  let cdAllTx = [];

  function openCategoryDetail(catId, type) {
    cdCatId = catId;
    cdType = type;
    cdSort = 'amount';
    document.getElementById('app').classList.add('cat-detail-open');
    document.getElementById('page-cat-detail').classList.add('show');
    document.getElementById('cd-sort-amount').classList.add('active');
    document.getElementById('cd-sort-time').classList.remove('active');
    const catName = Categories.getName(catId);
    document.getElementById('cd-cat-name').textContent = catName;
    document.getElementById('cd-cat-icon').textContent = Categories.getIcon(catId) || '💰';
    refreshCategoryDetail();
  }

  async function refreshCategoryDetail() {
    const allTx = await DB.getAllTransactions();
    cdAllTx = allTx.filter(t => t.type === cdType && t.category === cdCatId);
    const total = cdAllTx.reduce((s, t) => s + t.amount, 0);
    const count = cdAllTx.length;
    const avg = count > 0 ? total / count : 0;

    document.getElementById('cd-total').textContent = '¥' + total.toFixed(2);
    document.getElementById('cd-count').textContent = count;
    document.getElementById('cd-avg').textContent = '¥' + avg.toFixed(2);

    // 排序
    const sorted = [...cdAllTx];
    if (cdSort === 'amount') {
      sorted.sort((a, b) => b.amount - a.amount);
    } else {
      sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    // 渲染列表
    const typeLabel = cdType === 'expense' ? '支出' : '收入';
    renderTxList('cd-list', sorted, false);

    // 渲染趋势图
    renderCatDetailChart();
  }

  function renderCatDetailChart() {
    if (cdChart) cdChart.destroy();
    const canvas = document.getElementById('cd-chart');
    if (!canvas || cdAllTx.length === 0) return;

    const daily = {};
    cdAllTx.forEach(t => {
      const day = t.date.substring(0, 10);
      daily[day] = (daily[day] || 0) + t.amount;
    });
    const entries = Object.entries(daily).sort((a, b) => a[0].localeCompare(b[0]));
    const labels = entries.map(e => e[0].substring(5));
    const values = entries.map(e => e[1]);

    cdChart = Charts.renderTrend(canvas, { labels, values });
  }

  function closeCategoryDetail() {
    cdCatId = null;
    if (cdChart) { cdChart.destroy(); cdChart = null; }
    document.getElementById('page-cat-detail').classList.remove('show');
    document.getElementById('app').classList.remove('cat-detail-open');
  }

  function openDetailModal(title, transactions) {
    document.getElementById('modal-detail').classList.add('show');
    document.getElementById('detail-title').textContent = title;
    const total = transactions.reduce((s, t) => s + t.amount, 0);
    document.getElementById('detail-summary').innerHTML =
      '<span>共 ' + transactions.length + ' 笔</span><span style="font-weight:600">合计 ¥' + total.toFixed(2) + '</span>';
    renderTxList('detail-list', transactions.sort((a, b) => new Date(b.date) - new Date(a.date)), false);
  }

  function closeDetailModal() {
    document.getElementById('modal-detail').classList.remove('show');
  }

  /** 图表点击 → 跳转到账单页面对应日期 */
  async function onChartPointClick(idx, label, value) {
    if (!value || value === 0) return;

    const { start } = getPeriodRange(statsPeriod, statsAnchor);
    let targetDate;

    if (statsPeriod === 'week') {
      targetDate = new Date(start);
      targetDate.setDate(targetDate.getDate() + idx);
    } else if (statsPeriod === 'month') {
      const day = parseInt(label, 10);
      targetDate = new Date(start.getFullYear(), start.getMonth(), day);
    } else {
      const month = parseInt(label, 10);
      targetDate = new Date(start.getFullYear(), month - 1, 1);
    }

    // 设置日期筛选并跳转到账单页
    recordsMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    recordsDateFilter = fmtLocalDate(targetDate);
    switchPage('records');
  }

  /* ---------- 我的页 ---------- */
  async function refreshProfile() {
    const accounts = await DB.getAccounts();
    const assets = accounts.filter(a => a.type !== 'credit').reduce((s, a) => s + (a.balance || 0), 0);
    const debt = accounts.filter(a => a.type === 'credit').reduce((s, a) => s + Math.abs(a.balance || 0), 0);

    document.getElementById('profile-total-assets').textContent = formatMoney(assets);
    document.getElementById('profile-debt').textContent = formatMoney(debt);
    document.getElementById('profile-net-assets').textContent = formatMoney(assets - debt);

    // 更新导入状态
    const now = new Date();
    const thisMonth = now.getFullYear() + '-' + (now.getMonth() + 1);
    let imported = {};
    try { imported = JSON.parse(await DB.getSetting('importedMonths') || '{}'); } catch(e) {}
    const monthImported = imported[thisMonth] || {};
    const wxDone = monthImported.wechat;
    const aliDone = monthImported.alipay;

    const statusEl = document.getElementById('profile-import-status');
    if (wxDone && aliDone) {
      statusEl.textContent = '✅ 账单已全部导入';
      statusEl.className = 'has-import';
    } else if (wxDone) {
      statusEl.textContent = '⚠ 支付宝账单尚未导入';
      statusEl.className = '';
    } else if (aliDone) {
      statusEl.textContent = '⚠ 微信账单尚未导入';
      statusEl.className = '';
    } else {
      statusEl.textContent = '📥 本月尚未导入账单';
      statusEl.className = '';
    }

    // 更新提醒开关状态
    const enabled = await DB.getSetting('monthlyReminderEnabled');
    updateReminderToggle(enabled !== 'false');
  }

  /* ---------- 记一笔 ---------- */
  function openAddModal() {
    editingTransactionId = null;
    const modal = document.getElementById('modal-add');
    modal.classList.add('show');
    document.getElementById('modal-title-text').textContent = '记一笔';
    document.getElementById('add-amount-text').textContent = '0';
    document.getElementById('add-delete').style.display = 'none';
    selectedTab = 'expense';
    selectedCategory = null;
    document.querySelectorAll('#add-type-tabs .type-tab').forEach(x => x.classList.remove('active'));
    document.getElementById('add-type-tabs').querySelector('[data-type="expense"]').classList.add('active');
    document.getElementById('add-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('add-note').value = '';
    document.getElementById('voice-section').style.display = '';
    updateAddMode();
    // 读取该类型的默认账户
    const defaultAcct = localStorage.getItem('defaultAccount_' + selectedTab);
    populateAccountSelect('add-account', defaultAcct || undefined);
    renderTemplates();
  }

  async function openEditModal(txId) {
    const allTx = await DB.getAllTransactions();
    const t = allTx.find(x => x.id === txId);
    if (!t) return;

    editingTransactionId = txId;
    const modal = document.getElementById('modal-add');
    modal.classList.add('show');
    document.getElementById('modal-title-text').textContent = '编辑记录';
    document.getElementById('add-delete').style.display = '';

    // 填充金额
    document.getElementById('add-amount-text').textContent = String(t.amount);

    // 填充类型
    selectedTab = t.type === 'transfer' ? 'transfer' : t.type;
    selectedCategory = t.category || null;
    document.querySelectorAll('#add-type-tabs .type-tab').forEach(x => x.classList.remove('active'));
    const tab = document.getElementById('add-type-tabs').querySelector('[data-type="' + selectedTab + '"]');
    if (tab) tab.classList.add('active');

    // 填充日期和备注
    const d = new Date(t.date);
    document.getElementById('add-date').value = d.toISOString().split('T')[0];
    document.getElementById('add-note').value = t.note || '';

    // 隐藏语音和模板（编辑模式不需要）
    document.getElementById('voice-section').style.display = 'none';
    document.getElementById('templates-section').style.display = 'none';

    updateAddMode();

    // 填充账户
    if (selectedTab !== 'transfer') {
      populateAccountSelect('add-account', t.account);
    }
  }

  function closeAddModal() {
    document.getElementById('modal-add').classList.remove('show');
    editingTransactionId = null;
  }

  function updateAddMode() {
    const catSelect = document.getElementById('add-category-select');
    const catSection = document.getElementById('category-section');
    const accountSection = document.getElementById('account-section');
    const transferFields = document.getElementById('transfer-fields');
    const voiceSection = document.getElementById('voice-section');
    const templatesSection = document.getElementById('templates-section');

    if (selectedTab === 'transfer') {
      catSection.style.display = 'none';
      accountSection.style.display = 'none';
      transferFields.style.display = '';
      voiceSection.style.display = 'none';
      templatesSection.style.display = 'none';
      populateAccountSelect('transfer-from');
      populateAccountSelect('transfer-to');
    } else {
      catSection.style.display = '';
      accountSection.style.display = '';
      transferFields.style.display = 'none';
      voiceSection.style.display = editingTransactionId ? 'none' : '';
      templatesSection.style.display = editingTransactionId ? 'none' : '';
      const cats = Categories.getByType(selectedTab);
      catSelect.innerHTML = '<option value="">请选择分类</option>' +
        cats.map(c => `<option value="${c.id}" ${selectedCategory === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('');

      // 监听 select 变化
      catSelect.onchange = () => {
        selectedCategory = catSelect.value;
      };

      // 读取该类型的默认账户（编辑模式不覆盖已选账户）
      if (!editingTransactionId) {
        const defaultAcct = localStorage.getItem('defaultAccount_' + selectedTab);
        populateAccountSelect('add-account', defaultAcct || undefined);
      }

      renderTemplates();
    }
  }

  async function populateAccountSelect(selectId, selectedId) {
    const select = document.getElementById(selectId);
    const accounts = await DB.getAccounts();
    select.innerHTML = accounts.map(a =>
      '<option value="' + a.id + '"' + (selectedId === a.id ? ' selected' : '') + '>' + a.name + '</option>'
    ).join('');
  }

  async function saveTransaction() {
    const amount = parseFloat(document.getElementById('add-amount-text').textContent);
    if (!amount || amount <= 0) { toast('请输入金额'); return; }

    if (selectedTab === 'transfer') {
      const fromId = document.getElementById('transfer-from').value;
      const toId = document.getElementById('transfer-to').value;
      if (fromId === toId) { toast('转出和转入账户不能相同'); return; }

      // 转出记录
      const fromAccount = await DB.getAccountById(fromId);
      await DB.addTransaction({
        type: 'expense',
        amount,
        category: 'cat_transfer',
        account: fromId,
        date: document.getElementById('add-date').value,
        note: '转账至' + (await DB.getAccountById(toId)).name,
        source: 'manual',
        transferTo: toId
      });

      // 转入记录
      await DB.addTransaction({
        type: 'income',
        amount,
        category: 'cat_redpacket',
        account: toId,
        date: document.getElementById('add-date').value,
        note: '来自' + fromAccount.name,
        source: 'manual',
        transferFrom: fromId
      });

      toast('转账记录已保存');
    } else {
      if (!selectedCategory) { toast('请选择分类'); return; }
      const account = document.getElementById('add-account').value;
      if (!account) { toast('请选择账户'); return; }

      const txData = {
        type: selectedTab,
        amount,
        category: selectedCategory,
        account,
        date: document.getElementById('add-date').value,
        note: document.getElementById('add-note').value,
        source: 'manual'
      };

      if (editingTransactionId) {
        // 编辑模式：更新现有记录
        txData.id = editingTransactionId;
        txData.updatedAt = new Date().toISOString();
        await DB.updateTransaction(txData);
        toast('记录已更新');
      } else {
        // 新建模式
        await DB.addTransaction(txData);
        toast((selectedTab === 'income' ? '收入' : '支出') + '已记录');
      }
    }

    closeAddModal();
    refreshAll();

    // 记录使用习惯
    if (selectedTab !== 'transfer') {
      Templates.recordUsage(selectedCategory, selectedTab, amount);
      // 记住该类型的默认账户
      const usedAccount = document.getElementById('add-account').value;
      if (usedAccount) {
        localStorage.setItem('defaultAccount_' + selectedTab, usedAccount);
      }
    }
  }

  async function deleteCurrentTransaction() {
    if (!editingTransactionId) return;
    if (!await showConfirm({ title: '删除记录', message: '确定删除这条记录吗？此操作不可撤销。', danger: true })) return;
    await DB.deleteTransaction(editingTransactionId);
    toast('记录已删除');
    closeAddModal();
    refreshAll();
  }

  /* ---------- 导入账单 ---------- */
  function openImportModal() {
    document.getElementById('modal-import').classList.add('show');
    importData = [];
    document.getElementById('import-preview').style.display = 'none';
    document.getElementById('import-dropzone').style.display = '';
    document.getElementById('import-file-input').value = '';
  }

  function closeImportModal() {
    document.getElementById('modal-import').classList.remove('show');
  }

  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // 显示加载状态
    const dropzone = document.getElementById('import-dropzone');
    const origLabel = dropzone.querySelector('.dropzone-label')?.textContent || '';
    const labelEl = dropzone.querySelector('.dropzone-label');
    if (labelEl) labelEl.textContent = '正在解析...';
    dropzone.style.pointerEvents = 'none';
    dropzone.style.opacity = '0.6';

    try {
      importData = await CSVImport.parseFile(file, importPlatform);
    } catch (parseErr) {
      // 恢复 UI
      if (labelEl) labelEl.textContent = origLabel;
      dropzone.style.pointerEvents = '';
      dropzone.style.opacity = '';
      toast('文件读取失败：' + parseErr.message);
      e.target.value = '';
      return;
    }

    // 恢复 UI
    if (labelEl) labelEl.textContent = origLabel;
    dropzone.style.pointerEvents = '';
    dropzone.style.opacity = '';

    if (importData.length === 0) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext === 'csv') {
        toast('未解析到记录。请确认：1) 文件是否从支付宝"账单→开具交易流水证明"导出；2) 不要用WPS/Excel另存过文件（会改变格式）');
      } else {
        toast('未解析到记录，请确认文件为支付宝/微信官方导出的账单文件，且未被第三方软件修改过');
      }
      e.target.value = '';
      return;
    }

    document.getElementById('import-dropzone').style.display = 'none';
    document.getElementById('import-preview').style.display = '';
    document.getElementById('import-summary').textContent = '共识别 ' + importData.length + ' 条记录';

      const previewHtml = importData.slice(0, 50).map(t => {
        const isExpense = t.type === 'expense';
        return `
          <div class="preview-item">
            <div class="preview-cat">${t.categoryIcon || '📦'}</div>
            <div class="preview-info">
              <div class="preview-desc">${t.description || t.note || ''}</div>
              <div class="preview-date">${new Date(t.date).toLocaleDateString('zh-CN')} · ${t.categoryName || '未分类'}</div>
            </div>
            <div class="preview-amount" style="color:${isExpense ? 'var(--expense)' : 'var(--income)'}">
              ${isExpense ? '-' : '+'}¥${t.amount.toFixed(2)}
            </div>
          </div>
        `;
      }).join('');
      document.getElementById('import-preview-list').innerHTML = previewHtml +
        (importData.length > 50 ? '<div style="text-align:center;color:var(--text-3);padding:8px">...还有 ' + (importData.length - 50) + ' 条</div>' : '');
  }

  async function confirmImport() {
    if (!importData || importData.length === 0) return;
    try {
      await DB.bulkAddTransactions(importData);
    } catch (e) {
      toast('导入失败：' + (e.message || '数据库写入异常'));
      return;
    }

    // 记录本月已导入（按平台）
    const now = new Date();
    const monthKey = now.getFullYear() + '-' + (now.getMonth() + 1);
    let imported = {};
    try { imported = JSON.parse(await DB.getSetting('importedMonths') || '{}'); } catch(e) {}

    if (!imported[monthKey]) imported[monthKey] = {};
    imported[monthKey][importPlatform] = true;
    await DB.setSetting('importedMonths', JSON.stringify(imported));

    toast('成功导入 ' + importData.length + ' 条记录');
    closeImportModal();
    learnTemplates();
    refreshAll();

    // 导入完成后刷新提醒状态
    checkMonthlyReminder();
  }

  /* ---------- 账户管理 ---------- */
  function openAccountModal() {
    document.getElementById('modal-account').classList.add('show');
    refreshAccountList();
  }

  function closeAccountModal() {
    document.getElementById('modal-account').classList.remove('show');
  }

  async function refreshAccountList() {
    const accounts = await DB.getAccounts();
    const icons = { cash: '💵', bank: '🏦', wechat: '💚', alipay: '💙', credit: '💳', other: '💰' };
    const html = accounts.map(a => `
      <div class="am-item">
        <span class="am-icon">${icons[a.type] || '💰'}</span>
        <span class="am-name">${a.name}</span>
        <span class="am-balance editable" data-id="${a.id}">¥${(a.balance || 0).toFixed(2)}</span>
        <button class="am-delete" data-id="${a.id}">删除</button>
      </div>
    `).join('');
    document.getElementById('account-list-manage').innerHTML = html || '<div style="color:var(--text-3);font-size:13px;padding:8px 0">暂无账户</div>';

    // 点击余额编辑
    document.querySelectorAll('.am-balance.editable').forEach(el => {
      el.addEventListener('click', function(e) { startEditBalance(this, this.dataset.id); });
    });

    // 删除事件
    document.querySelectorAll('.am-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        await DB.deleteAccount(btn.dataset.id);
        refreshAccountList();
        refreshProfile();
      });
    });
  }

  function startEditBalance(el, id) {
    // 如果已经在编辑中，忽略
    if (el.querySelector('input')) return;

    const currentVal = (el.textContent || '').replace('¥', '').trim();
    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'decimal';
    input.value = currentVal;
    input.className = 'am-balance-input';
    input.style.cssText = 'width:100%;font-size:14px;font-weight:600;text-align:right;padding:2px 6px;' +
      'border:1px solid var(--primary);border-radius:4px;background:var(--bg);color:var(--text);' +
      'outline:none;box-sizing:border-box;';
    el.textContent = '';
    el.appendChild(input);
    input.focus();
    input.select();

    const commit = async () => {
      const val = parseFloat(input.value);
      if (isNaN(val)) {
        toast('请输入有效数字');
        el.textContent = '¥' + currentVal;
        return;
      }
      const account = await DB.getAccountById(id);
      if (!account) { el.textContent = '¥' + currentVal; return; }
      account.balance = val;
      await DB.updateAccount(account);
      el.textContent = '¥' + val.toFixed(2);
      refreshProfile();
      toast('余额已更新');
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.blur(); // blur 会触发 commit
      }
    });
  }

  async function addNewAccount() {
    const name = document.getElementById('new-account-name').value.trim();
    const type = document.getElementById('new-account-type').value;
    const balance = parseFloat(document.getElementById('new-account-balance').value) || 0;

    if (!name) { toast('请输入账户名称'); return; }

    await DB.addAccount({ name, type, currency: '¥', balance });
    document.getElementById('new-account-name').value = '';
    document.getElementById('new-account-balance').value = '';
    refreshAccountList();
    refreshProfile();
    toast('账户已添加');
  }

  /* ---------- 理财建议 ---------- */
  async function openAdviceModal() {
    document.getElementById('modal-advice').classList.add('show');
    const transactions = await DB.getAllTransactions();
    const accounts = await DB.getAccounts();
    const report = Advisor.generateReport(transactions, accounts);
    renderAdvice(report);
  }

  function closeAdviceModal() {
    document.getElementById('modal-advice').classList.remove('show');
  }

  function renderAdvice(report) {
    const bgColor = report.score >= 70 ? '#e6f7ee' : (report.score >= 50 ? '#fffbe6' : '#fff1f0');
    const html = `
      <div class="advice-score">
        <div class="advice-score-circle" style="background:${bgColor};color:${report.scoreColor}">
          ${report.score}
        </div>
        <div class="advice-score-label">${report.scoreLabel}</div>
      </div>

      <div class="summary-card" style="margin-bottom:16px">
        <div class="summary-row">
          <div class="summary-item">
            <span class="summary-label">月收入</span>
            <span class="summary-value income">${formatMoney(report.monthIncome)}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">月支出</span>
            <span class="summary-value expense">${formatMoney(report.monthExpense)}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">月结余</span>
            <span class="summary-value">${formatMoney(report.monthBalance)}</span>
          </div>
        </div>
        <div class="savings-rate-bar">
          <div class="savings-rate-label">
            <span>储蓄率</span>
            <span>${report.savingsRate.toFixed(1)}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${Math.min(100, Math.max(0, report.savingsRate))}%"></div>
          </div>
        </div>
      </div>

      <div style="text-align:center;margin-bottom:12px;font-size:13px;color:var(--text-2)">
        净资产 ${formatMoney(report.netAssets)} · 总资产 ${formatMoney(report.totalAssets)} · 负债 ${formatMoney(report.totalDebt)}
      </div>

      <div class="advice-section">
        <div class="advice-section-title">📋 具体建议</div>
        ${report.advice.map(a => `
          <div class="advice-item">
            <span class="advice-tag ${a.tag}">${a.tagText}</span>
            <span>${a.text}</span>
          </div>
        `).join('')}
      </div>
    `;
    document.getElementById('advice-content').innerHTML = html;
  }

  /* ---------- 预算 ---------- */
  async function openBudgetModal() {
    document.getElementById('modal-budget').classList.add('show');
    const now = new Date();
    const monthKey = now.getFullYear() + '-' + (now.getMonth() + 1);
    const budgets = await DB.getBudgetByMonth(monthKey);
    const totalBudget = budgets.find(b => b.category === 'total');
    if (totalBudget) document.getElementById('budget-total').value = totalBudget.amount;

    const cats = Categories.getByType('expense');
    const catHtml = cats.map(c => {
      const b = budgets.find(x => x.category === c.id);
      return `
        <div class="budget-cat-row">
          <span class="budget-cat-icon">${c.icon}</span>
          <span class="budget-cat-name">${c.name}</span>
          <input class="budget-cat-input" data-cat="${c.id}" type="number" value="${b ? b.amount : ''}" placeholder="预算">
        </div>
      `;
    }).join('');
    document.getElementById('budget-category-list').innerHTML = catHtml;
  }

  function closeBudgetModal() {
    document.getElementById('modal-budget').classList.remove('show');
  }

  async function saveBudget() {
    const now = new Date();
    const monthKey = now.getFullYear() + '-' + (now.getMonth() + 1);
    const total = parseFloat(document.getElementById('budget-total').value) || 0;

    if (total > 0) {
      await DB.saveBudget({ id: 'budget_' + monthKey + '_total', month: monthKey, category: 'total', amount: total });
    }

    document.querySelectorAll('.budget-cat-input').forEach(input => {
      const val = parseFloat(input.value) || 0;
      if (val > 0) {
        DB.saveBudget({ id: 'budget_' + monthKey + '_' + input.dataset.cat, month: monthKey, category: input.dataset.cat, amount: val });
      }
    });

    toast('预算已保存');
    closeBudgetModal();
  }

  /* ---------- 分类管理 ---------- */
  function openCategoryModal() {
    catMgmtType = 'expense';
    document.getElementById('modal-categories').classList.add('show');
    document.querySelectorAll('.cat-mgmt-tab').forEach(x => x.classList.remove('active'));
    document.querySelector('.cat-mgmt-tab[data-type="expense"]').classList.add('active');
    resetCatAddForm();
    renderCategoryList();
  }

  function closeCategoryModal() {
    document.getElementById('modal-categories').classList.remove('show');
  }

  // 预设图标列表 — 按支出/收入分开
  const PRESET_ICONS_EXPENSE = [
    // 餐饮美食
    '🍚','🍜','🍔','🍰','☕','🍺','🍱','🍲','🥐','🍿','🧋','🍩','🥡','🍕',
    // 交通出行
    '🚌','🚇','✈️','🚲','🚗','⛽','🚕','🚄','🛵','🚢','🚶','🅿️',
    // 购物服饰
    '🛒','👗','💄','👟','👔','💍','⌚','👜','👒','🧥',
    // 房租住房
    '🏠','💡','💧','🔧','🏡','🛏️','🚿','🪴','🛋️','🔑',
    // 医疗药品
    '🏥','💊','🩺','🦷','💉','🩹','🧪','🤒',
    // 教育学习
    '📚','🎓','✏️','📝','💻','🔬','📖','🎒',
    // 娱乐电影
    '🎬','🎮','🎵','🏋️','🎤','🎸','⚽','🏀','🎱','🎳','🎪','🎯',
    // 通讯
    '📞','📶','📡','📱',
    // 人情红包
    '🧧','🎁','💝','🌸','🎊',
    // 宠物
    '🐱','🐶','🐾','🦴',
    // 日用品
    '🧴','🧹','🧻','🪥','🧺',
    // 其他支出
    '💳','💰','📦','💸','🛡️','🔐'
  ];

  const PRESET_ICONS_INCOME = [
    // 工资薪资
    '💵','💴','💶','💷','💰','🪙',
    // 奖金
    '🏆','🎖️','🥇','🎁','🏅',
    // 兼职
    '💼','👜','⏰','📋','🖊️',
    // 理财投资
    '📈','📊','💹','🏦','💎','🪴','🏠','📉',
    // 红包
    '🧧','🎊','🎈','💝',
    // 转账
    '💸','↔️','🔄','💳','🏧',
    // 退款
    '↩️','💲','♻️',
    // 租金收益
    '🏠','🏢','🔑','🏘️','📄',
    // 其他收入
    '✨','🪙','💡','🎯'
  ];

  let selectedCatIcon = '❓';

  function renderPresetIcons() {
    const grid = document.getElementById('preset-icon-grid');
    if (!grid) return;
    // 根据当前分类管理 tab 展示不同图标
    const icons = catMgmtType === 'income' ? PRESET_ICONS_INCOME : PRESET_ICONS_EXPENSE;
    grid.innerHTML = icons.map(icon => {
      const sel = icon === selectedCatIcon ? ' selected' : '';
      return '<div class="preset-icon-item' + sel + '" data-icon="' + icon + '">' + icon + '</div>';
    }).join('');

    grid.querySelectorAll('.preset-icon-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedCatIcon = item.dataset.icon;
        const preview = document.getElementById('cat-icon-preview');
        preview.textContent = selectedCatIcon;
        preview.classList.add('has-icon');
        grid.querySelectorAll('.preset-icon-item').forEach(x => x.classList.remove('selected'));
        item.classList.add('selected');
      });
    });
  }

  function resetCatAddForm() {
    selectedCatIcon = '❓';
    document.getElementById('new-cat-name').value = '';
    const customIcon = document.getElementById('new-cat-custom-icon');
    if (customIcon) customIcon.value = '';
    const preview = document.getElementById('cat-icon-preview');
    preview.textContent = '❓';
    preview.classList.remove('has-icon');
    renderPresetIcons();
  }

  // 自定义图标输入实时预览
  on('new-cat-custom-icon', 'input', (e) => {
    const val = e.target.value.trim();
    const preview = document.getElementById('cat-icon-preview');
    if (val) {
      preview.textContent = val;
      preview.classList.add('has-icon');
      selectedCatIcon = val;
      // 取消预设图标的选中状态
      document.querySelectorAll('.preset-icon-item').forEach(x => x.classList.remove('selected'));
    } else {
      preview.textContent = selectedCatIcon || '❓';
      if (selectedCatIcon === '❓') preview.classList.remove('has-icon');
    }
  });

  function renderCategoryList() {
    const cats = Categories.getByType(catMgmtType);
    const isPreset = id => id.startsWith('cat_') && [
      'cat_food','cat_transport','cat_shopping','cat_living','cat_entertainment',
      'cat_medical','cat_education','cat_communication','cat_transfer','cat_finance',
      'cat_other_expense','cat_salary','cat_bonus','cat_investment','cat_reimburse',
      'cat_redpacket','cat_other_income'
    ].includes(id);

    const html = cats.map(c => `
      <div class="cm-item">
        <span class="cm-icon">${c.icon}</span>
        <span class="cm-name">${c.name}</span>
        ${isPreset(c.id)
          ? '<button class="cm-badge" data-id="' + c.id + '">预设</button>'
          : '<button class="cm-edit" data-id="' + c.id + '">编辑</button><button class="cm-delete" data-id="' + c.id + '">删除</button>'}
      </div>
    `).join('');
    document.getElementById('cat-mgmt-list').innerHTML = html;

    document.querySelectorAll('.cm-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await showConfirm({ title: '删除分类', message: '确定删除此分类？已归类到此分类的记录将变为"其他"分类。', danger: true })) return;
        await DB.deleteCategory(btn.dataset.id);
        await Categories.refresh();
        renderCategoryList();
        toast('分类已删除');
      });
    });

    document.querySelectorAll('.cm-edit').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cat = Categories.getById(btn.dataset.id);
        if (!cat) return;
        const name = await showPrompt({ title: '编辑分类', defaultValue: cat.name, placeholder: '分类名称' });
        if (!name) return;
        const icon = await showPrompt({ title: '编辑图标', defaultValue: cat.icon, placeholder: 'emoji图标' });
        cat.name = name;
        if (icon) cat.icon = icon;
        await DB.saveCategory(cat);
        await Categories.refresh();
        renderCategoryList();
        toast('分类已更新');
      });
    });

    document.querySelectorAll('.cm-badge').forEach(btn => {
      btn.addEventListener('click', async () => {
        await restoreSingleCategory(btn.dataset.id);
      });
    });
  }

  async function restoreSingleCategory(id) {
    const defaults = Categories.getDefaultCategories();
    const def = [...defaults.expense, ...defaults.income].find(c => c.id === id);
    if (!def) return;

    const cat = Categories.getById(id);
    if (!cat) return;
    if (cat.name === def.name && cat.icon === def.icon) {
      toast('该分类已是默认设置');
      return;
    }

    if (!await showConfirm({
      title: '恢复预设',
      message: `确定将“${cat.name}”恢复为默认名称和图标吗？`,
      danger: false
    })) return;

    cat.name = def.name;
    cat.icon = def.icon;
    cat.keywords = def.keywords;
    await DB.saveCategory(cat);
    await Categories.refresh();
    renderCategoryList();
    toast('已恢复为默认分类');
  }

  async function addCategory() {
    const name = document.getElementById('new-cat-name').value.trim();
    const customIconEl = document.getElementById('new-cat-custom-icon');
    const customIcon = customIconEl ? customIconEl.value.trim() : '';
    const icon = customIcon || selectedCatIcon;
    if (!name) { toast('请输入分类名称'); return; }

    await DB.saveCategory({
      id: 'cat_custom_' + Date.now(),
      name,
      icon,
      color: '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0'),
      type: catMgmtType,
      keywords: []
    });
    await Categories.refresh();
    resetCatAddForm();
    renderCategoryList();
    toast('分类已添加');
  }

  async function restoreDefaultCategories() {
    if (!await showConfirm({ title: '恢复预设分类', message: '将恢复被删除的预设分类，并更新现有预设分类的图标/名称。自定义分类不会被删除。', danger: false })) return;

    const defaults = Categories.getDefaultCategories();
    const allDefaults = [...defaults.expense, ...defaults.income];
    const existing = await DB.getCategories();

    for (const def of allDefaults) {
      const cur = existing.find(c => c.id === def.id);
      if (cur) {
        // 更新为默认名称/图标/关键词，保留用户颜色
        cur.name = def.name;
        cur.icon = def.icon;
        cur.keywords = def.keywords;
        await DB.saveCategory(cur);
      } else {
        await DB.saveCategory({ ...def });
      }
    }

    await Categories.refresh();
    renderCategoryList();
    toast('预设分类已恢复');
  }

  /* ---------- 数据操作 ---------- */
  async function exportData() {
    const transactions = await DB.getAllTransactions();
    const accounts = await DB.getAccounts();
    const data = { transactions, accounts, exportDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '财务数据备份_' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('数据已导出');
  }

  async function clearAllData() {
    if (await showConfirm({ title: '清空数据', message: '确定要清空所有数据吗？此操作不可恢复！<br><br>建议先导出数据备份。', danger: true })) {
      await DB.clearAll();
      await initDefaultAccounts();
      toast('数据已清空');
      refreshAll();
    }
  }

  /* ---------- 备份还原 ---------- */
  function openRestoreModal() {
    document.getElementById('modal-restore').classList.add('show');
    document.getElementById('restore-file-input').value = '';
  }

  function closeRestoreModal() {
    document.getElementById('modal-restore').classList.remove('show');
  }

  async function handleRestoreFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.transactions || !data.accounts) {
        toast('备份文件格式不正确，缺少交易或账户数据');
        return;
      }
      if (!await showConfirm({
        title: '还原备份',
        message: [
          '即将还原备份数据：',
          '• ' + data.transactions.length + ' 条交易记录',
          '• ' + data.accounts.length + ' 个账户',
          '',
          '⚠ 此操作将覆盖当前所有数据，确定继续？'
        ],
        danger: true
      })) return;

      await DB.bulkRestore(data);
      await Categories.refresh();
      await initDefaultAccounts();
      toast('备份还原成功！');
      closeRestoreModal();
      refreshAll();
    } catch (err) {
      toast('文件读取失败：' + err.message);
    }
  }

  /* ---------- 每日理财贴士 ---------- */
  const FINANCE_TIPS = [
    '记账是理财的第一步。清楚每一笔花在哪里，才能知道哪里该节流。',
    '4321 法则：40% 投资、30% 生活、20% 储蓄、10% 保险，适合稳健型家庭。',
    '坚持基金定投，用时间换空间。每月固定金额投入，穿越牛熊周期。',
    '应急基金至少要覆盖 3-6 个月的必要生活开支，放在随时可取的地方。',
    '学会区分"想要"和"需要"。下单前问自己：这个东西真的是必需品吗？',
    '复利是世界第八大奇迹。存 1 万，年化 6%，30 年后变成 5.7 万。',
    '消费升级是陷阱。收入增加时先提高储蓄率，而不是提高消费水平。',
    '信用卡不是免费的钱。分期手续费折算成年化利率可能高达 15% 以上。',
    '每月拿到工资先存后花。月初自动转出 20% 到储蓄账户，强迫储蓄。',
    '保险配置顺序：意外险 > 医疗险 > 重疾险 > 寿险。先保障后投资。',
    '不要把所有鸡蛋放在一个篮子里。分散投资是降低风险的核心策略。',
    '消费降级不等于生活降级。缩减外食、少买优衣库也可以过得好。',
    '预算不是限制自由，而是把钱花在对的地方。设置预算后你反而更自由。',
    '低收入者先投资自己，提升能力比任何理财产品回报率都高。',
    '记账不是为了省钱，是为了让每一笔钱都花得明明白白。',
    '每年至少做一次财务复盘，回顾过去一年的收支结构和净值变化。',
    '房贷利息可以抵扣个税，别忘了在个税申报时填写专项附加扣除。',
    '年轻的你最大的资产是时间。25 岁开始定投比 35 岁开始，收益差 2 倍。',
    '不要把紧急备用金投入股市。股市波动大，急用钱时可能被迫亏损卖出。',
    '消费型支出和投资型支出要分开记账，后者可能创造长期回报。',
    '50/30/20 预算法则：50% 必要开支、30% 可选消费、20% 储蓄投资。',
    '提高财商最快的方式是阅读。推荐《穷爸爸富爸爸》《小狗钱钱》。',
    '学会拒绝借钱给朋友，除非你做好这笔钱收不回来的准备。',
    '投资中最大的敌人不是市场，而是恐慌和贪婪。保持理性定投。',
    '每月复盘一次账单，你会发现很多小额支出累积起来非常惊人。',
    '定期检查订阅服务（视频会员、APP 付费），关掉不用的，一年省上千元。',
    '通货膨胀是隐形的财富杀手。只存银行活期，20 年后购买力缩水一半。',
    '资产配置不等于频繁交易。每年平衡一次投资组合往往效果最好。',
    '财富自由的公式：被动收入 > 日常支出。先提升储蓄率，再追求收益率。',
    '金钱是工具，不是目的。理财的终极目标是让你有更多选择权和自由时间。'
  ];

  function showDailyTip(forceNew) {
    const key = 'daily_tip_index';
    const dateKey = 'daily_tip_date';
    const today = new Date().toISOString().split('T')[0];

    let idx = parseInt(localStorage.getItem(key)) || 0;
    let storedDate = localStorage.getItem(dateKey);

    if (storedDate !== today || forceNew) {
      // 新的一天或强制刷新，换一条
      let newIdx;
      do {
        newIdx = Math.floor(Math.random() * FINANCE_TIPS.length);
      } while (newIdx === idx && FINANCE_TIPS.length > 1);
      idx = newIdx;
      localStorage.setItem(key, idx);
      localStorage.setItem(dateKey, today);
    }

    document.getElementById('daily-tip-content').textContent = FINANCE_TIPS[idx];
  }

  /* ---------- 月度导入提醒 ---------- */
  async function checkMonthlyReminder() {
    const btn = document.getElementById('header-import-btn');
    const badge = document.getElementById('import-btn-badge');
    const dismissedKey = 'reminder_dismissed_month';

    const now = new Date();
    const thisMonth = now.getFullYear() + '-' + (now.getMonth() + 1);

    // 检查是否启用了提醒
    const enabled = await DB.getSetting('monthlyReminderEnabled');
    if (enabled === 'false') {
      btn.style.display = 'none';
      return;
    }

    // 检查本月是否已导入
    let imported = {};
    try { imported = JSON.parse(await DB.getSetting('importedMonths') || '{}'); } catch(e) {}

    const monthImported = imported[thisMonth] || {};
    const wxDone = monthImported.wechat;
    const aliDone = monthImported.alipay;

    // 检查是否被用户手动关闭了
    const dismissedMonth = localStorage.getItem(dismissedKey);
    const isDismissed = dismissedMonth === thisMonth;
    const allDone = wxDone && aliDone;

    if (allDone || isDismissed) {
      // 全导完了或手动关闭 → 普通按钮（始终可见但不高亮）
      btn.style.display = '';
      btn.classList.remove('has-reminder');
      badge.style.display = 'none';
    } else {
      // 有待导入 → 高亮 + 脉冲动画 + 红点
      btn.style.display = '';
      btn.classList.add('has-reminder');
      badge.style.display = 'block';
    }
  }

  function dismissReminder() {
    const now = new Date();
    const thisMonth = now.getFullYear() + '-' + (now.getMonth() + 1);
    localStorage.setItem('reminder_dismissed_month', thisMonth);
    checkMonthlyReminder();
    toast('本月不再提醒');
  }

  async function toggleMonthlyReminder() {
    const enabled = await DB.getSetting('monthlyReminderEnabled');
    const newState = enabled !== 'false';
    await DB.setSetting('monthlyReminderEnabled', newState ? 'false' : 'true');
    updateReminderToggle(newState ? false : true);
    toast(newState ? '已关闭每月导入提醒' : '已开启每月导入提醒');
  }

  async function updateReminderToggle(on) {
    const toggle = document.getElementById('toggle-monthly-reminder');
    if (on) toggle.classList.add('on');
    else toggle.classList.remove('on');
  }

  /* ---------- 辅助函数 ---------- */
  function refreshAll() {
    if (currentPage === 'home') refreshHome();
    else if (currentPage === 'records') refreshRecords();
    else if (currentPage === 'stats') refreshStats();
    else if (currentPage === 'profile') refreshProfile();
  }

  function formatMoney(amount) {
    return '¥' + formatNum(amount);
  }

  function formatNum(amount) {
    return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** 将 Date 对象转为本地日期字符串 YYYY-MM-DD（避免 toISOString 时区偏移） */
  function fmtLocalDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timeout);
    el._timeout = setTimeout(() => el.classList.remove('show'), 2000);
  }

  /**
   * 自定义确认弹窗（移动端替代浏览器原生 confirm）
   * @param {Object} opts { title, message, okText, cancelText, danger }
   * @returns {Promise<boolean>}
   */
  function showConfirm({ title = '确认', message, okText = '确定', cancelText = '取消', danger = false } = {}) {
    return new Promise(resolve => {
      const overlay = document.getElementById('modal-confirm');
      const titleEl = document.getElementById('confirm-title');
      const msgEl = document.getElementById('confirm-message');
      const okBtn = document.getElementById('confirm-ok');
      const cancelBtn = document.getElementById('confirm-cancel');

      titleEl.textContent = title;
      // 支持消息为字符串或对象数组（多行带格式）
      if (Array.isArray(message)) {
        msgEl.innerHTML = message.map(line => '<div style="margin:6px 0">' + line + '</div>').join('');
      } else {
        msgEl.innerHTML = '<div>' + (message || '') + '</div>';
      }
      okBtn.textContent = okText;
      cancelBtn.textContent = cancelText;
      okBtn.className = 'confirm-btn' + (danger ? ' danger' : ' primary');

      const cleanup = (result) => {
        overlay.classList.remove('show');
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        overlay.onclick = null;
        resolve(result);
      };

      overlay.classList.add('show');
      okBtn.onclick = () => cleanup(true);
      cancelBtn.onclick = () => cleanup(false);
      // 点击遮罩层视为取消
      overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
    });
  }

  /**
   * 自定义输入弹窗（移动端替代 prompt）
   * @param {Object} opts { title, placeholder, defaultValue, okText, cancelText, maxLength }
   * @returns {Promise<string|null>}
   */
  function showPrompt({ title = '输入', placeholder = '', defaultValue = '', okText = '确定', cancelText = '取消', maxLength = 20 } = {}) {
    return new Promise(resolve => {
      const overlay = document.getElementById('modal-prompt');
      const titleEl = document.getElementById('prompt-title');
      const input = document.getElementById('prompt-input');
      const okBtn = document.getElementById('prompt-ok');
      const cancelBtn = document.getElementById('prompt-cancel');

      titleEl.textContent = title;
      input.value = defaultValue;
      input.maxLength = maxLength;
      input.placeholder = placeholder;
      okBtn.textContent = okText;
      cancelBtn.textContent = cancelText;

      const cleanup = (result) => {
        overlay.classList.remove('show');
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        overlay.onclick = null;
        resolve(result);
      };

      overlay.classList.add('show');
      setTimeout(() => { input.focus(); input.select(); }, 100);
      okBtn.onclick = () => cleanup(input.value.trim() || null);
      cancelBtn.onclick = () => cleanup(null);
      overlay.onclick = (e) => { if (e.target === overlay) cleanup(null); };
    });
  }

  /* ---------- 启动 ---------- */
  // 服务端模式下认证事件已由内联脚本处理
  init().then(() => {
    console.log('[App] 财务工作台已就绪');
  }).catch(err => {
    console.error('[App] 启动失败:', err);
    document.body.innerHTML = '<div style="padding:40px;text-align:center;color:red;"><h3>启动失败</h3><p>' + err.message + '</p></div>';
  });

  return {
    openAddModal,
    openEditModal
  };
})();
