/* ==================== 理财建议引擎 ==================== */

const Advisor = (() => {

  /**
   * 生成完整的理财建议报告
   * @param {Array} transactions - 全部交易
   * @param {Array} accounts - 全部账户
   * @returns {object} 建议报告
   */
  function generateReport(transactions, accounts) {
    const now = new Date();
    const thisMonth = { y: now.getFullYear(), m: now.getMonth() };
    const lastMonth = m => {
      const d = new Date(m.y, m.m - 1, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    };

    // 本月数据
    const monthTx = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === thisMonth.y && d.getMonth() === thisMonth.m;
    });

    const monthIncome = sum(monthTx.filter(t => t.type === 'income'));
    const monthExpense = sum(monthTx.filter(t => t.type === 'expense'));
    const monthBalance = monthIncome - monthExpense;

    // 上月数据
    const lm = lastMonth(thisMonth);
    const lmTx = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === lm.y && d.getMonth() === lm.m;
    });
    const lmIncome = sum(lmTx.filter(t => t.type === 'income'));
    const lmExpense = sum(lmTx.filter(t => t.type === 'expense'));

    // 近3个月平均
    const recent3 = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(thisMonth.y, thisMonth.m - i, 1);
      const tx = transactions.filter(t => {
        const td = new Date(t.date);
        return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
      });
      recent3.push({
        income: sum(tx.filter(t => t.type === 'income')),
        expense: sum(tx.filter(t => t.type === 'expense'))
      });
    }
    const avgIncome = avg(recent3.map(m => m.income));
    const avgExpense = avg(recent3.map(m => m.expense));

    // 储蓄率
    const savingsRate = monthIncome > 0 ? (monthBalance / monthIncome) * 100 : 0;

    // 总资产
    const totalAssets = accounts
      .filter(a => a.type !== 'credit')
      .reduce((s, a) => s + (a.balance || 0), 0);
    const totalDebt = accounts
      .filter(a => a.type === 'credit')
      .reduce((s, a) => s + Math.abs(a.balance || 0), 0);

    // 分类分析
    const expenseByCategory = {};
    monthTx.filter(t => t.type === 'expense').forEach(t => {
      const key = t.category || 'cat_other_expense';
      expenseByCategory[key] = (expenseByCategory[key] || 0) + t.amount;
    });
    const topCategories = Object.entries(expenseByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // 计算健康分
    const score = calcScore(savingsRate, monthExpense, avgExpense, topCategories, totalAssets, totalDebt);

    // 生成建议
    const advice = [];

    // 1. 储蓄率分析
    advice.push(...savingsAdvice(savingsRate, monthIncome, monthExpense));

    // 2. 消费结构分析
    advice.push(...categoryAdvice(topCategories, monthExpense));

    // 3. 环比分析
    advice.push(...trendAdvice(monthExpense, lmExpense, monthIncome, lmIncome));

    // 4. 应急基金
    advice.push(...emergencyFundAdvice(totalAssets, totalDebt, avgExpense));

    // 5. 资产配置建议
    advice.push(...allocationAdvice(monthBalance, savingsRate, avgIncome));

    // 6. 预算建议
    advice.push(...budgetAdvice(topCategories, avgExpense, avgIncome));

    return {
      score,
      scoreLabel: scoreLabel(score),
      scoreColor: scoreColor(score),
      monthIncome,
      monthExpense,
      monthBalance,
      savingsRate,
      totalAssets,
      totalDebt,
      netAssets: totalAssets - totalDebt,
      avgIncome,
      avgExpense,
      topCategories,
      advice
    };
  }

  /* ---------- 健康分计算 ---------- */
  function calcScore(savingsRate, expense, avgExpense, topCats, assets, debt) {
    let score = 60;

    // 储蓄率加分
    if (savingsRate >= 30) score += 20;
    else if (savingsRate >= 20) score += 15;
    else if (savingsRate >= 10) score += 8;
    else if (savingsRate < 0) score -= 20;

    // 支出环比
    if (avgExpense > 0) {
      if (expense < avgExpense * 0.9) score += 5;
      else if (expense > avgExpense * 1.2) score -= 5;
    }

    // 消费集中度
    if (topCats.length > 0) {
      const topRatio = topCats[0][1] / Math.max(expense, 1);
      if (topRatio > 0.5) score -= 5;
    }

    // 负债率
    if (assets > 0) {
      const debtRatio = debt / assets;
      if (debtRatio > 0.5) score -= 15;
      else if (debtRatio > 0.3) score -= 8;
      else if (debtRatio === 0) score += 5;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function scoreLabel(score) {
    if (score >= 85) return '财务状况优秀';
    if (score >= 70) return '财务状况良好';
    if (score >= 50) return '财务状况一般';
    return '需要改善财务状况';
  }

  function scoreColor(score) {
    if (score >= 85) return '#00b578';
    if (score >= 70) return '#73d13d';
    if (score >= 50) return '#ffa940';
    return '#ff4d4f';
  }

  /* ---------- 储蓄率建议 ---------- */
  function savingsAdvice(rate, income, expense) {
    const items = [];
    if (income === 0) {
      items.push({ tag: 'warn', tagText: '提醒', text: '本月暂无收入记录，建议补充收入数据以获得更准确的分析' });
      return items;
    }
    if (rate >= 30) {
      items.push({ tag: 'good', tagText: '优秀', text: `储蓄率 ${rate.toFixed(1)}%，表现优秀！建议将结余的 50% 以上用于投资理财，让钱生钱` });
    } else if (rate >= 20) {
      items.push({ tag: 'good', tagText: '良好', text: `储蓄率 ${rate.toFixed(1)}%，达到健康水平。如能提升到 30% 以上会更稳健` });
    } else if (rate >= 10) {
      items.push({ tag: 'warn', tagText: '关注', text: `储蓄率 ${rate.toFixed(1)}%，偏低。建议审视支出结构，尝试每月多存 ${((income * 0.2) - (income - expense)).toFixed(0)} 元` });
    } else if (rate >= 0) {
      items.push({ tag: 'warn', tagText: '警示', text: `储蓄率仅 ${rate.toFixed(1)}%，入不敷出的风险较高。建议立即制定节流计划` });
    } else {
      items.push({ tag: 'bad', tagText: '危险', text: `本月支出超过收入 ${Math.abs(rate).toFixed(1)}%，正在消耗储蓄。需紧急削减非必要开支` });
    }
    return items;
  }

  /* ---------- 消费结构建议 ---------- */
  function categoryAdvice(topCats, totalExpense) {
    const items = [];
    if (topCats.length === 0 || totalExpense === 0) return items;

    const [topId, topAmount] = topCats[0];
    const topRatio = topAmount / totalExpense;
    const topName = Categories.getName(topId);

    // 单一分类占比过高
    if (topRatio > 0.45) {
      items.push({
        tag: 'warn', tagText: '集中',
        text: `"${topName}" 占总支出 ${(topRatio * 100).toFixed(1)}%，消费过于集中。建议检查是否有优化空间`
      });
    }

    // 餐饮占比
    const foodCat = topCats.find(c => c[0] === 'cat_food');
    if (foodCat) {
      const ratio = foodCat[1] / totalExpense;
      if (ratio > 0.3) {
        items.push({
          tag: 'tip', tagText: '建议',
          text: `餐饮支出占比 ${(ratio * 100).toFixed(0)}%，偏高。尝试每周多做饭 2-3 次，预计可节省 ${Math.round(foodCat[1] * 0.25)} 元/月`
        });
      }
    }

    // 购物占比
    const shopCat = topCats.find(c => c[0] === 'cat_shopping');
    if (shopCat) {
      const ratio = shopCat[1] / totalExpense;
      if (ratio > 0.25) {
        items.push({
          tag: 'tip', tagText: '建议',
          text: `购物支出占比 ${(ratio * 100).toFixed(0)}%。建议设置购物冷静期，非必需品等 3 天再决定是否购买`
        });
      }
    }

    // 娱乐占比
    const entCat = topCats.find(c => c[0] === 'cat_entertainment');
    if (entCat) {
      const ratio = entCat[1] / totalExpense;
      if (ratio > 0.2) {
        items.push({
          tag: 'tip', tagText: '建议',
          text: `娱乐支出占比 ${(ratio * 100).toFixed(0)}%。适度放松很重要，但也可以探索低成本的娱乐方式`
        });
      }
    }

    return items;
  }

  /* ---------- 环比趋势建议 ---------- */
  function trendAdvice(expense, lmExpense, income, lmIncome) {
    const items = [];
    if (lmExpense > 0) {
      const change = ((expense - lmExpense) / lmExpense) * 100;
      if (change > 20) {
        items.push({ tag: 'bad', tagText: '增加', text: `支出环比增长 ${change.toFixed(1)}%，需关注哪些分类支出增加了` });
      } else if (change < -15) {
        items.push({ tag: 'good', tagText: '减少', text: `支出环比下降 ${Math.abs(change).toFixed(1)}%，节流效果明显，继续保持` });
      }
    }
    if (lmIncome > 0) {
      const change = ((income - lmIncome) / lmIncome) * 100;
      if (change > 15) {
        items.push({ tag: 'good', tagText: '增长', text: `收入环比增长 ${change.toFixed(1)}%，收入在提升` });
      } else if (change < -15) {
        items.push({ tag: 'warn', tagText: '下降', text: `收入环比下降 ${Math.abs(change).toFixed(1)}%，需关注收入来源稳定性` });
      }
    }
    return items;
  }

  /* ---------- 应急基金建议 ---------- */
  function emergencyFundAdvice(assets, debt, avgExpense) {
    const items = [];
    const netAssets = assets - debt;
    if (avgExpense <= 0) return items;

    const monthsCovered = netAssets / avgExpense;
    if (monthsCovered >= 6) {
      items.push({ tag: 'good', tagText: '充足', text: `当前净资产可覆盖 ${monthsCovered.toFixed(1)} 个月支出，应急基金充足` });
    } else if (monthsCovered >= 3) {
      items.push({ tag: 'tip', tagText: '建议', text: `应急基金可覆盖 ${monthsCovered.toFixed(1)} 个月，建议补充至 6 个月支出（还需 ${Math.round(avgExpense * 6 - netAssets)} 元）` });
    } else if (monthsCovered > 0) {
      items.push({ tag: 'warn', tagText: '不足', text: `应急基金仅能覆盖 ${monthsCovered.toFixed(1)} 个月，低于 3 个月的警戒线。建议优先建立应急基金` });
    } else {
      items.push({ tag: 'bad', tagText: '缺口', text: '当前净资产为负，建议优先偿还负债并建立应急基金' });
    }
    return items;
  }

  /* ---------- 资产配置建议 ---------- */
  function allocationAdvice(monthBalance, savingsRate, avgIncome) {
    const items = [];
    if (monthBalance <= 0 || avgIncome <= 0) return items;

    items.push({
      tag: 'tip', tagText: '配置',
      text: '建议按"4321"法则分配月结余：40% 投资（基金/股票）、30% 储蓄（定期/货币基金）、20% 应急基金、10% 保险'
    });

    if (savingsRate >= 20) {
      const investable = monthBalance * 0.4;
      items.push({
        tag: 'tip', tagText: '投资',
        text: `本月可投入理财约 ${investable.toFixed(0)} 元。新手建议从指数基金定投开始，每月固定投入，分散风险`
      });
    }

    if (avgIncome > 0 && savingsRate >= 10) {
      items.push({
        tag: 'tip', tagText: '定投',
        text: '建议设置基金定投，金额为月收入的 10%-20%。定投的核心优势是摊平成本、省时省心，适合上班族'
      });
    }

    return items;
  }

  /* ---------- 预算建议 ---------- */
  function budgetAdvice(topCats, avgExpense, avgIncome) {
    const items = [];
    if (avgExpense <= 0) return items;

    items.push({
      tag: 'tip', tagText: '预算',
      text: `建议月度总预算设为 ${Math.round(avgExpense * 1.05)} 元（基于近 3 月平均支出上浮 5%），预留弹性空间`
    });

    // 餐饮预算
    const foodAvg = topCats.find(c => c[0] === 'cat_food');
    if (foodAvg) {
      items.push({
        tag: 'tip', tagText: '分类',
        text: `餐饮预算建议设为 ${Math.round(foodAvg[1] * 1.05)} 元/月，控制外卖频率是关键`
      });
    }

    return items;
  }

  /* ---------- 工具函数 ---------- */
  function sum(arr) {
    return arr.reduce((s, t) => s + (t.amount || 0), 0);
  }

  function avg(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  return { generateReport };
})();
