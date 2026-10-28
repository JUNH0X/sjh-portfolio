import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const config = window.APP_CONFIG || {};
const MAX_RECORD_PHOTO_SIZE = 5 * 1024 * 1024;
const ALLOWED_RECORD_PHOTO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const isConfigured = Boolean(
  config.supabaseUrl &&
  config.supabasePublishableKey &&
  !config.supabaseUrl.includes('YOUR_PROJECT_ID') &&
  !config.supabasePublishableKey.includes('YOUR_SUPABASE')
);
const supabase = isConfigured ? createClient(config.supabaseUrl, config.supabasePublishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
}) : null;

const state = {
  page: 'home',
  profile: {
    id: 1,
    display_name: '신준호',
    description: '오픈소스 AI 모델을 연구하고 개조하며, 배운 내용을 기록하는 학생 개발자입니다.',
    avatar_url: null
  },
  portfolios: [],
  research: [],
  view: { portfolio: 'list', research: 'list' },
  modalKind: null,
  adminAuthenticated: false,
  lastFocus: null,
  realtimeChannel: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const modalBackdrop = $('#modal-backdrop');
const modalTitle = $('#modal-title');
const modalKicker = $('#modal-kicker');
const modalBody = $('#modal-body');
const drawer = $('#navigation-drawer');
const drawerBackdrop = $('#drawer-backdrop');
const liveStatus = $('#live-status');
const statusText = $('#status-text');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function safeWebUrl(value) {
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

// Show a safe link preview for all URLs and real embeds for providers with known embed formats.
function getRecordLinkEmbedHtml(rawUrl, recordTitle, recordType) {
  const safeUrl = safeWebUrl(rawUrl);
  if (!safeUrl) return '';

  let parsed;
  try { parsed = new URL(safeUrl); } catch { return ''; }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const title = escapeHtml(recordTitle || (recordType === 'portfolio' ? '프로젝트 링크' : '참고 링크'));
  const externalLabel = recordType === 'portfolio' ? '프로젝트 열기' : '링크 열기';
  const safeHref = escapeHtml(safeUrl);

  const renderIframe = (providerLabel, embedUrl, allow = '') => `
    <section class="record-link-embed" aria-label="${escapeHtml(providerLabel)} 임베드 미리보기">
      <div class="record-embed-heading"><span class="record-embed-kicker">LINK EMBED</span><span class="record-embed-provider">${escapeHtml(providerLabel)}</span></div>
      <div class="record-embed-frame">
        <iframe src="${escapeHtml(embedUrl)}" title="${title}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" ${allow ? `allow="${escapeHtml(allow)}"` : ''} allowfullscreen></iframe>
      </div>
      <a class="record-embed-open" href="${safeHref}" target="_blank" rel="noopener noreferrer">원본 사이트에서 열기 <span aria-hidden="true">↗</span></a>
    </section>`;

  // YouTube: support youtu.be, watch?v=, shorts, live, and embed links.
  let youtubeId = '';
  if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    if (parsed.pathname === '/watch') youtubeId = parsed.searchParams.get('v') || '';
    else {
      const match = parsed.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})(?:\b|\/|$)/);
      if (match) youtubeId = match[1];
    }
  } else if (host === 'youtu.be') {
    youtubeId = parsed.pathname.split('/').filter(Boolean)[0] || '';
  }
  if (/^[A-Za-z0-9_-]{11}$/.test(youtubeId)) {
    return renderIframe('YouTube 영상', `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`, 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
  }

  // Vimeo: only numeric video IDs are embedded.
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const match = parsed.pathname.match(/(?:^|\/)video\/(\d+)|^\/(\d+)(?:\/|$)/);
    const vimeoId = match ? (match[1] || match[2]) : '';
    if (vimeoId) return renderIframe('Vimeo 영상', `https://player.vimeo.com/video/${vimeoId}`, 'autoplay; fullscreen; picture-in-picture');
  }

  // CodePen: only canonical /user/pen/id or /user/full/id links are converted.
  if (host === 'codepen.io') {
    const match = parsed.pathname.match(/^\/([A-Za-z0-9_-]+)\/(?:pen|full)\/([A-Za-z0-9_-]+)\/?$/);
    if (match) {
      const embedUrl = `https://codepen.io/${match[1]}/embed/${match[2]}?default-tab=result&editable=false`;
      return renderIframe('CodePen 프로젝트', embedUrl, 'clipboard-write');
    }
  }

  // Figma publicly shared file/prototype links support the standard Figma embed endpoint.
  if (host === 'figma.com' && /^\/(?:file|proto|design|board)\//.test(parsed.pathname)) {
    const embedUrl = `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(safeUrl)}`;
    return renderIframe('Figma 디자인', embedUrl, 'fullscreen');
  }

  // For providers without a reliable embeddable format (including GitHub and Hugging Face),
  // show a clickable preview card instead of framing an arbitrary external page.
  let provider = host;
  let pathLabel = parsed.pathname.replace(/\/+$/, '');
  try { pathLabel = decodeURIComponent(pathLabel); } catch { /* keep the original path */ }
  if (host === 'github.com') {
    const parts = parsed.pathname.split('/').filter(Boolean);
    provider = parts.length >= 2 ? 'GitHub 저장소' : 'GitHub';
  } else if (host === 'huggingface.co') {
    const parts = parsed.pathname.split('/').filter(Boolean);
    provider = parts[0] === 'spaces' ? 'Hugging Face Space' : parts[0] === 'datasets' ? 'Hugging Face 데이터셋' : parts[0] === 'models' ? 'Hugging Face 모델' : 'Hugging Face';
  } else if (host === 'codepen.io') provider = 'CodePen';
  else if (host === 'figma.com') provider = 'Figma';
  const visibleUrl = `${host}${pathLabel}`.slice(0, 140);
  if (host === 'notion.so' || host.endsWith('notion.site')) provider = 'Notion';
  else if (host === 'figma.site') provider = 'Figma 사이트';
  const badge = provider === 'GitHub 저장소' ? 'GH' : provider.startsWith('Hugging Face') ? 'HF' : provider === 'Notion' ? 'N' : provider.startsWith('Figma') ? 'F' : '↗';
  return `
    <a class="record-link-preview" href="${safeHref}" target="_blank" rel="noopener noreferrer" aria-label="${title} — ${escapeHtml(externalLabel)}">
      <span class="record-link-preview-mark" aria-hidden="true">${escapeHtml(badge)}</span>
      <span class="record-link-preview-copy"><span class="record-link-preview-provider">${escapeHtml(provider)} · 링크 미리보기</span><strong>${title}</strong><span class="record-link-preview-url">${escapeHtml(visibleUrl || host)}</span><span class="record-link-preview-cta">${escapeHtml(externalLabel)} <span aria-hidden="true">↗</span></span></span>
      <span class="record-link-preview-arrow" aria-hidden="true">↗</span>
    </a>`;
}

