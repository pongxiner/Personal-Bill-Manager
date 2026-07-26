/* ==================== 分类系统 ==================== */

const Categories = (() => {
  // 默认支出分类
  const DEFAULT_EXPENSE = [
    { id: 'cat_food', name: '餐饮', icon: '🍜', color: '#ff7875', type: 'expense', keywords: ['餐', '饭', '食', '外卖', '美团', '饿了么', '麦当劳', '肯德基', '星巴克', '咖啡', '奶茶', '火锅', '烧烤', '面', '粉', '饼', '饺子', '馄饨', '早餐', '午餐', '晚餐', '夜宵', '小吃', '零食', '饮料', '酒', '茶', '甜品', '蛋糕', '面包', '便利店', '超市'] },
    { id: 'cat_transport', name: '交通', icon: '🚗', color: '#597ef7', type: 'expense', keywords: ['滴滴', '出租', '地铁', '公交', '高铁', '火车', '机票', '航空', '加油', '停车', '过路', '高速', '单车', '骑行', '哈啰', '出行', '车票', '机票'] },
    { id: 'cat_shopping', name: '购物', icon: '🛍️', color: '#ffa940', type: 'expense', keywords: ['淘宝', '京东', '拼多多', '天猫', '苏宁', '唯品', '得物', '购物', '商品', '衣服', '鞋', '包', '数码', '电器', '家具', '家居', '日用品'] },
    { id: 'cat_living', name: '居住', icon: '🏠', color: '#9254de', type: 'expense', keywords: ['房租', '租金', '水电', '物业', '燃气', '宽带', '网费', '暖气', '供暖', '维修', '家装'] },
    { id: 'cat_entertainment', name: '娱乐', icon: '🎮', color: '#36cfc9', type: 'expense', keywords: ['电影', 'KTV', '游戏', '娱乐', '演出', '门票', '旅游', '酒店', '民宿', '景点', '密室', '剧本杀', '直播', '打赏'] },
    { id: 'cat_medical', name: '医疗', icon: '💊', color: '#ff85c0', type: 'expense', keywords: ['医院', '药', '诊所', '体检', '挂号', '牙科', '眼科', '保健', '健康'] },
    { id: 'cat_education', name: '教育', icon: '📚', color: '#73d13d', type: 'expense', keywords: ['书', '书店', '培训', '学费', '课程', '网课', '考试', '学习', '教育'] },
    { id: 'cat_communication', name: '通讯', icon: '📱', color: '#ffc53d', type: 'expense', keywords: ['话费', '流量', '宽带', '充值', '通讯'] },
    { id: 'cat_transfer', name: '转账', icon: '💸', color: '#bfbfbf', type: 'expense', keywords: ['转账', '红包', '代付', 'AA'] },
    { id: 'cat_finance', name: '金融', icon: '💰', color: '#d48806', type: 'expense', keywords: ['理财', '基金', '股票', '保险', '贷款', '还款', '信用卡', '利息', '手续费'] },
    { id: 'cat_other_expense', name: '其他', icon: '📦', color: '#8c8c8c', type: 'expense', keywords: [] }
  ];

  // 默认收入分类
  const DEFAULT_INCOME = [
    { id: 'cat_salary', name: '工资', icon: '💵', color: '#52c41a', type: 'income', keywords: ['工资', '薪资', '薪水'] },
    { id: 'cat_bonus', name: '奖金', icon: '🎁', color: '#73d13d', type: 'income', keywords: ['奖金', '年终', '绩效', '提成'] },
    { id: 'cat_investment', name: '理财收益', icon: '📈', color: '#36cfc9', type: 'income', keywords: ['利息', '分红', '收益', '收益分配', '赎回'] },
    { id: 'cat_reimburse', name: '报销', icon: '🧾', color: '#597ef7', type: 'income', keywords: ['报销', '退款', '退'] },
    { id: 'cat_redpacket', name: '红包', icon: '🧧', color: '#ff4d4f', type: 'income', keywords: ['红包', '转账'] },
    { id: 'cat_other_income', name: '其他', icon: '📋', color: '#8c8c8c', type: 'income', keywords: [] }
  ];

  let categories = [];
  let initialized = false;

  async function init() {
    if (initialized) return;
    const stored = await DB.getCategories();
    if (stored.length === 0) {
      // 首次使用，写入默认分类
      const all = [...DEFAULT_EXPENSE, ...DEFAULT_INCOME];
      for (const c of all) {
        await DB.saveCategory(c);
      }
      categories = all;
    } else {
      categories = stored;
    }
    initialized = true;
  }

  function getAll() {
    return categories;
  }

  function getByType(type) {
    return categories.filter(c => c.type === type);
  }

  function getById(id) {
    return categories.find(c => c.id === id);
  }

  /**
   * 根据交易描述自动匹配分类
   * @param {string} desc - 交易对方或商品名称
   * @param {string} type - income/expense
   * @returns {object} 匹配的分类对象
   */
  function autoMatch(desc, type) {
    if (!desc) return getByType(type).find(c => c.id.includes('other')) || categories[0];
    const text = desc.toLowerCase();
    const list = getByType(type);
    let bestMatch = null;
    let bestScore = 0;
    for (const cat of list) {
      if (!cat.keywords || cat.keywords.length === 0) continue;
      for (const kw of cat.keywords) {
        if (text.includes(kw.toLowerCase())) {
          const score = kw.length; // 更长的关键词匹配更精确
          if (score > bestScore) {
            bestScore = score;
            bestMatch = cat;
          }
        }
      }
    }
    return bestMatch || list.find(c => c.id.includes('other')) || categories[0];
  }

  function getColor(id) {
    const c = getById(id);
    return c ? c.color : '#8c8c8c';
  }

  function getIcon(id) {
    const c = getById(id);
    return c ? c.icon : '📦';
  }

  function getName(id) {
    const c = getById(id);
    return c ? c.name : '未知';
  }

  async function refresh() {
    categories = await DB.getCategories();
  }

  function getDefaultCategories() {
    return { expense: DEFAULT_EXPENSE, income: DEFAULT_INCOME };
  }

  return {
    init,
    getAll,
    getByType,
    getById,
    autoMatch,
    getColor,
    getIcon,
    getName,
    refresh,
    getDefaultCategories
  };
})();
