/* ==================== 认证管理 ==================== */
const Auth = (() => {
  let currentUser = null;

  function getToken() {
    return localStorage.getItem('finance_token');
  }

  function setToken(token) {
    localStorage.setItem('finance_token', token);
  }

  function clearToken() {
    localStorage.removeItem('finance_token');
  }

  function setUser(user) {
    currentUser = user;
    localStorage.setItem('finance_user', JSON.stringify(user));
  }

  function getUser() {
    if (currentUser) return currentUser;
    const stored = localStorage.getItem('finance_user');
    if (stored) {
      try { currentUser = JSON.parse(stored); } catch (e) {}
    }
    return currentUser;
  }

  function isLoggedIn() {
    return !!getToken();
  }

  function isTrialExpired() {
    const user = getUser();
    if (!user) return false;
    if (user.paid) return false;
    const trialEnd = new Date(user.trial_end || user.trial_start);
    if (!user.trial_end) {
      trialEnd.setDate(trialEnd.getDate() + (user.trial_days || 30));
    }
    return new Date() > trialEnd;
  }

  function getTrialRemainingDays() {
    const user = getUser();
    if (!user || user.paid) return -1;
    const trialEnd = new Date(user.trial_end || user.trial_start);
    if (!user.trial_end) {
      trialEnd.setDate(trialEnd.getDate() + (user.trial_days || 30));
    }
    return Math.max(0, Math.ceil((trialEnd - new Date()) / 86400000));
  }

  async function refreshUserInfo() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else if (res.status === 401) {
        logout();
      }
    } catch (e) {
      // 网络错误，忽略
    }
  }

  function logout() {
    clearToken();
    currentUser = null;
    localStorage.removeItem('finance_user');
    showLoginPage();
  }

  function onUnauthorized() {
    logout();
  }

  // ============ 登录/注册页面切换 ============
  function showLoginPage() {
    document.getElementById('app').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'none';
    document.getElementById('page-auth').style.display = 'flex';
  }

  function hideLoginPage() {
    document.getElementById('page-auth').style.display = 'none';
    document.getElementById('app').style.display = '';
    document.getElementById('bottom-nav').style.display = '';
  }

  // ============ 注册（仅手机号+密码） ============
  async function register(phone, password, nickname) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password, nickname })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setToken(data.token);
    setUser(data.user);
    return data;
  }

  // ============ 登录 ============
  async function login(phone, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setToken(data.token);
    setUser(data.user);
    return data;
  }

  // ============ 初始化 — 检查登录状态 ============
  async function initAuth() {
    const token = getToken();
    if (!token) {
      showLoginPage();
      return false;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        hideLoginPage();
        return true;
      } else {
        logout();
        return false;
      }
    } catch (e) {
      // 网络错误也显示登录页
      showLoginPage();
      return false;
    }
  }

  return {
    getToken, setToken, clearToken,
    getUser, setUser,
    isLoggedIn, isTrialExpired, getTrialRemainingDays,
    refreshUserInfo, logout, onUnauthorized,
    showLoginPage, hideLoginPage,
    register, login,
    initAuth
  };
})();
