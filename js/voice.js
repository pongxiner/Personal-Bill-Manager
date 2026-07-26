/* ==================== 语音记账模块 ==================== */

const Voice = (() => {
  let recognition = null;
  let isListening = false;
  let onResult = null;
  let onStatusChange = null;

  // 分类关键词映射
  const categoryKeywords = {
    cat_food: ['吃饭', '午餐', '晚饭', '早餐', '午饭', '外卖', '餐厅', '食堂', '面', '米', '粉', '火锅',
      '烧烤', '小吃', '买菜', '水果', '零食', '超市', '便当', '料理', '串串', '麻辣烫', '粥', '包子', '饺子', '馄饨'],
    cat_transport: ['打车', '地铁', '公交', '加油', '停车', '高铁', '火车', '机票', '飞机', '滴滴', '共享单车',
      '出租车', '专车', '顺风车', '油费', '过路费', '车票', '摩拜', '哈啰', '青桔'],
    cat_shopping: ['买', '购物', '淘宝', '京东', '拼多多', '衣服', '鞋', '包', '化妆品', '数码', '手机',
      '电脑', '家电', '日用品', '超市', '沃尔玛', '山姆', '盒马', '唯品会', '得物'],
    cat_entertainment: ['电影', '游戏', '音乐', 'KTV', '演唱会', '剧本杀', '密室', '游乐场', '视频会员',
      '腾讯视频', '爱奇艺', '哔哩哔哩', 'B站', '王者', '原神', 'Steam', '网咖'],
    cat_beverage: ['咖啡', '奶茶', '茶', '星巴克', '瑞幸', '喜茶', '奈雪', '蜜雪冰城', '茶颜', '霸王茶姬',
      'Coco', '一点点', '饮料', '气泡水', '柠檬茶'],
    cat_living: ['房租', '水电', '物业', '电费', '水费', '燃气', '煤气', '网费', '宽带', '修理', '保洁',
      '维修', '暖气', '停车费'],
    cat_medical: ['医院', '看病', '药', '体检', '挂号', '诊所', '牙医', '中医', '药店', '急诊', '手术', '住院'],
    cat_education: ['课', '培训', '书', '网课', '报名', '考试', '学费', '教材', '辅导', '考证', '教程'],
    cat_communication: ['话费', '流量', '手机费', '通讯', '运营', '移动', '联通', '电信'],
    cat_beauty: ['理发', '美容', '护肤', '按摩', 'SPA', '美甲', '美妆', '发型', 'spa', '脱毛', '瘦身'],
    cat_gift: ['红包', '礼物', '送礼', '随份子', '结婚', '生日', '压岁钱', '人情'],
    cat_travel: ['旅游', '酒店', '民宿', '景点', '门票', '旅行', '度假', '签证', '护照'],
  };

  const incomeKeywords = {
    cat_salary: ['工资', '薪水', '奖金', '年终奖', '绩效', '提成', '加班', '补贴', '津贴'],
    cat_freelance: ['兼职', '外快', '接私活', '副业', '设计费', '稿费', '咨询费'],
    cat_investment: ['理财', '利息', '分红', '股票', '基金', '租金', '投资'],
    cat_redpacket: ['红包', '收的红包', '收到红包'],
    cat_other_income: ['退款', '报销', '退税', '返现', '白嫖'],
  };

  /* ---------- 初始化语音识别 ---------- */
  function init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return false;

    recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      if (final && onResult) {
        onResult(final+interim);
        stop();
      }
      if (interim && onStatusChange) {
        onStatusChange('listening', interim);
      }
    };

    recognition.onstart = () => {
      isListening = true;
      if (onStatusChange) onStatusChange('started', '');
    };

    recognition.onend = () => {
      isListening = false;
      if (onStatusChange) onStatusChange('ended', '');
    };

    recognition.onerror = (event) => {
      isListening = false;
      if (onStatusChange) onStatusChange('error', event.error);
    };

    return true;
  }

  /* ---------- 开始/停止监听 ---------- */
  function start(resultsCallback, statusCallback) {
    onResult = resultsCallback;
    onStatusChange = statusCallback;

    if (!recognition || !isListening) {
      // 重新初始化（某些浏览器每次需要新建实例）
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'zh-CN';
        recognition.interimResults = true;
        recognition.continuous = false;

        recognition.onresult = (event) => {
          let interim = '';
          let final = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript;
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          if (final && onResult) {
            onResult(final+interim);
            stop();
          }
          if (interim && onStatusChange) {
            onStatusChange('listening', interim);
          }
        };
        recognition.onstart = () => { isListening = true; if (onStatusChange) onStatusChange('started', ''); };
        recognition.onend = () => { isListening = false; if (onStatusChange) onStatusChange('ended', ''); };
        recognition.onerror = (event) => { isListening = false; if (onStatusChange) onStatusChange('error', event.error); };
      }
    }

    if (!recognition) return;

    try {
      recognition.start();
    } catch (e) {
      // 可能已经在运行
    }
  }

  function stop() {
    if (recognition) {
      try { recognition.stop(); } catch (e) {}
    }
    isListening = false;
  }

  /* ---------- 核心：自然语言解析 ---------- */
  function parseVoice(text) {
    const result = {
      type: 'expense',      // expense / income
      amount: 0,
      category: null,
      note: '',
      confidence: 0         // 0-1 解析置信度
    };

    // 清理文本
    let raw = text.trim()
      .replace(/[，。！？、；：""''（）《》【】…—\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!raw) return result;

    result.note = raw;

    // --- 1. 判断收入还是支出 ---
    const incomeIndicators = ['收入', '工资', '奖金', '发了', '入账', '收到', '报销', '退款', '退税', '返现', '兼职', '外快'];
    const expenseIndicators = ['花了', '付了', '支付', '支出', '买了', '花了钱', '消费', '扣了', '用了'];

    let isIncome = incomeIndicators.some(w => raw.includes(w));
    let isExpense = expenseIndicators.some(w => raw.includes(w));

    if (isIncome && !isExpense) {
      result.type = 'income';
    } else if (!isIncome && isExpense) {
      result.type = 'expense';
    }

    // --- 2. 提取金额 ---
    result.amount = 0;

    // 匹配 "xx元" "xx块" "xxx元" "xx块钱"
    let m = raw.match(/(\d+(?:\.\d{1,2})?)\s*(?:元|块|¥|￥)/);
    if (m) {
      result.amount = parseFloat(m[1]);
    }

    // 匹配 "xxx元" 如 "一百二十元" "三百五"
    if (result.amount === 0) {
      const chineseNum = parseChineseNumber(raw);
      if (chineseNum > 0) result.amount = chineseNum;
    }

    // 直接数字提取（如 "午餐35 块"）
    if (result.amount === 0) {
      m = raw.match(/(\d+(?:\.\d{1,2})?)/);
      if (m && parseFloat(m[1]) >= 1 && parseFloat(m[1]) <= 100000) {
        result.amount = parseFloat(m[1]);
      }
    }

    // 匹配 "花了xx" "消费了xx"
    if (result.amount === 0) {
      m = raw.match(/(?:花了|消费|付了|支付了|用了)\s*(\d+(?:\.\d{1,2})?)/);
      if (m) result.amount = parseFloat(m[1]);
    }

    // --- 3. 推断分类 ---
    result.category = detectCategory(raw, result.type);

    // --- 4. 计算置信度 ---
    result.confidence = 0;
    if (result.amount > 0) result.confidence += 0.5;
    if (result.category) result.confidence += 0.5;

    // --- 5. 生成简短备注 ---
    if (result.note.length > 20) {
      result.note = result.note.substring(0, 20);
    }

    return result;
  }

  /* ---------- 中文数字解析 ---------- */
  function parseChineseNumber(text) {
    const digits = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
    const units = { '十': 10, '百': 100, '千': 1000, '万': 10000 };

    // 匹配 xxx元 模式
    let m = text.match(/(?:(.)[千百十]?)+(?:元|块|¥|￥)/);
    if (!m) return 0;

    let prefix = text.substring(0, m.index);
    let num = 0;
    let temp = 0;

    for (let i = prefix.length - 1; i >= 0; i--) {
      // 找包含数字的部分
    }

    // 简化版：只处理"xx块"或"xx元"前面的内容
    m = text.match(/([一二两三四五六七八九十百千万]+)\s*(?:块钱|元|块|¥|￥)/);
    if (!m) return 0;

    const cn = m[1];
    let result = 0;
    let current = 0;

    for (let i = 0; i < cn.length; i++) {
      const ch = cn[i];
      if (digits[ch] !== undefined) {
        current = digits[ch];
      } else if (units[ch] !== undefined) {
        if (ch === '万') {
          result = (result + (current || 1)) * 10000;
          current = 0;
        } else {
          current = (current || 1) * units[ch];
          result += current;
          current = 0;
        }
      }
    }
    result += current;

    return result > 0 ? result : 0;
  }

  /* ---------- 分类检测 ---------- */
  function detectCategory(text, type) {
    text = text.toLowerCase();

    const keywordMap = type === 'income' ? incomeKeywords : categoryKeywords;

    let bestCategory = null;
    let bestScore = 0;

    for (const [catId, keywords] of Object.entries(keywordMap)) {
      let score = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) {
          score += kw.length; // 越长关键词权重越高
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestCategory = catId;
      }
    }

    // 默认分类
    if (!bestCategory) {
      bestCategory = type === 'income' ? 'cat_other_income' : 'cat_other_expense';
    }

    return bestCategory;
  }

  /* ---------- 检查浏览器支持 ---------- */
  function isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /* ---------- 获取语音文案 ---------- */
  function getPromptExamples() {
    return [
      '午餐花了35块钱',
      '打车25元',
      '星巴克咖啡38块',
      '买了一件衣服199',
      '买菜花了80',
      '工资收入15000',
      '地铁6块',
      '便利店买零食花了28元'
    ];
  }

  return {
    init,
    start,
    stop,
    parseVoice,
    isSupported,
    getPromptExamples,
    isListening: () => isListening
  };
})();
