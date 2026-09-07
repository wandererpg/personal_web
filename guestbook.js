(function initGuestbook(globalScope) {
  const document = globalScope.document;
  const root = document?.querySelector('[data-guestbook]');
  if (!document || !root) return;

  const MAX_FILES = 3;
  const MAX_FILE_BYTES = 4 * 1024 * 1024;
  const one = selector => root.querySelector(selector);
  const state = { entries: [], loading: true, error: false, previewUrls: [] };

  const element = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  };

  const formatDate = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '刚刚';
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).format(date);
  };

  const setStatus = (message, tone = '') => {
    const node = one('[data-guestbook-status]');
    if (node) {
      node.textContent = message;
      node.dataset.tone = tone;
    }
  };

  const clearPreview = () => {
    state.previewUrls.forEach(url => globalScope.URL.revokeObjectURL(url));
    state.previewUrls = [];
    one('[data-guestbook-preview]')?.replaceChildren();
  };

  const renderPreview = files => {
    clearPreview();
    const preview = one('[data-guestbook-preview]');
    if (!preview) return;
    files.forEach(file => {
      const url = globalScope.URL.createObjectURL(file);
      state.previewUrls.push(url);
      const image = element('img', '', '');
      image.src = url;
      image.alt = file.name;
      preview.append(image);
    });
  };

  const safeImageUrl = value => {
    if (typeof value !== 'string' || !value.startsWith('/api/guestbook/media/')) return '';
    return value;
  };

  const renderEntry = entry => {
    const article = element('article', 'guestbook__entry');
    const header = element('header', 'guestbook__entry-header');
    header.append(
      element('strong', '', entry.nickname || '匿名访客'),
      element('time', '', formatDate(entry.createdAt)),
    );
    article.append(header);
    if (entry.message) article.append(element('p', 'guestbook__entry-message', entry.message));
    const images = element('div', 'guestbook__entry-images');
    (Array.isArray(entry.images) ? entry.images : []).forEach(image => {
      const src = safeImageUrl(image.url);
      if (!src) return;
      const node = element('img', '', '');
      node.src = src;
      node.alt = `${entry.nickname || '访客'}上传的图片`;
      node.loading = 'lazy';
      images.append(node);
    });
    if (images.childElementCount) article.append(images);
    return article;
  };

  const render = () => {
    const list = one('[data-guestbook-list]');
    const empty = one('[data-guestbook-empty]');
    const error = one('[data-guestbook-error]');
    if (list) list.replaceChildren(...state.entries.map(renderEntry));
    if (empty) empty.hidden = state.loading || state.error || state.entries.length > 0;
    if (error) error.hidden = !state.error;
  };

  const readError = async response => {
    try {
      const payload = await response.json();
      return {
        GUESTBOOK_RATE_LIMITED: '留言太频繁了，请稍后再试。',
        GUESTBOOK_CONTENT_REQUIRED: '请写一点文字或添加图片。',
        IMAGE_TYPE_INVALID: '图片格式不受支持。',
        IMAGE_SIZE_INVALID: '图片不能超过 4MB。',
        IMAGE_COUNT_INVALID: '最多上传 3 张图片。',
      }[payload.error] || '留言发送失败，请稍后重试。';
    } catch {
      return '留言发送失败，请稍后重试。';
    }
  };

  const load = async () => {
    state.loading = true;
    state.error = false;
    render();
    try {
      const response = await globalScope.fetch('/api/guestbook', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      state.entries = Array.isArray(payload.entries) ? payload.entries : [];
    } catch {
      state.error = true;
    } finally {
      state.loading = false;
      render();
    }
  };

  const validateFiles = files => {
    if (files.length > MAX_FILES) return '最多上传 3 张图片。';
    if (files.some(file => file.size > MAX_FILE_BYTES)) return '单张图片不能超过 4MB。';
    return '';
  };

  const submit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const files = [...(one('[data-guestbook-images]')?.files || [])];
    const fileError = validateFiles(files);
    if (fileError) {
      setStatus(fileError, 'error');
      return;
    }
    const message = one('[data-guestbook-message]')?.value.trim() || '';
    if (!message && files.length === 0) {
      setStatus('请写一点文字或添加图片。', 'error');
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus('正在发射…', 'pending');
    try {
      const response = await globalScope.fetch('/api/guestbook', { method: 'POST', body: new FormData(form) });
      if (!response.ok) throw new Error(await readError(response));
      form.reset();
      clearPreview();
      setStatus('留言已进入轨道。', 'saved');
      await load();
    } catch (error) {
      setStatus(error.message || '留言发送失败，请稍后重试。', 'error');
    } finally {
      button.disabled = false;
    }
  };

  document.querySelectorAll('[data-bot-icon] img').forEach(image => {
    image.addEventListener('error', () => { image.hidden = true; });
  });
  one('[data-guestbook-images]')?.addEventListener('change', event => {
    const files = [...event.target.files];
    const error = validateFiles(files);
    renderPreview(files.slice(0, MAX_FILES));
    setStatus(error, error ? 'error' : '');
  });
  one('[data-guestbook-form]')?.addEventListener('submit', submit);
  globalScope.addEventListener('beforeunload', clearPreview, { once: true });
  void load();
}(typeof window !== 'undefined' ? window : globalThis));
