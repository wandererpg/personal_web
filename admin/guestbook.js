(function initAdminGuestbook(globalScope) {
  const document = globalScope.document;
  const root = document?.querySelector('[data-admin-guestbook]');
  const adminApi = globalScope.AdminApi;
  if (!document || !root || !adminApi) return;

  const state = { entries: [], loading: true, error: false };
  const one = selector => root.querySelector(selector);
  const element = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  };

  const formatDate = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '时间未知';
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).format(date);
  };

  const renderEntry = entry => {
    const row = element('article', 'guestbook-admin__entry');
    const header = element('header', 'guestbook-admin__entry-header');
    header.append(element('strong', '', entry.nickname || '匿名访客'), element('time', '', formatDate(entry.createdAt)));
    const remove = element('button', 'admin-post__action admin-post__action--delete', '删除');
    remove.type = 'button';
    remove.addEventListener('click', () => removeEntry(entry, remove));
    header.append(remove);
    row.append(header);
    if (entry.message) row.append(element('p', 'guestbook-admin__message', entry.message));
    const images = element('div', 'guestbook-admin__images');
    (Array.isArray(entry.images) ? entry.images : []).forEach(image => {
      if (typeof image.url !== 'string' || !image.url.startsWith('/api/guestbook/media/')) return;
      const node = element('img', '', '');
      node.src = image.url;
      node.alt = `${entry.nickname || '访客'}上传的图片`;
      node.loading = 'lazy';
      images.append(node);
    });
    if (images.childElementCount) row.append(images);
    return row;
  };

  const render = () => {
    const list = one('[data-admin-guestbook-list]');
    const empty = one('[data-admin-guestbook-empty]');
    const error = one('[data-admin-guestbook-error]');
    list.replaceChildren(...state.entries.map(renderEntry));
    list.hidden = state.loading || state.error;
    empty.hidden = state.loading || state.error || state.entries.length > 0;
    error.hidden = !state.error;
    one('[data-admin-guestbook-count]').textContent = `${state.entries.length} SIGNALS`;
    one('[data-admin-guestbook-status]').textContent = state.loading ? '正在读取留言…' : `${state.entries.length} 条留言已连接`;
  };

  async function removeEntry(entry, button) {
    if (!globalScope.confirm(`确定删除「${entry.nickname || '匿名访客'}」的留言吗？`)) return;
    button.disabled = true;
    try {
      await adminApi.request(`/api/admin/guestbook/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
      state.entries = state.entries.filter(item => item.id !== entry.id);
      render();
    } catch (error) {
      button.disabled = false;
      one('[data-admin-guestbook-error]').textContent = error.status === 401 ? '登录状态已失效，请重新登录。' : '删除失败，请稍后重试。';
      state.error = true;
      render();
    }
  }

  async function load() {
    state.loading = true;
    state.error = false;
    render();
    try {
      const response = await adminApi.request('/api/admin/guestbook');
      state.entries = Array.isArray(response.entries) ? response.entries : [];
    } catch (error) {
      if (error.status === 401) return globalScope.location.replace('/admin/login');
      state.error = true;
    } finally {
      state.loading = false;
      render();
    }
  }

  document.querySelector('[data-admin-logout]')?.addEventListener('click', async () => {
    await adminApi.request('/api/admin/logout', { method: 'POST' });
    globalScope.location.replace('/admin/login');
  });
  void load();
}(typeof window !== 'undefined' ? window : globalThis));
