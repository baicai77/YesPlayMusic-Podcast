/**
 * RSS URL 安全校验（阻止访问内网、回环及非 HTTP/HTTPS 协议，防范 SSRF）
 */

const dns = require('dns');
const net = require('net');

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(n => parseInt(n, 10));
  if (
    parts.length !== 4 ||
    parts.some(n => !Number.isFinite(n) || n < 0 || n > 255)
  ) {
    return true;
  }
  const a = parts[0];
  const b = parts[1];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(ip) {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local
  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true; // link-local
  }
  const mappedV4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedV4) {
    return isPrivateIPv4(mappedV4[1]);
  }
  return false;
}

function isPrivateIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return false;
}

function validatePublicHttpUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    const err = new Error('请提供有效的 RSS 链接');
    err.status = 400;
    throw err;
  }
  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) {
    const err = new Error('RSS 链接长度超出限制');
    err.status = 400;
    throw err;
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (e) {
    const err = new Error('RSS 链接格式无效，请以 http:// 或 https:// 开头');
    err.status = 400;
    throw err;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    const err = new Error('仅支持 http:// 或 https:// 协议的 RSS 链接');
    err.status = 400;
    throw err;
  }

  const host = (parsed.hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    isPrivateIp(host)
  ) {
    const err = new Error('出于安全限制，不允许访问本机或局域网地址');
    err.status = 400;
    throw err;
  }

  parsed.hash = '';
  return parsed.href;
}

async function assertPublicHostResolution(urlString, lookupFn) {
  const safeUrl = validatePublicHttpUrl(urlString);
  const parsed = new URL(safeUrl);
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (isPrivateIp(host)) {
      const err = new Error('出于安全限制，不允许访问本机或局域网地址');
      err.status = 400;
      throw err;
    }
    return safeUrl;
  }

  const resolver =
    lookupFn ||
    (hostname =>
      new Promise((resolve, reject) => {
        dns.lookup(hostname, { all: true }, (err, addresses) => {
          if (err) reject(err);
          else resolve(addresses);
        });
      }));

  try {
    const addresses = await resolver(host);
    if (Array.isArray(addresses)) {
      for (let i = 0; i < addresses.length; i++) {
        const addr = addresses[i] && addresses[i].address;
        if (addr && isPrivateIp(addr)) {
          const err = new Error('目标域名解析到了受限的私有网络地址');
          err.status = 400;
          throw err;
        }
      }
    }
  } catch (err) {
    if (err && err.status === 400) throw err;
    // DNS 瞬时错误交由后续 HTTP 客户端报错，或由代理环境处理
  }

  return safeUrl;
}

module.exports = {
  isPrivateIp,
  validatePublicHttpUrl,
  assertPublicHostResolution,
};
