import { createAdminSession, getCookieOptions, jsonResponse } from '../_utils.js';

function constantTimeEquals(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) diff |= (left[i] || 0) ^ (right[i] || 0);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
    return jsonResponse({ ok: false, error: '관리자 인증 환경변수가 설정되지 않았습니다. Cloudflare 설정을 확인해주세요.' }, 503);
  }
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 4096) return jsonResponse({ ok: false, error: '요청이 너무 큽니다.' }, 413);
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ ok: false, error: '잘못된 요청입니다.' }, 400); }
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password || !constantTimeEquals(password, env.ADMIN_PASSWORD)) {
    return jsonResponse({ ok: false, error: '비밀번호가 올바르지 않습니다.' }, 401);
  }
  try {
    const token = await createAdminSession(env);
    return jsonResponse({ ok: true, expiresIn: 3600 }, 200, { 'Set-Cookie': `admin_session=${token}; ${getCookieOptions(request, 3600)}` });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || '관리자 세션을 만들지 못했습니다.' }, 503);
  }
}

export async function onRequestGet() {
  return jsonResponse({ ok: false, error: 'POST 요청만 허용됩니다.' }, 405, { Allow: 'POST' });
}