function prettyDate(value) {
  if (!value) return '날짜 미정';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '날짜 미정';
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

function shortDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).format(date).replace(/\. /g, '.').replace(/\.$/, '');
}

function setStatus(kind, text) {
  liveStatus.classList.remove('error', 'loading');
  if (kind) liveStatus.classList.add(kind);
  statusText.textContent = text;
}

function toast(message, type = 'success') {
  const node = document.createElement('div');
  node.className = `toast${type === 'error' ? ' error' : ''}`;
  node.textContent = message;
  $('#toast-region').append(node);
  window.setTimeout(() => node.remove(), 4200);
}

function setPage(page) {
  if (!['home', 'portfolio', 'research'].includes(page)) return;
  state.page = page;
  $$('.page-view').forEach(section => {
    const active = section.id === `${page}-view`;
    section.hidden = !active;
    section.classList.toggle('active', active);
  });
  $$('.nav-item[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  closeDrawer();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openDrawer() {
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  drawerBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  $('#menu-close').focus();
}

function closeDrawer() {
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  drawerBackdrop.hidden = true;
  document.body.style.overflow = modalBackdrop.hidden ? '' : 'hidden';
}

function openModal({ title, kicker = 'ADMIN ACCESS', content, kind = null }) {
  state.lastFocus = document.activeElement;
  state.modalKind = kind;
  modalTitle.textContent = title;
  modalKicker.textContent = kicker;
  modalBody.innerHTML = content;
  modalBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  const first = $('input, textarea, button, select', modalBody);
  if (first) window.setTimeout(() => first.focus(), 30);
}

function closeModal() {
  modalBackdrop.hidden = true;
  modalBody.innerHTML = '';
  state.modalKind = null;
  document.body.style.overflow = drawer.classList.contains('open') ? 'hidden' : '';
  if (state.lastFocus && typeof state.lastFocus.focus === 'function') state.lastFocus.focus();
}

function openLogin() {
  openModal({
    title: '관리자 전용',
    kicker: 'PRIVATE AREA / AUTHENTICATION',
    kind: 'login',
    content: `
      <p class="modal-description">관리자 기능을 사용하려면 비밀번호를 입력해주세요.</p>
      <form id="login-form" novalidate>
        <div class="field"><label for="admin-password">비밀번호<span class="required">*</span></label><input id="admin-password" name="password" type="password" autocomplete="current-password" required placeholder="비밀번호를 입력해주세요."></div>
        <p class="form-error" id="form-error" role="alert"></p>
        <button class="primary-button" type="submit">인증하고 들어가기 <span aria-hidden="true">→</span></button>
      </form>
      <p class="modal-bottom-note">관리자 비밀번호는 브라우저 코드에 저장하지 않고 서버에서 확인합니다.</p>`
  });
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('button[type="submit"]', event.currentTarget);
    const password = $('#admin-password').value;
    const errorBox = $('#form-error');
    if (!password) return showFormError(errorBox, '비밀번호를 입력해주세요.');
    button.disabled = true;
    button.textContent = '인증 중…';
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error || '비밀번호가 올바르지 않습니다.');
      }
      state.adminAuthenticated = true;
      closeModal();
      openAdminPanel();
      renderArchive('portfolio');
      renderArchive('research');
    } catch (error) {
      showFormError(errorBox, error.message || '인증 요청에 실패했습니다. 서버 설정을 확인해주세요.');
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.innerHTML = '인증하고 들어가기 <span aria-hidden="true">→</span>';
      }
    }
  });
}

function showFormError(node, message) {
  if (!node) return;
  node.textContent = message;
  node.classList.add('visible');
}

function validateRecordPhoto(file, errorBox) {
  if (!file || !file.size) return true;
  if (file.size > MAX_RECORD_PHOTO_SIZE) {
    showFormError(errorBox, '사진은 5MB 이하만 첨부할 수 있습니다.');
    return false;
  }
  if (!ALLOWED_RECORD_PHOTO_TYPES.has(file.type)) {
    showFormError(errorBox, 'PNG, JPG, WebP, GIF 이미지 파일만 첨부할 수 있습니다.');
    return false;
  }
  return true;
}

function getRecordPhotoUrls(item) {
  let urls = Array.isArray(item?.photo_urls) ? item.photo_urls : [];
  if (!urls.length && typeof item?.photo_urls === 'string') {
    try {
      const parsed = JSON.parse(item.photo_urls);
      if (Array.isArray(parsed)) urls = parsed;
    } catch { /* legacy or malformed value; fall back to photo_url */ }
  }
  if (!urls.length && item?.photo_url) urls = [item.photo_url];
  return [...new Set(urls.map(safeWebUrl).filter(Boolean))].slice(0, 10);
}

