const encoder = new TextEncoder();

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecodeBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders }
  });
}

export function requireServerConfig(env) {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(key => !env[key]);
  if (missing.length) throw new Error(`서버 환경변수가 설정되지 않았습니다: ${missing.join(', ')}`);
  return {
    url: String(env.SUPABASE_URL).replace(/\/+$/, ''),
    key: String(env.SUPABASE_SERVICE_ROLE_KEY)
  };
}

export async function supabaseFetch(env, path, options = {}) {
  const cfg = requireServerConfig(env);
  const response = await fetch(`${cfg.url}${path}`, {
    ...options,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) {
    let reason = text;
    try { reason = JSON.parse(text).message || JSON.parse(text).error || text; } catch { /* response was not JSON */ }
    throw new Error(`데이터베이스 요청 실패 (${response.status}): ${String(reason).slice(0, 300)}`);
  }
  return { response, text, data: text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null };
}

export function getCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const prefix = `${name}=`;
  for (const part of cookieHeader.split(';')) {
    const item = part.trim();
    if (item.startsWith(prefix)) return item.slice(prefix.length);
  }
  return '';
}

async function signingKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function createAdminSession(env) {
  if (!env.ADMIN_SESSION_SECRET || String(env.ADMIN_SESSION_SECRET).length < 32) {
    throw new Error('ADMIN_SESSION_SECRET은 32자 이상의 임의 문자열로 설정해주세요.');
  }
  const payload = base64UrlEncodeBytes(encoder.encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 60 * 60 })));
  const key = await signingKey(String(env.ADMIN_SESSION_SECRET));
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

export async function isAdminSessionValid(request, env) {
  try {
    if (!env.ADMIN_SESSION_SECRET || String(env.ADMIN_SESSION_SECRET).length < 32) return false;
    const token = getCookie(request, 'admin_session');
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return false;
    const key = await signingKey(String(env.ADMIN_SESSION_SECRET));
    const verified = await crypto.subtle.verify('HMAC', key, base64UrlDecodeBytes(signature), encoder.encode(payload));
    if (!verified) return false;
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecodeBytes(payload)));
    return Number.isFinite(parsed.exp) && parsed.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function checkSameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

export function validateWebUrl(raw, optional = false) {
  const value = String(raw || '').trim();
  if (!value && optional) return '';
  if (!value) throw new Error('링크를 입력해주세요.');
  let url;
  try { url = new URL(value); } catch { throw new Error('올바른 URL을 입력해주세요.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('링크는 http:// 또는 https:// 주소여야 합니다.');
  if (url.href.length > 500) throw new Error('링크는 500자 이하여야 합니다.');
  return url.href;
}

export function getCookieOptions(request, maxAge = 3600) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
