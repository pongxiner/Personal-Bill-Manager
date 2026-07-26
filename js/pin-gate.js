/**
 * PIN 密码锁 — 保护财务数据不被他人访问
 * 首次访问：设置 6 位 PIN
 * 后续访问：输入 PIN 解锁
 * PIN 哈希存储在 localStorage，不存储明文
 */
const PinGate = (() => {
  const STORAGE_KEY = 'finance_pin_hash';
  const SALT = 'finance_workbench_salt_2026';

  let pin = '';
  let confirmPin = '';
  let isSetting = false;
  let errorTimeout = null;

  const pinGate = document.getElementById('pin-gate');
  const pinTitle = document.getElementById('pin-title');
  const pinSubtitle = document.getElementById('pin-subtitle');
  const pinDots = document.getElementById('pin-dots');
  const pinError = document.getElementById('pin-error');
  const pinReset = document.getElementById('pin-reset');

  /* 简单的哈希（SHA-256 需要 HTTPS/成熟环境，这里用非加密哈希 + 盐做本地校验） */
  async function hashPin(raw) {
    const data = raw + SALT;
    // 使用 SubtleCrypto（所有现代浏览器都支持）
    try {
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // 降级：简单哈希
      let h = 0;
      for (let i = 0; i < data.length; i++) {
        h = ((h << 5) - h) + data.charCodeAt(i);
        h |= 0;
      }
      return 'fallback_' + Math.abs(h);
    }
  }

  /* 已有密码 → 验证模式；没有 → 设置模式 */
  async function init() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      isSetting = false;
      pinTitle.textContent = '输入密码';
      pinSubtitle.textContent = '请输入 6 位访问密码';
      pinReset.style.display = '';
    } else {
      isSetting = true;
      pinTitle.textContent = '设置访问密码';
      pinSubtitle.textContent = '设置 6 位数字密码保护你的财务数据';
      pinReset.style.display = 'none';
    }
  }

  function renderDots() {
    const dots = pinDots.querySelectorAll('.pin-dot');
    dots.forEach((dot, i) => {
      dot.className = 'pin-dot' + (i < pin.length ? ' filled' : '');
    });
  }

  function showError(msg) {
    pinError.textContent = msg;
    pinError.classList.add('visible');
    clearTimeout(errorTimeout);
    errorTimeout = setTimeout(() => pinError.classList.remove('visible'), 2500);
  }

  function shake() {
    pinDots.classList.add('shake');
    setTimeout(() => pinDots.classList.remove('shake'), 500);
  }

  async function unlock() {
    localStorage.setItem(STORAGE_KEY, await hashPin(pin));
    pinGate.classList.add('pin-gate-hidden');

    // 动画结束后移除
    setTimeout(() => {
      pinGate.style.display = 'none';
    }, 500);
  }

  function appendDigit(d) {
    if (pin.length >= 6) return;
    pin += d;
    renderDots();

    if (pin.length === 6) {
      setTimeout(() => handleComplete(), 150);
    }
  }

  function deleteDigit() {
    if (pin.length === 0) return;
    pin = pin.slice(0, -1);
    renderDots();
  }

  async function handleComplete() {
    if (isSetting) {
      // 设置模式：第一次输入
      if (!confirmPin) {
        confirmPin = pin;
        pin = '';
        renderDots();
        pinTitle.textContent = '确认密码';
        pinSubtitle.textContent = '请再次输入 6 位密码确认';
        return;
      }

      // 确认
      if (pin === confirmPin) {
        await unlock();
      } else {
        showError('两次输入不一致，请重试');
        shake();
        pin = '';
        confirmPin = '';
        renderDots();
        pinTitle.textContent = '设置访问密码';
        pinSubtitle.textContent = '设置 6 位数字密码保护你的财务数据';
      }
    } else {
      // 验证模式
      const stored = localStorage.getItem(STORAGE_KEY);
      const hash = await hashPin(pin);
      if (hash === stored) {
        await unlock();
      } else {
        showError('密码错误，请重试');
        shake();
        pin = '';
        renderDots();
      }
    }
  }

  async function handleReset() {
    if (!confirm('确定要重置吗？这将清除所有财务数据和密码设置，\n你可以在重置后重新设置密码。')) return;
    if (!confirm('再次确认：此操作不可撤销！')) return;

    // 清空 IndexedDB
    try {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        indexedDB.deleteDatabase(db.name);
      }
    } catch { /* ignore */ }

    // 清空 localStorage
    localStorage.clear();

    // 重新初始化
    pin = '';
    confirmPin = '';
    isSetting = true;
    pinTitle.textContent = '设置访问密码';
    pinSubtitle.textContent = '设置 6 位数字密码保护你的财务数据';
    pinReset.style.display = 'none';
    renderDots();
  }

  /* 事件绑定 */
  function bindEvents() {
    document.querySelectorAll('.pin-key[data-key]').forEach(btn => {
      btn.addEventListener('click', () => appendDigit(btn.dataset.key));
    });
    document.querySelector('.pin-key-del').addEventListener('click', deleteDigit);
    pinReset.addEventListener('click', handleReset);

    // 物理键盘
    document.addEventListener('keydown', (e) => {
      if (pinGate.style.display === 'none') return;
      if (e.key >= '0' && e.key <= '9') appendDigit(e.key);
      else if (e.key === 'Backspace' || e.key === 'Delete') deleteDigit();
    });
  }

  /* 启动 */
  init().then(bindEvents);

  return { init, unlock };
})();