function setupRecordPhotoPreview(initialUrls = []) {
  const input = $('#record-photo-input');
  const preview = $('#record-photo-preview');
  const caption = $('#record-photo-caption');
  if (!input || !preview || !caption) return { getFiles: () => [], getKeptUrls: () => [] };

  const keptUrls = [...new Set((Array.isArray(initialUrls) ? initialUrls : [initialUrls]).map(safeWebUrl).filter(Boolean))].slice(0, 10);
  const selectedFiles = [];
  let nextFileId = 0;

  function render() {
    const total = keptUrls.length + selectedFiles.length;
    const tiles = [
      ...keptUrls.map((url, index) => `
        <div class="record-photo-tile">
          <img src="${escapeHtml(url)}" alt="기존 첨부 사진 ${index + 1}" loading="lazy">
          <button type="button" class="record-photo-remove" data-remove-existing="${index}" aria-label="기존 사진 ${index + 1} 삭제" title="사진 삭제">×</button>
          <span class="record-photo-tile-label">기존 사진 ${index + 1}</span>
        </div>`),
      ...selectedFiles.map(file => `
        <div class="record-photo-tile">
          <img src="${escapeHtml(file.previewUrl)}" alt="${escapeHtml(file.name)} 미리보기">
          <button type="button" class="record-photo-remove" data-remove-new="${file.id}" aria-label="${escapeHtml(file.name)} 삭제" title="사진 삭제">×</button>
          <span class="record-photo-tile-label">${escapeHtml(file.name)}</span>
        </div>`)
    ];
    if (total < 10) {
      tiles.push(`<button type="button" class="record-photo-add" data-add-record-photo aria-label="사진 추가"><span class="record-photo-add-symbol" aria-hidden="true">+</span><span class="record-photo-add-label">사진 추가</span></button>`);
    }
    preview.innerHTML = tiles.join('');
    // The add tile and thumbnails share one grid; the browser's native chooser stays visually hidden.
    preview.hidden = false;
    caption.textContent = total
      ? `${total} / 10장 · 기존 ${keptUrls.length}장, 새 사진 ${selectedFiles.length}장 · ×로 삭제, +로 추가`
      : '0 / 10장 · + 타일을 눌러 사진을 추가할 수 있습니다.';
    const addButton = $('[data-add-record-photo]', preview);
    if (addButton) addButton.addEventListener('click', () => input.click());

    $$('[data-remove-existing]', preview).forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.removeExisting);
      if (Number.isInteger(index) && index >= 0 && index < keptUrls.length) {
        keptUrls.splice(index, 1);
        render();
      }
    }));
    $$('[data-remove-new]', preview).forEach(button => button.addEventListener('click', () => {
      const id = Number(button.dataset.removeNew);
      const index = selectedFiles.findIndex(file => file.id === id);
      if (index >= 0) {
        URL.revokeObjectURL(selectedFiles[index].previewUrl);
        selectedFiles.splice(index, 1);
        render();
      }
    }));
  }

  input.multiple = true;
  input.name = 'photos';
  input.addEventListener('change', () => {
    const incoming = [...(input.files || [])];
    const errorBox = $('#form-error');
    if (!incoming.length) return;
    if (keptUrls.length + selectedFiles.length + incoming.length > 10) {
      showFormError(errorBox, '사진은 기록 하나당 최대 10장까지 첨부할 수 있습니다.');
      input.value = '';
      return;
    }
    for (const file of incoming) {
      if (!validateRecordPhoto(file, errorBox)) {
        input.value = '';
        return;
      }
    }
    for (const file of incoming) {
      selectedFiles.push({ id: nextFileId++, file, name: file.name, previewUrl: URL.createObjectURL(file) });
    }
    input.value = '';
    if (errorBox) errorBox.classList.remove('visible');
    render();
  });

  render();
  return {
    getFiles: () => selectedFiles.map(entry => entry.file),
    getKeptUrls: () => [...keptUrls]
  };
}

function openAdminPanel() {
  openModal({
    title: '관리자 도구',
    kicker: 'ADMIN WORKSPACE',
    kind: 'dashboard',
    content: `
      <p class="modal-description">사이트에 공개할 내용을 선택하세요. 저장하면 방문자 화면에도 바로 반영됩니다.</p>
      ${!isConfigured ? '<div class="setup-notice">아직 Supabase 연결 설정이 완료되지 않았습니다. 먼저 <strong>config.js</strong>와 데이터베이스 설정을 완료해야 저장 기능을 사용할 수 있습니다.</div>' : ''}
      <div class="admin-action-list">
        <button class="admin-action" data-admin-action="profile"><span class="admin-action-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></span><span class="admin-action-copy"><strong>프로필 사진·설명 변경</strong><small>사진 미리보기 및 소개 문구 수정</small></span><span class="admin-action-arrow">→</span></button>
        <button class="admin-action" data-admin-action="portfolio"><span class="admin-action-icon"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M8 5V3h8v2M3 10h18M10 13h4"/></svg></span><span class="admin-action-copy"><strong>포트폴리오 올리기</strong><small>프로젝트 제목, 설명, 링크 등록</small></span><span class="admin-action-arrow">→</span></button>
        <button class="admin-action" data-admin-action="research"><span class="admin-action-icon"><svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/></svg></span><span class="admin-action-copy"><strong>연구 기록 쓰기</strong><small>실험과 학습 내용을 기록</small></span><span class="admin-action-arrow">→</span></button>
        <button class="admin-action" data-admin-action="manage-records"><span class="admin-action-icon"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg></span><span class="admin-action-copy"><strong>포트폴리오·연구 기록 삭제</strong><small>검색하고 여러 항목을 선택해 삭제</small></span><span class="admin-action-arrow">→</span></button>
      </div>
      <p class="modal-bottom-note">인증은 일정 시간이 지나면 만료됩니다. 관리자 메뉴에 다시 들어갈 때 비밀번호를 입력하면 됩니다.</p>`
  });
  $$('[data-admin-action]', modalBody).forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.adminAction;
    if (action === 'profile') openProfileForm();
    if (action === 'portfolio') openPortfolioForm();
    if (action === 'research') openResearchForm();
    if (action === 'manage-records') openDeleteManager();
  }));
}


function requestReauthentication({ title = '비밀번호 재인증', description = '계속하려면 오너 비밀번호를 입력해주세요.', onSuccess }) {
  openModal({
    title,
    kicker: 'CONFIRM OWNER PASSWORD',
    kind: 'reauth-before-edit',
    content: `
      <p class="modal-description">${escapeHtml(description)}</p>
      <form id="reauth-form" novalidate>
        <div class="field"><label for="reauth-password">오너 비밀번호<span class="required">*</span></label><input id="reauth-password" name="password" type="password" autocomplete="current-password" required placeholder="비밀번호를 입력해주세요."></div>
        <p class="form-error" id="form-error" role="alert"></p>
        <button class="primary-button" type="submit">인증하고 계속하기 <span aria-hidden="true">→</span></button>
      </form>`
  });
  $('#reauth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('button[type="submit"]', form);
    const password = $('#reauth-password').value;
    const errorBox = $('#form-error');
    if (!password) return showFormError(errorBox, '비밀번호를 입력해주세요.');
    button.disabled = true;
    button.textContent = '인증 중…';
    errorBox.classList.remove('visible');
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || '비밀번호가 올바르지 않습니다.');
      state.adminAuthenticated = true;
      if (typeof onSuccess === 'function') onSuccess();
    } catch (error) {
      showFormError(errorBox, error.message || '비밀번호 인증에 실패했습니다.');
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.innerHTML = '인증하고 계속하기 <span aria-hidden="true">→</span>';
      }
    }
  });
}

