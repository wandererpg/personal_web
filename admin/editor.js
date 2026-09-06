(function AdminEditor() {
  const AUTOSAVE_DELAY = 1500;
  const id = new URLSearchParams(window.location.search).get('id');
  const state = { post: null, dirty: false, revision: 0, saving: false, uploading: false, publishing: false };
  let saveTimer = 0;

  const one = selector => document.querySelector(selector);
  const fields = () => ({
    title: one('[data-editor-title]').value,
    slug: one('[data-editor-slug]').value,
    module: one('[data-editor-module]').value,
    excerpt: one('[data-editor-excerpt]').value,
    tags: one('[data-editor-tags]').value,
    cover: one('[data-editor-cover]').value,
    body: one('[data-editor-body]').value
  });

  function setStatus(message, tone = '') {
    const node = one('[data-editor-status]');
    node.textContent = message;
    node.dataset.tone = tone;
  }

  function updateButtons() {
    const busy = state.saving || state.uploading || state.publishing;
    one('[data-editor-save]').disabled = busy || !state.dirty;
    one('[data-editor-publish]').disabled = busy;
  }

  function renderPreview() {
    const markdown = one('[data-editor-body]').value;
    one('[data-editor-preview]').innerHTML = window.WandererBlog.renderMarkdown(markdown, { allowPrivateMedia: true })
      || '<p class="editor-preview-empty">预览会随着 Markdown 内容实时更新。</p>';
  }

  function setDirty() {
    state.dirty = true;
    state.revision += 1;
    setStatus('有未保存的更改', 'dirty');
    updateButtons();
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveDraft({ quiet: true }).catch(() => {}), AUTOSAVE_DELAY);
  }

  function payload() {
    return { version: state.post.version, ...window.AdminModel.normalizeEditorPayload(fields()) };
  }

  async function saveDraft({ quiet = false } = {}) {
    window.clearTimeout(saveTimer);
    if (!state.post || !state.dirty || state.saving) return state.post;
    const revision = state.revision;
    state.saving = true;
    if (!quiet) setStatus('正在保存…');
    updateButtons();
    try {
      const response = await window.AdminApi.request(`/api/admin/posts/${encodeURIComponent(id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload())
      });
      state.post = response.post;
      if (state.revision === revision) {
        state.dirty = false;
        setStatus('已保存', 'saved');
      } else {
        saveTimer = window.setTimeout(() => saveDraft({ quiet: true }).catch(() => {}), AUTOSAVE_DELAY);
      }
      return state.post;
    } catch (error) {
      setStatus(error.code === 'VERSION_CONFLICT' ? '版本发生冲突，请刷新后继续' : '保存失败，请重试', 'error');
      throw error;
    } finally {
      state.saving = false;
      updateButtons();
    }
  }

  function showValidation(errors) {
    document.querySelectorAll('[data-error-for]').forEach(node => { node.textContent = ''; });
    document.querySelectorAll('[aria-invalid="true"]').forEach(node => node.removeAttribute('aria-invalid'));
    const messages = { title: '请填写文章标题', slug: '请使用小写字母、数字和连字符', module: '请选择内容模块',
      excerpt: '请填写预览摘要', body: '请填写文章正文' };
    for (const field of errors) {
      one(`[data-error-for="${field}"]`).textContent = messages[field];
      one(`[data-editor-${field}]`)?.setAttribute('aria-invalid', 'true');
    }
    one(`[data-editor-${errors[0]}]`)?.focus();
  }

  async function publish() {
    const normalized = window.AdminModel.normalizeEditorPayload(fields());
    const errors = window.AdminModel.validateForPublish(normalized);
    if (errors.length) {
      showValidation(errors);
      setStatus('请先补全必填内容', 'error');
      return;
    }
    state.publishing = true;
    updateButtons();
    setStatus('正在保存并发射…');
    try {
      if (state.dirty) await saveDraft();
      const response = await window.AdminApi.request(`/api/admin/posts/${encodeURIComponent(id)}/publish`, { method: 'POST' });
      if (response.syncStatus === 'synced') {
        setStatus('发布完成，正在打开文章', 'saved');
        window.location.assign(`/post.html?slug=${encodeURIComponent(response.post.slug)}`);
      } else {
        one('[data-editor-sync]').hidden = false;
        setStatus('文章已提交，等待 Git 同步', 'pending');
      }
    } catch (error) {
      if (error.code === 'GIT_PUSH_PENDING') {
        one('[data-editor-sync]').hidden = false;
        setStatus('文章已在本机提交，Git 推送待重试', 'pending');
      } else {
        setStatus('发布失败，草稿仍然安全保存', 'error');
      }
    } finally {
      state.publishing = false;
      updateButtons();
    }
  }

  async function retrySync() {
    const button = one('[data-editor-sync]');
    button.disabled = true;
    setStatus('正在重试 Git 同步…');
    try {
      const response = await window.AdminApi.request('/api/admin/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draftId: id })
      });
      if (response.syncStatus === 'synced') {
        button.hidden = true;
        setStatus('同步完成', 'saved');
        window.location.assign(`/post.html?slug=${encodeURIComponent(one('[data-editor-slug]').value)}`);
      }
    } catch {
      setStatus('同步仍未完成，请稍后重试', 'error');
      button.disabled = false;
    }
  }

  function insert(markdown, start, end) {
    const body = one('[data-editor-body]');
    const result = window.AdminModel.insertMarkdown(body.value, start, end, markdown);
    body.value = result.value;
    body.focus();
    body.setSelectionRange(result.cursor, result.cursor);
    renderPreview();
    setDirty();
  }

  async function uploadImage(file, mode = 'body') {
    if (!file || !file.type.startsWith('image/')) return;
    const alt = window.prompt(mode === 'cover' ? '请填写封面图片说明' : '请填写图片说明（用于无障碍阅读）');
    if (!alt?.trim()) return;
    const body = one('[data-editor-body]');
    const selection = { start: body.selectionStart, end: body.selectionEnd };
    const form = new FormData();
    form.append('alt', alt.trim());
    form.append('image', file);
    state.uploading = true;
    updateButtons();
    setStatus('正在上传图片…');
    try {
      const response = await window.AdminApi.request(`/api/admin/posts/${encodeURIComponent(id)}/media`, {
        method: 'POST', body: form
      });
      if (mode === 'cover') {
        one('[data-editor-cover]').value = response.asset.url;
        one('[data-editor-cover-name]').textContent = `${file.name} · 已存入私人草稿`;
        setDirty();
      } else {
        insert(response.markdown, selection.start, selection.end);
      }
      setStatus('图片已加入草稿', 'saved');
    } catch {
      setStatus('图片上传失败，请确认格式和大小', 'error');
    } finally {
      state.uploading = false;
      one(mode === 'cover' ? '[data-editor-cover-file]' : '[data-editor-file]').value = '';
      updateButtons();
    }
  }

  function applyFormat(button) {
    const body = one('[data-editor-body]');
    const selected = body.value.slice(body.selectionStart, body.selectionEnd);
    if (button.dataset.editorWrap !== undefined) {
      const wrap = button.dataset.editorWrap;
      insert(`${wrap}${selected || '文本'}${wrap}`, body.selectionStart, body.selectionEnd);
    } else {
      insert(`${button.dataset.editorFormat}${selected}`, body.selectionStart, body.selectionEnd);
    }
  }

  function bind() {
    document.querySelectorAll('input:not([type="file"]), textarea, select').forEach(control => {
      control.addEventListener('input', () => {
        if (control.matches('[data-editor-body]')) renderPreview();
        if (control.matches('[data-editor-title]')) one('[data-editor-document-title]').textContent = control.value.trim() || '未命名文章';
        setDirty();
      });
    });
    one('[data-editor-save]').addEventListener('click', () => saveDraft().catch(() => {}));
    one('[data-editor-publish]').addEventListener('click', publish);
    one('[data-editor-sync]').addEventListener('click', retrySync);
    one('[data-editor-upload]').addEventListener('click', () => one('[data-editor-file]').click());
    one('[data-editor-file]').addEventListener('change', event => uploadImage(event.target.files[0]));
    one('[data-editor-cover-upload]').addEventListener('click', () => one('[data-editor-cover-file]').click());
    one('[data-editor-cover-file]').addEventListener('change', event => uploadImage(event.target.files[0], 'cover'));
    document.querySelectorAll('[data-editor-format], [data-editor-wrap]').forEach(button => button.addEventListener('click', () => applyFormat(button)));
    document.querySelectorAll('[data-editor-tab]').forEach(tab => tab.addEventListener('click', () => {
      document.querySelectorAll('[data-editor-tab]').forEach(node => node.classList.toggle('is-active', node === tab));
      one('[data-editor-write-pane]').classList.toggle('is-tab-hidden', tab.dataset.editorTab === 'preview');
      one('[data-editor-preview]').classList.toggle('is-tab-visible', tab.dataset.editorTab === 'preview');
    }));
    const body = one('[data-editor-body]');
    body.addEventListener('dragover', event => event.preventDefault());
    body.addEventListener('drop', event => { event.preventDefault(); uploadImage(event.dataTransfer.files[0]); });
    body.addEventListener('paste', event => {
      const image = [...event.clipboardData.items].find(item => item.type.startsWith('image/'))?.getAsFile();
      if (image) { event.preventDefault(); uploadImage(image); }
    });
    window.addEventListener('beforeunload', event => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  async function load() {
    if (!id) return window.location.replace('/admin');
    try {
      const response = await window.AdminApi.request(`/api/admin/posts/${encodeURIComponent(id)}`);
      state.post = response.post;
      const post = response.post;
      one('[data-editor-title]').value = post.title;
      one('[data-editor-slug]').value = post.slug;
      one('[data-editor-module]').value = post.module;
      one('[data-editor-excerpt]').value = post.excerpt;
      one('[data-editor-tags]').value = post.tags.join(', ');
      one('[data-editor-cover]').value = post.cover;
      one('[data-editor-body]').value = post.body;
      one('[data-editor-document-title]').textContent = post.title || '未命名文章';
      if (post.cover) one('[data-editor-cover-name]').textContent = '已设置封面图片';
      if (post.syncStatus === 'pending') one('[data-editor-sync]').hidden = false;
      renderPreview();
      setStatus('草稿已载入', 'saved');
      one('[data-editor-shell]').setAttribute('aria-busy', 'false');
      updateButtons();
    } catch (error) {
      if (error.status === 401) return window.location.replace('/admin/login');
      setStatus('无法载入这篇草稿', 'error');
    }
  }

  function init() {
    if (!window.AdminApi || !window.AdminModel || !window.WandererBlog) return;
    bind();
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
