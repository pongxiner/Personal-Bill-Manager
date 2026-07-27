/* ==================== 图表渲染 ==================== */

const Charts = (() => {
  let instances = {};

  function destroy(key) {
    if (instances[key]) {
      instances[key].destroy();
      delete instances[key];
    }
  }

  function destroyAll() {
    Object.values(instances).forEach(c => c.destroy());
    instances = {};
  }

  // 通用配色
  const PALETTE = ['#5b6ef5', '#00b578', '#ffa940', '#ff7875', '#9254de', '#36cfc9', '#73d13d', '#ffc53d', '#ff85c0', '#597ef7', '#bfbfbf'];

  /**
   * 首页迷你趋势图（近7天支出）
   * data: { labels, values, dates?, onClick? }
   */
  function renderHomeTrend(canvas, data) {
    destroy('homeTrend');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    instances.homeTrend = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          data: data.values,
          borderColor: '#5b6ef5',
          backgroundColor: (ctx) => {
            const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 150);
            gradient.addColorStop(0, 'rgba(91,110,245,0.2)');
            gradient.addColorStop(1, 'rgba(91,110,245,0)');
            return gradient;
          },
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: '#5b6ef5',
          pointBorderColor: '#fff',
          pointBorderWidth: 1,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'nearest' },
        onClick: (e, elements, chart) => {
          if (!data.onClick || !chart) return;
          const pts = chart.getElementsAtEventForMode(e, 'nearest', { intersect: false }, true);
          if (pts.length > 0) {
            const idx = pts[0].index;
            data.onClick(idx, data.labels ? data.labels[idx] : '', data.values ? data.values[idx] : 0);
          }
        },
        plugins: { legend: { display: false }, tooltip: {
          callbacks: {
            label: (ctx) => '¥' + ctx.parsed.y.toFixed(2)
          }
        }},
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#9ca3af' } },
          y: { display: false, beginAtZero: true }
        }
      }
    });
  }

  /**
   * 支出分类饼图
   * data: [{ id, name, amount, color }], onClick? callback(id, name)
   */
  function renderPie(canvas, data) {
    destroy('pie');
    if (!canvas || data.length === 0) {
      // 隐藏饼图卡片
      const card = document.getElementById('stats-pie-card');
      if (card) card.style.display = 'none';
      return;
    }

    const card = document.getElementById('stats-pie-card');
    if (card) card.style.removeProperty('display');

    const ctx = canvas.getContext('2d');
    instances.pie = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.name),
        datasets: [{
          data: data.map(d => d.amount),
          backgroundColor: data.map((d, i) => d.color || PALETTE[i % PALETTE.length]),
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '55%',
        onClick: (e, elements, chart) => {
          if (!data.onClick || elements.length === 0) return;
          const idx = elements[0].index;
          if (idx >= 0 && idx < data.length) {
            const item = data[idx];
            data.onClick(item.id, item.name);
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 11 }, padding: 8, boxWidth: 12 }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                return ctx.label + ': ¥' + ctx.parsed.toFixed(2) + ' (' + pct + '%)';
              }
            }
          }
        }
      }
    });
  }

  /**
   * 单序列趋势图（统计页：周/月/年）
   * data: { labels, values, average, top3Data?, onClick? }
   */
  function renderTrend(canvas, data) {
    destroy('trend');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const maxVal = Math.max(...data.values, 0);
    const pointRadii = data.values.map(v => (v === maxVal && maxVal > 0) ? 5 : 3);
    const pointColors = data.values.map(v => (v === maxVal && maxVal > 0) ? '#ff4d4f' : '#5b6ef5');

    const hasTop3 = data.top3Data && data.top3Data.length > 0;

    instances.trend = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          {
            data: data.values,
            borderColor: '#5b6ef5',
            backgroundColor: 'rgba(91,110,245,0.06)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: pointRadii,
            pointBackgroundColor: pointColors,
            pointBorderColor: '#fff',
            pointBorderWidth: 1.5,
            pointHoverRadius: 7
          },
          {
            data: data.labels.map(() => data.average),
            borderColor: '#d1d5db',
            borderWidth: 1,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'nearest' },
        onClick: (e, elements, chart) => {
          if (!data.onClick) return;
          // 优先使用 chart.getElementsAtEventForMode 获取最近点
          const pts = chart.getElementsAtEventForMode(e, 'nearest', { intersect: false }, true);
          if (pts.length > 0) {
            const idx = pts[0].index;
            data.onClick(idx, data.labels[idx], data.values[idx]);
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: hasTop3 ? {
            enabled: false,
            external: (context) => renderTop3Tooltip(context, data)
          } : {
            filter: item => item.datasetIndex === 0,
            callbacks: {
              label: (ctx) => '¥' + ctx.parsed.y.toFixed(2)
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#9ca3af', maxTicksLimit: 10 } },
          y: { beginAtZero: true, ticks: { font: { size: 10 }, color: '#9ca3af', callback: v => '¥' + v } }
        }
      }
    });
    return instances.trend;
  }

  /** 自定义 Tooltip：显示当前点最大 3 笔交易 */
  function renderTop3Tooltip(context, data) {
    const tooltip = context.tooltip;
    let el = document.getElementById('chart-top3-tooltip');
    if (!el) {
      el = document.createElement('div');
      el.id = 'chart-top3-tooltip';
      el.style.cssText = 'position:fixed;z-index:300;pointer-events:none;opacity:0;transition:opacity 0.15s;';
      document.body.appendChild(el);
    }

    if (tooltip.opacity === 0) {
      el.style.opacity = '0';
      return;
    }

    const idx = tooltip.dataPoints && tooltip.dataPoints[0] ? tooltip.dataPoints[0].dataIndex : null;
    if (idx === null) {
      el.style.opacity = '0';
      return;
    }

    const label = data.labels[idx];
    const value = data.values[idx];
    const top3 = (data.top3Data[idx] || []).slice(0, 3);

    let html = '<div class="chart-tooltip-title">' + label + ' · ¥' + value.toFixed(2) + '</div>';
    if (top3.length > 0) {
      html += '<div class="chart-tooltip-subtitle">最大' + top3.length + '笔交易</div>';
      html += '<div class="chart-tooltip-list">' + top3.map(t =>
        '<div class="chart-tooltip-row">' +
          '<span class="chart-tooltip-icon">' + (t.icon || '💰') + '</span>' +
          '<span class="chart-tooltip-name">' + escapeHtml(t.name) + '</span>' +
          '<span class="chart-tooltip-amount">¥' + t.amount.toFixed(2) + '</span>' +
        '</div>'
      ).join('') + '</div>';
    }

    el.innerHTML = html;

    const rect = context.chart.canvas.getBoundingClientRect();
    const left = rect.left + tooltip.caretX;
    const top = rect.top + tooltip.caretY - 8;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.transform = 'translate(-50%, -100%)';
    el.style.opacity = '1';
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  /**
   * 每日收支趋势折线图
   */
  function renderLine(canvas, data) {
    destroy('line');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const datasets = [];
    if (data.expense && data.expense.length > 0) {
      datasets.push({
        label: '支出',
        data: data.expense,
        borderColor: '#ff4d4f',
        backgroundColor: 'rgba(255,77,79,0.08)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 2
      });
    }
    if (data.income && data.income.length > 0) {
      datasets.push({
        label: '收入',
        data: data.income,
        borderColor: '#00b578',
        backgroundColor: 'rgba(0,181,120,0.08)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 2
      });
    }

    instances.line = new Chart(ctx, {
      type: 'line',
      data: { labels: data.labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { labels: { font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.dataset.label + ': ¥' + ctx.parsed.y.toFixed(2)
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#9ca3af', maxTicksLimit: 10 } },
          y: { beginAtZero: true, ticks: { font: { size: 10 }, color: '#9ca3af', callback: v => '¥' + v } }
        }
      }
    });
  }

  /**
   * 近6月收支对比柱状图
   */
  function renderBar(canvas, data) {
    destroy('bar');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    instances.bar = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: '收入',
            data: data.income,
            backgroundColor: 'rgba(0,181,120,0.7)',
            borderRadius: 4,
            barPercentage: 0.6
          },
          {
            label: '支出',
            data: data.expense,
            backgroundColor: 'rgba(255,77,79,0.7)',
            borderRadius: 4,
            barPercentage: 0.6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.dataset.label + ': ¥' + ctx.parsed.y.toFixed(2)
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#9ca3af' } },
          y: { beginAtZero: true, ticks: { font: { size: 10 }, color: '#9ca3af', callback: v => '¥' + v } }
        }
      }
    });
  }

  return {
    renderHomeTrend,
    renderPie,
    renderTrend,
    renderLine,
    renderBar,
    destroyAll
  };
})();