function openDeleteManager() {
  const selected = new Set();
  openModal({
    title: '포트폴리오·연구 기록 삭제',
    kicker: 'MANAGE PUBLISHED RECORDS',
    kind: 'delete-manager',
    content: `
      <p class="modal-description">포트폴리오와 연구 기록은 별도로 분류됩니다. 검색 후 여러 항목을 선택할 수 있어요.</p>
      <div class="field"><label for="delete-search">기록 검색</label><input id="delete-search" type="search" placeholder="제목 또는 내용으로 검색"></div>
      <div id="delete-record-groups" class="delete-record-groups"></div>
      <p class="field-hint" id="delete-selection-count">선택한 항목 0개</p>
      <p class="form-error" id="delete-error" role="alert"></p>
      <button class="primary-button danger-button" id="delete-selected-button" type="button" disabled>선택한 기록 삭제</button>`
  });
  const groups = $('#delete-record-groups');
  const search = $('#delete-search');
  const selectionCount = $('#delete-selection-count');
  const deleteButton = $('#delete-selected-button');
  const updateSelectionUi = () => {
    selectionCount.textContent = `선택한 항목 ${selected.size}개`;
    deleteButton.disabled = selected.size === 0;
  };
  const renderGroups = () => {
    const query = search.value.trim().toLocaleLowerCase('ko-KR');
    const matches = item => `${item.title || ''} ${item.description || ''} ${item.content || ''}`.toLocaleLowerCase('ko-KR').includes(query);
    const renderGroup = (type, items, label, descriptionField) => {
      const filtered = items.filter(matches).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      if (!filtered.length) return `<section class="delete-group"><h3>${label} <span>0개</span></h3><p class="delete-empty">${query ? '검색 결과가 없습니다.' : '등록된 기록이 없습니다.'}</p></section>`;
      return `<section class="delete-group"><h3>${label} <span>${filtered.length}개</span></h3><div class="delete-record-list">${filtered.map(item => {
        const key = `${type}:${item.id}`;
        const checked = selected.has(key) ? 'checked' : '';
        const summary = escapeHtml(String(item[descriptionField] || '').slice(0, 100));
        return `<label class="delete-record-item"><input type="checkbox" data-delete-key="${escapeHtml(key)}" ${checked}><span><strong>${escapeHtml(item.title || '제목 없음')}</strong><small>${summary || '내용 없음'}</small><time>${escapeHtml(shortDate(item.created_at))}</time></span></label>`;
      }).join('')}</div></section>`;
    };
    groups.innerHTML = renderGroup('portfolio', state.portfolios, '포트폴리오', 'description') + renderGroup('research', state.research, '연구 기록', 'content');
    $$('[data-delete-key]', groups).forEach(input => input.addEventListener('change', () => {
      if (input.checked) selected.add(input.dataset.deleteKey);
      else selected.delete(input.dataset.deleteKey);
      updateSelectionUi();
    }));
    updateSelectionUi();
  };
  search.addEventListener('input', renderGroups);
  deleteButton.addEventListener('click', () => {
    if (!selected.size) return;
    const items = [...selected].map(key => {
      const [type, ...idParts] = key.split(':');
      return { type, id: idParts.join(':') };
    });
    if (!window.confirm(`선택한 ${items.length}개 기록을 삭제할까요? 삭제 후 되돌릴 수 없습니다.`)) return;
    const form = new FormData();
    form.set('action', 'delete');
    form.set('items', JSON.stringify(items));
    submitAdminForm(deleteButton, form, $('#delete-error'), '선택한 기록이 삭제되었습니다.', '기록 삭제에 실패했습니다.');
  });
  renderGroups();
}

