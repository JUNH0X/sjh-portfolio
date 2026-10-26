import { isAdminSessionValid, checkSameOrigin, jsonResponse, supabaseFetch, validateWebUrl } from '../_utils.js';

const MAX_IMAGE_SIZE = 1024 * 1024;
const ALLOWED_IMAGES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif']
]);

function field(form, name) {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function checkText(value, { label, required = true, max = 1000 }) {
  const text = String(value || '').trim();
  if (required && !text) throw new Error(`${label}을(를) 입력해주세요.`);
  if (text.length > max) throw new Error(`${label}은(는) ${max}자 이하여야 합니다.`);
  return text;
}

async function uploadAvatar(env, file) {
  if (!(file instanceof File) || !file.size) return '';
  if (file.size > MAX_IMAGE_SIZE) throw new Error('프로필 사진은 1MB 이하여야 합니다.');
  const extension = ALLOWED_IMAGES.get(file.type);
  if (!extension) throw new Error('PNG, JPG, WebP, GIF 파일만 업로드할 수 있습니다.');
  const cfg = { url: String(env.SUPABASE_URL).replace(/\/+$/, ''), key: String(env.SUPABASE_SERVICE_ROLE_KEY || '') };
  const filename = `profile-${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`${cfg.url}/storage/v1/object/profile-images/${filename}`, {
    method: 'POST',
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': file.type,
      'x-upsert': 'false',
      'Cache-Control': '3600'
    },
    body: file
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`프로필 사진 업로드 실패 (${response.status}). Supabase Storage 설정을 확인해주세요. ${body.slice(0, 180)}`);
  }
  return `${cfg.url}/storage/v1/object/public/profile-images/${filename}`;
}

export async function onRequestPost({ request, env }) {
  if (!checkSameOrigin(request)) return jsonResponse({ ok: false, error: '허용되지 않은 요청 출처입니다.' }, 403);
  if (!await isAdminSessionValid(request, env)) return jsonResponse({ ok: false, error: '관리자 인증이 필요하거나 만료되었습니다.' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: '데이터베이스 서버 환경변수가 설정되지 않았습니다.' }, 503);
  }
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > 2 * 1024 * 1024) return jsonResponse({ ok: false, error: '요청 크기가 너무 큽니다.' }, 413);
  let form;
  try { form = await request.formData(); } catch { return jsonResponse({ ok: false, error: '잘못된 폼 데이터입니다.' }, 400); }
  try {
    const action = field(form, 'action');
    if (action === 'profile') {
      const description = checkText(field(form, 'description'), { label: '설명', required: false, max: 1000 });
      const photo = form.get('photo');
      const hasPhoto = photo instanceof File && photo.size > 0;
      if (!description && !hasPhoto) throw new Error('사진을 선택하거나 변경할 설명을 입력해주세요.');
      const updates = { updated_at: new Date().toISOString() };
      if (description) updates.description = description;
      if (hasPhoto) updates.avatar_url = await uploadAvatar(env, photo);
      const result = await supabaseFetch(env, '/rest/v1/profiles?id=eq.1', {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(updates)
      });
      if (!Array.isArray(result.data) || result.data.length === 0) {
        throw new Error('프로필 데이터가 없습니다. Supabase 설정 SQL을 실행했는지 확인해주세요.');
      }
      return jsonResponse({ ok: true, profile: result.data[0] });
    }

    if (action === 'portfolio') {
      const title = checkText(field(form, 'title'), { label: '제목', max: 120 });
      const description = checkText(field(form, 'description'), { label: '설명', max: 5000 });
      const link = validateWebUrl(field(form, 'link'));
      const result = await supabaseFetch(env, '/rest/v1/portfolios', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ title, description, link })
      });
      return jsonResponse({ ok: true, item: Array.isArray(result.data) ? result.data[0] : null }, 201);
    }

    if (action === 'research') {
      const title = checkText(field(form, 'title'), { label: '제목', max: 160 });
      const content = checkText(field(form, 'content'), { label: '내용', max: 15000 });
      const link = validateWebUrl(field(form, 'link'), true);
      const result = await supabaseFetch(env, '/rest/v1/research_records', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ title, content, link: link || null })
      });
      return jsonResponse({ ok: true, item: Array.isArray(result.data) ? result.data[0] : null }, 201);
    }
    return jsonResponse({ ok: false, error: '알 수 없는 관리자 작업입니다.' }, 400);
  } catch (error) {
    const message = error?.message || '저장에 실패했습니다.';
    const status = /입력해주세요|자 이하여야|올바른 URL|프로필 사진은|파일만 업로드|링크는|사진을 선택/.test(message) ? 400 : 502;
    return jsonResponse({ ok: false, error: message }, status);
  }
}

export async function onRequestGet() {
  return jsonResponse({ ok: false, error: 'POST 요청만 허용됩니다.' }, 405, { Allow: 'POST' });
}
