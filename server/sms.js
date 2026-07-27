/* ==================== SMS 短信服务模块 ====================
 * 支持多种短信服务商，通过环境变量 SMS_PROVIDER 切换。
 *
 * 环境变量配置：
 *   SMS_PROVIDER         - 短信服务商: dev | yunpian | custom
 *   SMS_SIGN_NAME        - 短信签名（如: "财务管理"）
 *
 * --- dev 模式（默认）---
 *   无需配置，验证码固定为 888888
 *
 * --- 云片 (yunpian) ---
 *   SMS_YUNPIAN_API_KEY  - 云片 API Key
 *
 * --- 自定义 HTTP (custom) ---
 *   SMS_CUSTOM_URL       - 短信接口地址
 *   SMS_CUSTOM_KEY_PARAM - 请求参数中 API Key 的字段名（默认 "apikey"）
 *   SMS_CUSTOM_KEY       - API Key 值
 *   SMS_CUSTOM_PHONE_PARAM - 请求参数中手机号的字段名（默认 "mobile"）
 *   SMS_CUSTOM_TEXT_PARAM  - 请求参数中短信内容的字段名（默认 "text"）
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// 生成6位随机验证码
function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ======================== Dev Provider ========================
const devProvider = {
  name: 'dev',
  async sendCode(phone) {
    const code = '888888';
    console.log(`[SMS:dev] 验证码: ${code} → ${phone}`);
    return { success: true, code, message: '开发模式，验证码已生成' };
  }
};

// ======================== 云片 (Yunpian) ========================
const yunpianProvider = {
  name: 'yunpian',
  async sendCode(phone) {
    const apiKey = process.env.SMS_YUNPIAN_API_KEY;
    const signName = process.env.SMS_SIGN_NAME || '财务管理';

    if (!apiKey) {
      throw new Error('未配置 SMS_YUNPIAN_API_KEY 环境变量');
    }

    const code = generateCode();
    const text = `【${signName}】您的验证码是${code}，10分钟内有效。`;

    const body = new URLSearchParams({
      apikey: apiKey,
      mobile: phone,
      text: text
    }).toString();

    const result = await httpPost(
      'https://sms.yunpian.com/v2/sms/single_send.json',
      body,
      { 'Content-Type': 'application/x-www-form-urlencoded' }
    );

    const json = JSON.parse(result);
    if (json.code !== 0) {
      console.error(`[SMS:yunpian] 发送失败:`, json);
      throw new Error(json.msg || json.detail || '短信发送失败');
    }

    console.log(`[SMS:yunpian] 验证码已发送: ${code} → ${phone}`);
    return { success: true, code, message: '验证码已发送' };
  }
};

// ======================== 自定义 HTTP Provider ========================
const customProvider = {
  name: 'custom',
  async sendCode(phone) {
    const url = process.env.SMS_CUSTOM_URL;
    if (!url) {
      throw new Error('未配置 SMS_CUSTOM_URL 环境变量');
    }

    const apiKey = process.env.SMS_CUSTOM_KEY || '';
    const signName = process.env.SMS_SIGN_NAME || '';
    const code = generateCode();

    // 默认模板：带签名的验证码短信
    const text = signName
      ? `【${signName}】您的验证码是${code}，10分钟内有效。`
      : `您的验证码是${code}，10分钟内有效。`;

    const keyParam = process.env.SMS_CUSTOM_KEY_PARAM || 'apikey';
    const phoneParam = process.env.SMS_CUSTOM_PHONE_PARAM || 'mobile';
    const textParam = process.env.SMS_CUSTOM_TEXT_PARAM || 'text';

    const body = new URLSearchParams({
      [keyParam]: apiKey,
      [phoneParam]: phone,
      [textParam]: text
    }).toString();

    console.log(`[SMS:custom] 发送短信: ${url}`);
    const result = await httpPost(url, body, {
      'Content-Type': 'application/x-www-form-urlencoded'
    });

    console.log(`[SMS:custom] 响应:`, result.slice(0, 500));
    console.log(`[SMS:custom] 验证码: ${code} → ${phone}`);
    return { success: true, code, message: '验证码已发送' };
  }
};

// ======================== HTTP POST 工具 ========================
function httpPost(urlStr, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const mod = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Length': Buffer.byteLength(body),
        ...headers
      },
      timeout: 10000
    };

    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { resolve(data); });
    });

    req.on('error', (e) => { reject(new Error('短信服务请求失败: ' + e.message)); });
    req.on('timeout', () => { req.destroy(); reject(new Error('短信服务请求超时')); });
    req.write(body);
    req.end();
  });
}

// ======================== Provider 工厂 ========================
const providers = {
  dev: devProvider,
  yunpian: yunpianProvider,
  custom: customProvider
};

function getProvider() {
  const name = process.env.SMS_PROVIDER || 'dev';
  const provider = providers[name];
  if (!provider) {
    console.warn(`[SMS] 未知的 Provider: "${name}"，降级为 dev 模式`);
    return devProvider;
  }
  return provider;
}

// ======================== 公共接口 ========================
async function sendCode(phone) {
  const provider = getProvider();
  console.log(`[SMS] 使用 ${provider.name} 发送验证码到 ${phone}`);

  try {
    const result = await provider.sendCode(phone);
    return { ...result, phone, expiresIn: 600 }; // 10分钟过期
  } catch (err) {
    console.error(`[SMS] ${provider.name} 发送失败:`, err.message);
    throw err;
  }
}

function getProviderInfo() {
  const provider = getProvider();
  return {
    provider: provider.name,
    isDev: provider.name === 'dev'
  };
}

module.exports = { sendCode, getProviderInfo };