function openProfileForm() {
  openModal({
    title: '프로필 사진·설명 변경',
    kicker: 'EDIT PROFILE',
    kind: 'profile',
    content: `
      <p class="modal-description">이름은 변경되지 않습니다. 사진과 설명 중 필요한 항목만 입력하세요.</p>
      <form id="profile-form" novalidate>
        <div class="field"><label for="profile-photo">프로필 사진</label><input id="profile-photo" name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><p class="field-hint">PNG, JPG, WebP, GIF / 파일 크기 최대 1MB</p>
          <div class="preview-box"><div class="preview-avatar" id="photo-preview"><span>SJ</span></div><span class="preview-text" id="preview-caption">사진을 선택하면 미리보기가 표시됩니다.</span></div>
        </div>
        <div class="field"><label for="profile-description-input">소개 설명</label><textarea id="profile-description-input" name="description" maxlength="1000" placeholder="비워두면 기존 설명을 유지합니다."></textarea><p class="field-hint">최대 1,000자 · 입력하지 않으면 기존 설명 유지</p></div>
        <p class="form-error" id="form-error" role="alert"></p>
        <button class="primary-button" type="submit">변경사항 저장 <span aria-hidden="true">→</span></button>
      </form>`
  });
  const fileInput = $('#profile-photo');
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    const preview = $('#photo-preview');
    const caption = $('#preview-caption');
    if (!file) {
      preview.innerHTML = '<span>SJ</span>';
      caption.textContent = '사진을 선택하면 미리보기가 표시됩니다.';
      return;
    }
    if (file.size > 1024 * 1024) {
      fileInput.value = '';
      preview.innerHTML = '<span>SJ</span>';
      caption.textContent = '파일 크기는 1MB 이하여야 합니다.';
      showFormError($('#form-error'), '프로필 사진은 1MB 이하만 업로드할 수 있습니다.');
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      fileInput.value = '';
      showFormError($('#form-error'), 'PNG, JPG, WebP, GIF 이미지 파일을 선택해주세요.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { preview.innerHTML = `<img alt="프로필 사진 미리보기" src="${reader.result}">`; };
    reader.readAsDataURL(file);
    caption.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)}KB`;
    $('#form-error').classList.remove('visible');
  });
  $('#profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    const file = fileInput.files?.[0];
    const description = $('#profile-description-input').value.trim();
    const errorBox = $('#form-error');
    if (!file && !description) return showFormError(errorBox, '사진을 선택하거나 변경할 설명을 입력해주세요.');
    if (file && file.size > 1024 * 1024) return showFormError(errorBox, '프로필 사진은 1MB 이하여야 합니다.');
    const form = new FormData();
    form.set('action', 'profile');
    if (file) form.set('photo', file, file.name);
    if (description) form.set('description', description);
    await submitAdminForm(event.currentTarget, form, errorBox, '프로필이 변경되었습니다.', '프로필 저장에 실패했습니다.');
  });
}

function openPortfolioForm() {
  openModal({
    title: '포트폴리오 올리기',
    kicker: 'PUBLISH PROJECT',
    kind: 'portfolio',
    content: `
      <p class="modal-description">제목과 설명은 필수입니다. 링크와 사진은 선택사항입니다.</p>
      <form id="portfolio-form" novalidate>
        <div class="field"><label for="portfolio-title-input">제목<span class="required">*</span></label><input id="portfolio-title-input" name="title" maxlength="120" required placeholder="프로젝트 이름"></div>
        <div class="field"><label for="portfolio-description-input">설명<span class="required">*</span></label><textarea id="portfolio-description-input" name="description" maxlength="5000" required placeholder="무엇을 만들었고, 어떤 기술을 사용했는지 적어주세요."></textarea><p class="field-hint">최대 5,000자</p></div>
        <div class="field"><label for="portfolio-link-input">링크 <span class="field-hint" style="display:inline">(선택)</span></label><input id="portfolio-link-input" name="link" type="url" maxlength="500" placeholder="https://..." inputmode="url"></div>
        <div class="field record-photo-field"><label>사진 <span class="field-hint" style="display:inline">(선택)</span></label><input id="record-photo-input" class="record-photo-input-hidden" name="photos" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple tabindex="-1" aria-hidden="true"><p class="field-hint">PNG, JPG, WebP, GIF · 사진당 최대 5MB · 최대 10장</p><div class="record-photo-preview" id="record-photo-preview"></div><p class="field-hint" id="record-photo-caption">+ 타일을 눌러 사진을 추가할 수 있습니다.</p></div>
        <p class="form-error" id="form-error" role="alert"></p>
        <button class="primary-button" type="submit">포트폴리오 올리기 <span aria-hidden="true">→</span></button>
      </form>`
  });
  const photoPicker = setupRecordPhotoPreview();
  $('#portfolio-form').addEventListener('submit', async event => {
    event.preventDefault();
    const formNode = event.currentTarget;
    const errorBox = $('#form-error');
    const title = $('#portfolio-title-input').value.trim();
    const description = $('#portfolio-description-input').value.trim();
    const link = $('#portfolio-link-input').value.trim();
    const photos = photoPicker.getFiles();
    if (!title || !description) return showFormError(errorBox, '제목과 설명을 모두 입력해주세요.');
    if (link && !safeWebUrl(link)) return showFormError(errorBox, '링크는 http:// 또는 https:// 주소로 입력해주세요.');
    if (!photos.every(photo => validateRecordPhoto(photo, errorBox))) return;
    const form = new FormData();
    form.set('action', 'portfolio');
    form.set('title', title);
    form.set('description', description);
    if (link) form.set('link', link);
    photos.forEach(photo => form.append('photos', photo, photo.name));
    await submitAdminForm(formNode, form, errorBox, '포트폴리오가 등록되었습니다.', '포트폴리오 등록에 실패했습니다.');
  });
}

function openResearchForm() {
  openModal({
    title: '연구 기록 쓰기',
    kicker: 'WRITE LAB NOTE',
    kind: 'research',
    content: `
      <p class="modal-description">제목과 내용은 필수입니다. 링크와 사진은 선택사항입니다.</p>
      <form id="research-form" novalidate>
        <div class="field"><label for="research-title-input">제목<span class="required">*</span></label><input id="research-title-input" name="title" maxlength="160" required placeholder="연구 주제 또는 실험 이름"></div>
        <div class="field"><label for="research-content-input">내용<span class="required">*</span></label><textarea id="research-content-input" name="content" maxlength="15000" required placeholder="목표, 과정, 결과, 배운 점 등을 기록해주세요." style="min-height:150px"></textarea><p class="field-hint">최대 15,000자</p></div>
        <div class="field"><label for="research-link-input">링크 <span class="field-hint" style="display:inline">(선택)</span></label><input id="research-link-input" name="link" type="url" maxlength="500" placeholder="https://..." inputmode="url"></div>
        <div class="field record-photo-field"><label>사진 <span class="field-hint" style="display:inline">(선택)</span></label><input id="record-photo-input" class="record-photo-input-hidden" name="photos" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple tabindex="-1" aria-hidden="true"><p class="field-hint">PNG, JPG, WebP, GIF · 사진당 최대 5MB · 최대 10장</p><div class="record-photo-preview" id="record-photo-preview"></div><p class="field-hint" id="record-photo-caption">+ 타일을 눌러 사진을 추가할 수 있습니다.</p></div>
        <p class="form-error" id="form-error" role="alert"></p>
        <button class="primary-button" type="submit">연구 기록 쓰기 <span aria-hidden="true">→</span></button>
      </form>`
  });
  const photoPicker = setupRecordPhotoPreview();
  $('#research-form').addEventListener('submit', async event => {
    event.preventDefault();
    const formNode = event.currentTarget;
    const errorBox = $('#form-error');
    const title = $('#research-title-input').value.trim();
    const content = $('#research-content-input').value.trim();
    const link = $('#research-link-input').value.trim();
    const photos = photoPicker.getFiles();
    if (!title || !content) return showFormError(errorBox, '제목과 내용을 모두 입력해주세요.');
    if (link && !safeWebUrl(link)) return showFormError(errorBox, '링크는 http:// 또는 https:// 주소로 입력해주세요.');
    if (!photos.every(photo => validateRecordPhoto(photo, errorBox))) return;
    const form = new FormData();
    form.set('action', 'research');
    form.set('title', title);
    form.set('content', content);
    if (link) form.set('link', link);
    photos.forEach(photo => form.append('photos', photo, photo.name));
    await submitAdminForm(formNode, form, errorBox, '연구 기록이 등록되었습니다.', '연구 기록 등록에 실패했습니다.');
  });
}


function openEditForm(type, item) {
  const isPortfolio = type === 'portfolio';
  const title = escapeHtml(item.title || '');
  const body = escapeHtml(isPortfolio ? (item.description || '') : (item.content || ''));
  const link = escapeHtml(item.link || '');
  const titleMax = isPortfolio ? 120 : 160;
  const bodyMax = isPortfolio ? 5000 : 15000;
  openModal({
    title: isPortfolio ? '포트폴리오 수정' : '연구 기록 수정',
    kicker: isPortfolio ? 'EDIT PORTFOLIO' : 'EDIT RESEARCH NOTE',
    kind: 'edit-record',
    content: `
      <p class="modal-description">기존 내용이 입력되어 있습니다. 저장을 누르면 오너 비밀번호를 다시 확인합니다.</p>
      <form id="edit-record-form" novalidate>
        <div class="field"><label for="edit-record-title">제목<span class="required">*</span></label><input id="edit-record-title" name="title" maxlength="${titleMax}" required value="${title}"></div>
        <div class="field"><label for="edit-record-body">${isPortfolio ? '설명' : '내용'}<span class="required">*</span></label><textarea id="edit-record-body" name="body" maxlength="${bodyMax}" required>${body}</textarea></div>
        <div class="field"><label for="edit-record-link">링크 <span class="field-hint" style="display:inline">(선택)</span></label><input id="edit-record-link" name="link" type="url" maxlength="500" value="${link}" placeholder="https://..."></div>
        <div class="field record-photo-field"><label>사진 <span class="field-hint" style="display:inline">(선택)</span></label><input id="record-photo-input" class="record-photo-input-hidden" name="photos" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple tabindex="-1" aria-hidden="true"><p class="field-hint">PNG, JPG, WebP, GIF · 사진당 최대 5MB · 최대 10장</p><div class="record-photo-preview" id="record-photo-preview"></div><p class="field-hint" id="record-photo-caption">+ 타일을 눌러 사진을 추가할 수 있습니다.</p></div>
        <p class="form-error" id="form-error" role="alert"></p>
        <button class="primary-button" type="submit">저장 <span aria-hidden="true">→</span></button>
      </form>`
  });
  const photoPicker = setupRecordPhotoPreview(getRecordPhotoUrls(item));
  $('#edit-record-form').addEventListener('submit', async event => {
    event.preventDefault();
    const formNode = event.currentTarget;
    const errorBox = $('#form-error');
    const newTitle = $('#edit-record-title').value.trim();
    const newBody = $('#edit-record-body').value.trim();
    const newLink = $('#edit-record-link').value.trim();
    const photos = photoPicker.getFiles();
    if (!newTitle || !newBody) return showFormError(errorBox, '제목과 내용은 필수입니다.');
    if (newLink && !safeWebUrl(newLink)) return showFormError(errorBox, '링크는 http:// 또는 https:// 주소로 입력해주세요.');
    if (!photos.every(photo => validateRecordPhoto(photo, errorBox))) return;
    const form = new FormData();
    form.set('action', isPortfolio ? 'edit-portfolio' : 'edit-research');
    form.set('id', String(item.id));
    form.set('title', newTitle);
    if (isPortfolio) form.set('description', newBody); else form.set('content', newBody);
    if (newLink) form.set('link', newLink);
    form.set('keep_photo_urls', JSON.stringify(photoPicker.getKeptUrls()));
    photos.forEach(photo => form.append('photos', photo, photo.name));
    await submitAdminForm(formNode, form, errorBox, isPortfolio ? '포트폴리오가 수정되었습니다.' : '연구 기록이 수정되었습니다.', '수정에 실패했습니다.');
  });
}

async function submitAdminForm(formNode, formData, errorBox, successMessage, genericError) {
  // The owner is asked to re-authenticate after pressing the final save/publish button.
  openModal({
    title: '비밀번호 재인증',
    kicker: 'CONFIRM ADMIN ACTION',
    kind: 'reauth',
    content: `
      <p class="modal-description">저장하기 전에 오너 비밀번호를 한 번 더 입력해주세요.</p>
      <form id="reauth-form" novalidate>
        <div class="field"><label for="reauth-password">오너 비밀번호<span class="required">*</span></label><input id="reauth-password" name="password" type="password" autocomplete="current-password" required placeholder="비밀번호를 다시 입력해주세요."></div>
        <p class="form-error" id="form-error" role="alert"></p>
        <button class="primary-button" type="submit">인증하고 저장하기 <span aria-hidden="true">→</span></button>
      </form>
      <p class="modal-bottom-note">입력한 비밀번호는 페이지 코드에 저장되지 않으며 서버에서 확인합니다.</p>`
  });
  const reauthForm = $('#reauth-form');
  reauthForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('button[type="submit"]', reauthForm);
    const password = $('#reauth-password').value;
    const error = $('#form-error');
    if (!password) return showFormError(error, '비밀번호를 입력해주세요.');
    button.disabled = true;
    button.textContent = '인증 중…';
    error.classList.remove('visible');
    try {
      const authResponse = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password })
      });
      const authResult = await authResponse.json().catch(() => ({}));
      if (!authResponse.ok || !authResult.ok) {
        throw new Error(authResult.error || '비밀번호가 올바르지 않습니다.');
      }
      button.textContent = '저장 중…';
      const response = await fetch('/api/admin', { method: 'POST', body: formData, credentials: 'same-origin' });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error('인증이 만료되었습니다. 다시 비밀번호를 입력해주세요.');
      if (!response.ok || !result.ok) throw new Error(result.error || genericError);
      closeModal();
      toast(successMessage);
      if (isConfigured) await loadData();
      if (state.page === 'home') renderHome();
    } catch (error) {
      showFormError($('#form-error'), error.message || genericError);
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.innerHTML = '인증하고 저장하기 <span aria-hidden="true">→</span>';
      }
    }
  });
}

function updateProfileCard() {
  $('#profile-name').textContent = '신준호';
  $('#profile-description').textContent = state.profile.description || '';
  const img = $('#profile-avatar');
  const fallback = $('#avatar-fallback');
  if (state.profile.avatar_url && safeWebUrl(state.profile.avatar_url)) {
    img.src = state.profile.avatar_url;
    img.hidden = false;
    fallback.hidden = true;
    img.onerror = () => { img.hidden = true; fallback.hidden = false; };
  } else {
    img.hidden = true;
    fallback.hidden = false;
  }
}

function renderHome() {
  updateProfileCard();
  // 홈에는 포트폴리오와 연구 기록 각각 가장 최근 항목 하나만 표시합니다.
  const portfolios = [...state.portfolios]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 1);
  const research = [...state.research]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 1);
  renderHomeRecords($('#home-portfolios'), portfolios, 'portfolio');
  renderHomeRecords($('#home-research'), research, 'research');
  const rawHfUrl = config.huggingFaceUrl || '';
  const rawGithubUrl = config.githubUrl || '';
  const hfUrl = (!rawHfUrl.includes('YOUR_USERNAME') && safeWebUrl(rawHfUrl)) || 'https://huggingface.co/';
  const githubUrl = (!rawGithubUrl.includes('YOUR_USERNAME') && safeWebUrl(rawGithubUrl)) || 'https://github.com/';
  $('#huggingface-link').href = hfUrl;
  $('#github-link').href = githubUrl;
}

function renderHomeRecords(container, items, type) {
  if (!items.length) {
    container.innerHTML = type === 'portfolio'
      ? '<div class="empty-state compact"><span class="empty-icon">↗</span><p>아직 등록된 포트폴리오가 없습니다.</p></div>'
      : '<div class="empty-state compact"><span class="empty-icon">✳</span><p>첫 번째 연구 기록을 기다리고 있어요.</p></div>';
    return;
  }

  const item = items[0];
  const title = escapeHtml(item.title || '제목 없음');
  const rawExcerpt = (item.description || item.content || '').trim();
  const excerpt = escapeHtml(rawExcerpt.length > 220 ? `${rawExcerpt.slice(0, 220)}…` : rawExcerpt);
  const photoUrl = getRecordPhotoUrls(item)[0] || '';
  const linkUrl = safeWebUrl(item.link || '');
  const linkPreviewHtml = linkUrl
    ? getRecordLinkEmbedHtml(linkUrl, item.title || '', type)
    : '';
  let mediaHtml = '';

  // 사진과 링크가 모두 있으면 사진은 '보조' 칸, 링크 임베드는 '사진' 칸에 배치합니다.
  if (photoUrl && linkPreviewHtml) {
    mediaHtml = `
      <div class="home-record-media home-record-media-dual" aria-label="첨부 미디어 미리보기">
        <div class="home-record-media-slot">
          <span class="home-record-media-label">보조</span>
          <div class="home-record-photo-frame">
            <img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(item.title || '첨부 사진')}" loading="lazy">
          </div>
        </div>
        <div class="home-record-media-slot">
          <span class="home-record-media-label">사진</span>
          <div class="home-record-link-embed">${linkPreviewHtml}</div>
        </div>
      </div>`;
  } else if (photoUrl) {
    mediaHtml = `
      <div class="home-record-media home-record-media-single" aria-label="첨부 사진 미리보기">
        <div class="home-record-media-slot">
          <span class="home-record-media-label">사진</span>
          <div class="home-record-photo-frame">
            <img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(item.title || '첨부 사진')}" loading="lazy">
          </div>
        </div>
      </div>`;
  } else if (linkPreviewHtml) {
    mediaHtml = `
      <div class="home-record-media home-record-media-single home-record-media-link-only" aria-label="링크 미리보기">
        <div class="home-record-media-slot">
          <span class="home-record-media-label">링크</span>
          <div class="home-record-link-embed">${linkPreviewHtml}</div>
        </div>
      </div>`;
  }

  container.innerHTML = `
    <article class="home-record-item">
      <button class="home-record-main" type="button" data-open-record="${escapeHtml(item.id)}" data-record-type="${type}" aria-label="${title} 상세 보기">
        <span class="home-record-title">${title}</span>
        <span class="home-record-excerpt">${excerpt || '아직 설명이 없습니다.'}</span>
        <span class="home-record-date">${escapeHtml(shortDate(item.created_at))}</span>
      </button>
      ${mediaHtml}
    </article>`;

  $$('[data-open-record]', container).forEach(button => button.addEventListener('click', () => {
    setPage(type);
    window.setTimeout(() => {
      const target = $(`[data-record-id="${CSS.escape(button.dataset.openRecord)}"]`, $(`#${type}-list`));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('expanded');
      }
    }, 80);
  }));
}

