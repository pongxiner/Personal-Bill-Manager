/* ==================== 微信/支付宝 CSV & Excel 导入 ==================== */

const CSVImport = (() => {

  /**
   * 解析 CSV 文本为行数组，处理引号包裹的字段
   */
  function parseCSV(text) {
    const lines = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (inQuotes && text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        if (current.trim()) lines.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) lines.push(current);

    return lines.map(line => {
      const fields = [];
      let field = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') { field += '"'; i++; }
          else { inQ = !inQ; }
        } else if (ch === ',' && !inQ) {
          fields.push(field.trim());
          field = '';
        } else {
          field += ch;
        }
      }
      fields.push(field.trim());
      return fields;
    });
  }

  /**
   * 解析 Excel 文件为行数组（与 parseCSV 返回格式一致）
   * 使用 SheetJS (xlsx) 库，读取 ArrayBuffer 并转为二维数组
   */
  function parseExcelToArray(buffer) {
    const workbook = XLSX.read(buffer, { type: 'array' });
    // 取第一个工作表
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // sheet_to_json 返回对象数组，用 header:1 返回数组形式
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    // 将每个单元格转为字符串并 trim
    return rows.map(row =>
      (Array.isArray(row) ? row : []).map(cell => String(cell || '').trim())
    );
  }

  /**
   * 清理金额字符串 "¥35.00" → 35.00
   */
  function parseAmount(str) {
    if (!str) return 0;
    const cleaned = str.replace(/[¥￥$,，\s]/g, '').replace(/[^0-9.\-]/g, '');
    return parseFloat(cleaned) || 0;
  }

  /**
   * 解析微信账单 CSV
   * 微信格式列：交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注
   */
  function parseWechat(rows) {
    // 找到表头行（包含"交易时间"的行）
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].some(f => f.includes('交易时间'))) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) return [];

    const header = rows[headerIdx];
    const colMap = {};
    header.forEach((h, i) => {
      if (h.includes('交易时间')) colMap.date = i;
      else if (h.includes('交易对方')) colMap.merchant = i;
      else if (h.includes('商品')) colMap.goods = i;
      else if (h.includes('收/支') || h.includes('收支')) colMap.direction = i;
      else if (h.includes('金额')) colMap.amount = i;
      else if (h.includes('支付方式')) colMap.payment = i;
      else if (h.includes('当前状态') || h.includes('状态')) colMap.status = i;
      else if (h.includes('备注')) colMap.remark = i;
    });

    const transactions = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 3) continue;

      const direction = row[colMap.direction] || '';
      const amount = parseAmount(row[colMap.amount] || '');
      if (amount === 0) continue;

      // 跳过非收支记录（如"/"）
      let type = null;
      if (direction.includes('收入')) type = 'income';
      else if (direction.includes('支出')) type = 'expense';
      else continue; // 跳过"不计收支"等

      const dateStr = row[colMap.date] || '';
      const date = parseWechatDate(dateStr);
      if (!date) continue;

      const merchant = row[colMap.merchant] || '';
      const goods = row[colMap.goods] || '';
      const desc = goods || merchant;
      const note = [merchant, goods, row[colMap.remark]].filter(Boolean).join(' ');
      const account = row[colMap.payment] || '';

      transactions.push({
        date: date.toISOString(),
        type,
        amount,
        description: desc,
        merchant,
        note,
        account,
        source: 'wechat'
      });
    }
    return transactions;
  }

  function parseWechatDate(str) {
    // 微信格式：2024-01-15 10:30:00
    const m = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})[\s ]+(\d{1,2}):(\d{1,2}):(\d{1,2})/);
    if (m) return new Date(m[1], m[2]-1, m[3], m[4], m[5], m[6]);
    const m2 = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m2) return new Date(m2[1], m2[2]-1, m2[3]);
    return null;
  }

  /**
   * 解析支付宝账单 CSV
   * 支付宝格式列：交易号,商家订单号,交易创建时间,付款时间,最近修改时间,交易来源地,类型,交易对方,商品名称,金额（元）,收/支,交易状态,备注
   */
  function parseAlipay(rows) {
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].some(f => f.includes('交易号') || f.includes('商家订单号'))) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) return [];

    const header = rows[headerIdx];
    const colMap = {};
    header.forEach((h, i) => {
      if (h.includes('交易创建时间') || h.includes('交易时间')) colMap.date = i;
      else if (h.includes('交易对方')) colMap.merchant = i;
      else if (h.includes('商品名称') || h.includes('商品')) colMap.goods = i;
      else if (h.includes('收/支')) colMap.direction = i;
      else if (h.includes('金额')) colMap.amount = i;
      else if (h.includes('交易状态')) colMap.status = i;
      else if (h.includes('备注')) colMap.remark = i;
      else if (h.includes('交易来源')) colMap.source = i;
    });

    const transactions = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 3) continue;

      // 跳过分隔线
      if (row[0] && row[0].includes('---')) continue;

      const direction = row[colMap.direction] || '';
      const amount = parseAmount(row[colMap.amount] || '');
      if (amount === 0) continue;

      let type = null;
      if (direction.includes('收入')) type = 'income';
      else if (direction.includes('支出')) type = 'expense';
      else continue;

      const dateStr = row[colMap.date] || '';
      const date = parseAlipayDate(dateStr);
      if (!date) continue;

      const merchant = row[colMap.merchant] || '';
      const goods = row[colMap.goods] || '';
      const desc = goods || merchant;
      const note = [merchant, goods, row[colMap.remark]].filter(Boolean).join(' ');

      transactions.push({
        date: date.toISOString(),
        type,
        amount,
        description: desc,
        merchant,
        note,
        account: '支付宝',
        source: 'alipay'
      });
    }
    return transactions;
  }

  function parseAlipayDate(str) {
    // 支付宝格式：2024-01-15 10:30:00 或 2024-01-15 或 2024/01/15
    const m = str.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})[\s ]*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?/);
    if (m) return new Date(m[1], m[2]-1, m[3], m[4]||0, m[5]||0, m[6]||0);
    return null;
  }

  /**
   * 解析支付宝账单 CSV — 格式 B（收支明细）
   * 列：账务时间, 业务类型, 收入（+元）, 支出（-元）, 余额（元）, 对方账号, 对方户名, 商品说明, 收/付款方式, 交易状态, 交易订单号, 备注
   * 或：交易时间, 交易分类, 交易对方, 对方账号, 商品说明, 收/支, 金额, 收/付款方式, 交易状态, 交易订单号, 备注
   */
  function parseAlipayV2(rows) {
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const line = rows[i].join(' ');
      if (/账务时间|业务类型|交易分类|收入.*元|支出.*元/.test(line)) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) return [];

    const header = rows[headerIdx];
    const colMap = {};
    header.forEach((h, i) => {
      if (/账务时间|交易时间/.test(h)) colMap.date = i;
      else if (/交易对方|对方户名|对方账号/.test(h) && colMap.merchant === undefined) colMap.merchant = i;
      else if (/商品说明|商品名称|商品/.test(h)) colMap.goods = i;
      else if (/收入.*元|收入/.test(h)) colMap.income = i;
      else if (/支出.*元|支出/.test(h)) colMap.expense = i;
      else if (/金额/.test(h)) colMap.amount = i;
      else if (/收.支/.test(h)) colMap.direction = i;
      else if (/收.付款方式|支付方式/.test(h)) colMap.payment = i;
      else if (/状态/.test(h)) colMap.status = i;
      else if (/备注/.test(h)) colMap.remark = i;
      else if (/交易订单号|交易号/.test(h)) colMap.orderId = i;
    });

    const transactions = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;

      // 跳过分隔线
      if (row[0] && /^--/.test(row[0])) continue;

      let type, amount;

      if (colMap.direction !== undefined) {
        // 有收/支列
        const direction = row[colMap.direction] || '';
        amount = parseAmount(row[colMap.amount] || '');
        if (direction.includes('收入')) type = 'income';
        else if (direction.includes('支出')) type = 'expense';
        else continue;
      } else if (colMap.income !== undefined && colMap.expense !== undefined) {
        // 有独立的收入列和支出列
        const incomeAmt = parseAmount(row[colMap.income] || '');
        const expenseAmt = parseAmount(row[colMap.expense] || '');
        if (incomeAmt > 0) { type = 'income'; amount = incomeAmt; }
        else if (expenseAmt > 0) { type = 'expense'; amount = expenseAmt; }
        else continue;
      } else {
        // 其他格式：找包含+或-的金额列
        amount = parseAmount(row[colMap.amount] || '');
        if (amount === 0) continue;
        type = 'expense'; // 默认支出
      }

      const dateStr = row[colMap.date] || '';
      const date = parseAlipayDate(dateStr);
      if (!date) continue;

      const merchant = colMap.merchant !== undefined ? (row[colMap.merchant] || '') : '';
      const goods = colMap.goods !== undefined ? (row[colMap.goods] || '') : '';
      const desc = goods || merchant;
      const note = [merchant, goods, row[colMap.remark] || ''].filter(Boolean).join(' ');

      transactions.push({
        date: date.toISOString(),
        type,
        amount,
        description: desc,
        merchant,
        note,
        account: '支付宝',
        source: 'alipay'
      });
    }
    return transactions;
  }

  /**
   * 从行数组解析交易记录（CSV 和 Excel 共用）
   * @param {Array<Array<string>>} rows - 二维行数组
   * @param {string} platform - 'wechat' | 'alipay'
   * @returns {Array} 解析后的交易数组（含自动分类）
   */
  function parseRows(rows, platform) {
    let transactions;
    if (platform === 'wechat') {
      transactions = parseWechat(rows);
    } else {
      // 支付宝：先尝试 V1（交易流水），再尝试 V2（收支明细）
      transactions = parseAlipay(rows);
      if (transactions.length === 0) {
        transactions = parseAlipayV2(rows);
      }
    }

    // 自动分类
    transactions.forEach(t => {
      const cat = Categories.autoMatch(t.description || t.merchant || t.note, t.type);
      t.category = cat.id;
      t.categoryName = cat.name;
      t.categoryIcon = cat.icon;
    });

    return transactions;
  }

  /**
   * 主入口：解析 CSV 文件文本
   * @param {string} text - CSV 文件内容
   * @param {string} platform - 'wechat' | 'alipay'
   * @returns {Array} 解析后的交易数组（含自动分类）
   */
  function parse(text, platform) {
    // 去除 BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const rows = parseCSV(text);
    return parseRows(rows, platform);
  }

  /**
   * 统一文件解析入口：根据文件扩展名自动选择 CSV 或 Excel 解析器
   * @param {File} file - 用户上传的文件对象
   * @param {string} platform - 'wechat' | 'alipay'
   * @returns {Promise<Array>} 解析后的交易数组（含自动分类）
   */
  async function parseFile(file, platform) {
    const name = file.name.toLowerCase();
    const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');

    if (isExcel) {
      // Excel: 读取为 ArrayBuffer，用 SheetJS 解析
      const buffer = await readFileAsArrayBuffer(file);
      if (!buffer || buffer.byteLength === 0) {
        throw new Error('文件为空，请重新选择');
      }
      try {
        const rows = parseExcelToArray(buffer);
        if (!rows || rows.length === 0) {
          throw new Error('Excel 文件内容为空或无法解析');
        }
        return parseRows(rows, platform);
      } catch (e) {
        if (e.message && e.message.includes('XLSX')) {
          throw new Error('Excel 解析失败，请确认文件未被加密或损坏');
        }
        throw new Error('Excel 文件解析失败：' + (e.message || '请确认文件格式正确'));
      }
    } else {
      // CSV: 读取为文本
      const text = await readFile(file);
      if (!text || text.trim().length === 0) {
        throw new Error('文件内容为空，请重新选择');
      }
      return parse(text, platform);
    }
  }

  /**
   * 读取文件内容为 ArrayBuffer，然后尝试多种编码解码
   * 支付宝/微信 CSV 常用 GBK/GB2312 编码，先试 GBK，再试 UTF-8
   * 某些浏览器不支持 GBK TextDecoder，需多重 fallback
   */
  async function readFileWithEncoding(file) {
    const buffer = await readFileAsArrayBuffer(file);

    // 尝试多种编码，按优先级排列
    const encodings = ['gbk', 'gb2312', 'gb18030', 'utf-8'];
    let bestText = '';
    let bestScore = 0;

    for (const enc of encodings) {
      try {
        const text = new TextDecoder(enc).decode(buffer);
        // 评分：检测中文关键词出现次数
        const score = (text.match(/交易|金额|收.支|备注|商品|时间|对方|类型/g) || []).length;
        if (score > bestScore) {
          bestScore = score;
          bestText = text;
        }
      } catch (e) {
        // 该编码不支持，试下一个
        continue;
      }
    }

    // 如果所有编码都失败或得分太低，回退 UTF-8
    if (!bestText || bestScore === 0) {
      try {
        bestText = new TextDecoder('utf-8').decode(buffer);
      } catch (e) {
        throw new Error('无法解码文件，请确认文件是微信/支付宝官方导出的 CSV 或 Excel');
      }
    }

    return bestText;
  }

  /**
   * 读取文件内容为文本（旧接口，保留兼容）
   */
  function readFile(file) {
    return readFileWithEncoding(file);
  }

  /**
   * 读取文件内容为 ArrayBuffer（用于 Excel 解析）
   */
  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  return { parse, parseRows, parseFile, readFile };
})();
