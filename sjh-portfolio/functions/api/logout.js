import { getCookieOptions, jsonResponse } from '../_utils.js';

export async function onRequestPost({ request }) {
  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': `admin_session=; ${getCookieOptions(request, 0)}` });
}