function renderArchive(type) {
  const items = type === 'portfolio' ? state.portfolios : state.research;
  const container = $(`#${type}-list`);
  const countEl = $(`#${type}-count`);
  const summaryEl = $(`#${type}-summary`);
  const sortValue = $(`#${type}-sort`).value;
  const viewMode = state.view[type];
  const sorted = [...items].sort((a, b) => {
    const aDate = new Date(a.created_at || 0).getTime();
    const bDate = new Date(b.created_at || 0).getTime();
    return sortValue === 'oldest' ? aDate - bDate : bDate - aDate;
  });

  countEl.textContent = String(items.length).padStart(2, '0');
  summaryEl.textContent = `전체 ${items.length}개 ${type === 'portfolio' ? '프로젝트' : '연구 기록'}`;
  container.classList.toggle('detail-view', viewMode === 'detail');
  container.classList.toggle('list-view', viewMode === 'list');
  $$(`#${type}-view [data-view]`).forEach(button => {
    button.classList.toggle('active', button.dataset.view === viewMode);
    button.setAttribute('aria-pressed', String(button.dataset.view === viewMode));
  });

  if (!sorted.length) {
    container.classList.add('empty-list');
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">${type === 'portfolio' ? '↗' : '✳'}</span><p>${type === 'portfolio' ? '아직 공개된 포트폴리오가 없습니다.' : '아직 작성된 연구 기록이 없습니다.'}</p><span style="font-size:10px">새 기록이 등록되면 이곳에 표시됩니다.</span></div>`;
    return;
  }

  container.classList.remove('empty-list');
  container.innerHTML = sorted.map((item, index) => {
    const title = escapeHtml(item.title || '제목 없음');
    const rawBody = String(type === 'portfolio' ? (item.description || '') : (item.content || '')).trim();
    const body = escapeHtml(rawBody);
    const link = safeWebUrl(item.link || '');
    const photoUrls = getRecordPhotoUrls(item);
    const date = escapeHtml(prettyDate(item.created_at));
    const category = type === 'portfolio' ? 'PORTFOLIO' : 'RESEARCH NOTE';
    const editButton = state.adminAuthenticated
      ? `<button class="archive-edit-button" type="button" data-edit-record="${escapeHtml(item.id)}" data-edit-type="${type}">수정</button>`
      : '';

    // List view intentionally behaves like a compact file-list: metadata, name, short excerpt,
    // and small indicators only. Heavy media previews belong to Detail view.
    if (viewMode === 'list') {
      const excerptText = rawBody.length > 155 ? `${rawBody.slice(0, 155)}…` : rawBody;
      const excerpt = escapeHtml(excerptText || '설명이 없습니다.');
      const mediaIndicators = [
        photoUrls.length ? `<span class="archive-list-media-badge" title="첨부 사진 ${photoUrls.length}장">▧ 사진 ${photoUrls.length}${photoUrls.length > 1 ? '장' : ''}</span>` : '',
        link ? '<span class="archive-list-media-badge" title="링크 첨부">↗ 링크</span>' : ''
      ].filter(Boolean).join('');

      return `
        <article class="archive-card archive-list-row" data-record-id="${escapeHtml(item.id)}" style="animation-delay:${Math.min(index * 25, 200)}ms">
          <span class="archive-list-row-mark" aria-hidden="true">${type === 'portfolio' ? '↗' : '✳'}</span>
          <div class="archive-list-row-content">
            <div class="archive-card-top"><span class="archive-category">${category}</span><time class="archive-date">${date}</time></div>
            <h2>${title}</h2>
            <p class="archive-list-excerpt">${excerpt}</p>
          </div>
          <div class="archive-list-row-side">${mediaIndicators}${editButton}</div>
        </article>`;
    }

    // Detail view shows the complete text, every attached photo, and the full link/embed preview.
    const linkEmbedHtml = link ? getRecordLinkEmbedHtml(link, item.title || '', type) : '';
    const photoHtml = photoUrls.length
      ? `<div class="archive-record-gallery">${photoUrls.map((url, photoIndex) => `
          <a class="archive-record-image-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(item.title || '첨부 이미지')} 사진 ${photoIndex + 1} 새 탭에서 열기">
            <img class="archive-record-image" src="${escapeHtml(url)}" alt="${escapeHtml(item.title || '첨부 이미지')} 사진 ${photoIndex + 1}" loading="lazy">
          </a>`).join('')}</div>`
      : '';

    return `
      <article class="archive-card detail-card" data-record-id="${escapeHtml(item.id)}" style="animation-delay:${Math.min(index * 35, 245)}ms">
        <div class="archive-card-main">
          <div class="archive-card-top">
            <span class="archive-category">${category}</span>
            <span class="archive-card-top-actions">${editButton}<time class="archive-date">${date}</time></span>
          </div>
          <h2>${title}</h2>
          <p class="archive-description">${body || '내용이 없습니다.'}</p>
          ${photoHtml}
          ${linkEmbedHtml}
        </div>
      </article>`;
  }).join('');

  $$('[data-edit-record]', container).forEach(button => button.addEventListener('click', () => {
    const recordType = button.dataset.editType;
    const records = recordType === 'portfolio' ? state.portfolios : state.research;
    const item = records.find(record => String(record.id) === button.dataset.editRecord);
    if (!item) return toast('수정할 기록을 찾지 못했습니다. 새로고침 후 다시 시도해주세요.', 'error');
    requestReauthentication({
      title: '수정 전 오너 인증',
      description: '기록을 수정하려면 오너 비밀번호를 입력해주세요.',
      onSuccess: () => openEditForm(recordType, item)
    });
  }));
}
async function loadData() {
  if (!supabase) {
    setStatus('loading', '데이터베이스 설정 필요');
    renderHome(); renderArchive('portfolio'); renderArchive('research');
    return;
  }
  try {
    const [profileResult, portfolioResult, researchResult] = await Promise.all([
      supabase.from('profiles').select('id,display_name,description,avatar_url,updated_at').eq('id', 1).maybeSingle(),
      supabase.from('portfolios').select('id,title,description,link,photo_url,photo_urls,created_at').order('created_at', { ascending: false }),
      supabase.from('research_records').select('id,title,content,link,photo_url,photo_urls,created_at').order('created_at', { ascending: false })
    ]);
    const firstError = profileResult.error || portfolioResult.error || researchResult.error;
    if (firstError) throw firstError;
    if (profileResult.data) state.profile = { ...state.profile, ...profileResult.data };
    state.portfolios = portfolioResult.data || [];
    state.research = researchResult.data || [];
    setStatus('connected', '실시간 연결됨');
    renderHome(); renderArchive('portfolio'); renderArchive('research');
  } catch (error) {
    console.error('Failed to load public data:', error);
    setStatus('error', '데이터 연결 오류');
    if (!$('#data-error-notice')) {
      const notice = document.createElement('div');
      notice.id = 'data-error-notice'; notice.className = 'setup-notice';
      notice.textContent = '데이터베이스에서 정보를 불러오지 못했습니다. Supabase URL·공개 키와 SQL 설정을 확인해주세요.';
      $('.page-view.active .page-title-row')?.after(notice);
    }
    renderHome(); renderArchive('portfolio'); renderArchive('research');
  }
}

function connectRealtime() {
  if (!supabase) return;
  if (state.realtimeChannel) supabase.removeChannel(state.realtimeChannel);
  state.realtimeChannel = supabase.channel('public-portfolio-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadData())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'portfolios' }, () => loadData())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'research_records' }, () => loadData())
    .subscribe(status => {
      if (status === 'SUBSCRIBED') setStatus('connected', '실시간 연결됨');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setStatus('error', '실시간 연결 오류');
      else if (status === 'CLOSED') setStatus('loading', '실시간 연결 종료');
    });
}

function wireInteractions() {
  $('#menu-open').addEventListener('click', openDrawer);
  $('#menu-close').addEventListener('click', closeDrawer);
  drawerBackdrop.addEventListener('click', closeDrawer);
  $('#brand-home').addEventListener('click', event => { event.preventDefault(); setPage('home'); });
  $$('.nav-item[data-page]').forEach(button => button.addEventListener('click', () => setPage(button.dataset.page)));
  $('#admin-nav').addEventListener('click', () => { closeDrawer(); openLogin(); });
  $('#modal-close').addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', event => { if (event.target === modalBackdrop) closeModal(); });
  $$('[data-go]').forEach(button => button.addEventListener('click', () => setPage(button.dataset.go)));
  $('#portfolio-sort').addEventListener('change', () => renderArchive('portfolio'));
  $('#research-sort').addEventListener('change', () => renderArchive('research'));
  $$('[data-view]').forEach(button => button.addEventListener('click', () => {
    const type = button.closest('#portfolio-view') ? 'portfolio' : 'research';
    state.view[type] = button.dataset.view;
    renderArchive(type);
  }));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!modalBackdrop.hidden) closeModal();
      else if (drawer.classList.contains('open')) closeDrawer();
    }
  });
}

wireInteractions();
renderHome();
renderArchive('portfolio');
renderArchive('research');
if (isConfigured) {
  loadData().then(connectRealtime);
} else {
  setStatus('loading', '데이터베이스 설정 필요');
}
