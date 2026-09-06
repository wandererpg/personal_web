(function AdminDashboard() {
  const state = { posts: [], module: '', status: '', query: '', loading: true, error: false };

  const one = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '尚未记录时间';
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function postRow(post) {
    const row = element('article', 'admin-post');
    const button = element('button', 'admin-post__open');
    button.type = 'button';
    button.dataset.postId = post.id || '';
    button.dataset.postSlug = post.slug || '';
    button.dataset.postStatus = post.status;

    const marker = element('span', `admin-post__marker admin-post__marker--${post.module}`);
    const content = element('span', 'admin-post__content');
    const meta = element('span', 'admin-post__meta');
    meta.append(
      element('span', 'admin-post__module', window.AdminModel.MODULES[post.module] || '未分类'),
      element('span', `admin-badge admin-badge--${post.status}`,
        post.status === 'published' ? '已发布' : '草稿')
    );
    if (post.syncStatus === 'pending') meta.append(element('span', 'admin-badge admin-badge--pending', '待同步'));
    content.append(meta, element('strong', '', post.title || '未命名文章'),
      element('span', 'admin-post__excerpt', post.excerpt || '还没有填写摘要。'));

    const time = element('span', 'admin-post__time');
    time.append(element('small', '', post.status === 'published' ? '最后发布' : '最近编辑'),
      element('span', '', formatDate(post.updatedAt || post.createdAt)));
    const arrow = element('span', 'admin-post__arrow', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    button.append(marker, content, time, arrow);

    const actions = element('span', 'admin-post__actions');
    const edit = element('button', 'admin-post__action', '编辑');
    edit.type = 'button';
    edit.setAttribute('aria-label', `编辑：${post.title || '未命名文章'}`);
    const remove = element('button', 'admin-post__action admin-post__action--delete', '删除');
    remove.type = 'button';
    remove.dataset.adminDelete = '';
    remove.setAttribute('aria-label', `删除：${post.title || '未命名文章'}`);
    actions.append(edit, remove);
    row.append(button, actions);
    button.addEventListener('click', () => openPost(post, button));
    edit.addEventListener('click', () => openPost(post, edit));
    remove.addEventListener('click', () => deletePost(post, remove));
    return row;
  }

  async function deletePost(post, button) {
    const target = window.AdminModel.getDeleteTarget(post);
    if (!target || !window.confirm(`确定删除「${post.title || '未命名文章'}」吗？此操作会同步删除文章内容。`)) return;
    button.disabled = true;
    try {
      const endpoint = target.type === 'draft'
        ? `/api/admin/posts/drafts/${encodeURIComponent(target.id)}`
        : `/api/admin/posts/published/${encodeURIComponent(target.slug)}`;
      await window.AdminApi.request(endpoint, { method: 'DELETE' });
      state.posts = state.posts.filter(item => target.type === 'draft'
        ? item.id !== target.id
        : !(item.status === 'published' && item.slug === target.slug));
      render();
    } catch {
      button.disabled = false;
      state.error = true;
      render();
    }
  }

  function render() {
    const model = window.AdminModel;
    const visible = model.filterPosts(state.posts, state);
    const summary = model.summarizePosts(state.posts);
    const list = one('[data-admin-posts]');
    list.replaceChildren(...visible.map(postRow));

    for (const [key, value] of Object.entries(summary)) {
      all(`[data-count="${key}"]`).forEach(node => { node.textContent = String(value); });
    }
    one('[data-admin-result-count]').textContent = `${visible.length} / ${summary.all} 篇文章`;
    one('[data-admin-loading]').hidden = !state.loading;
    one('[data-admin-empty]').hidden = state.loading || state.error || visible.length > 0;
    one('[data-admin-error]').hidden = !state.error;
    list.hidden = state.loading || state.error;
  }

  async function loadPosts() {
    state.loading = true;
    state.error = false;
    render();
    try {
      const response = await window.AdminApi.request('/api/admin/posts');
      state.posts = Array.isArray(response.posts) ? response.posts : [];
    } catch (error) {
      if (error.status === 401) return window.location.replace('/admin/login');
      state.error = true;
    } finally {
      state.loading = false;
      render();
    }
  }

  async function openPost(post, button) {
    button.disabled = true;
    try {
      const action = window.AdminModel.getOpenAction(post);
      let targetId = action.id;
      if (action.type === 'revise') {
        const response = await window.AdminApi.request(`/api/admin/posts/${encodeURIComponent(post.slug)}/revise`, {
          method: 'POST'
        });
        targetId = response.post.id;
      }
      window.location.assign(`/admin/editor?id=${encodeURIComponent(targetId)}`);
    } catch (error) {
      button.disabled = false;
      state.error = true;
      render();
    }
  }

  async function createPost(button) {
    button.disabled = true;
    try {
      const module = state.module || 'projects';
      const response = await window.AdminApi.request('/api/admin/posts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ module })
      });
      window.location.assign(`/admin/editor?id=${encodeURIComponent(response.post.id)}`);
    } catch {
      state.error = true;
      button.disabled = false;
      render();
    }
  }

  function bindFilters() {
    one('[data-admin-query]').addEventListener('input', event => { state.query = event.target.value; render(); });
    one('[data-admin-module]').addEventListener('change', event => {
      state.module = event.target.value;
      all('[data-module-filter]').forEach(node => node.classList.toggle('is-active', node.dataset.moduleFilter === state.module));
      render();
    });
    one('[data-admin-status]').addEventListener('change', event => { state.status = event.target.value; render(); });
    all('[data-module-filter]').forEach(button => button.addEventListener('click', () => {
      state.module = button.dataset.moduleFilter;
      one('[data-admin-module]').value = state.module;
      all('[data-module-filter]').forEach(node => node.classList.toggle('is-active', node === button));
      render();
    }));
  }

  function init() {
    if (!window.AdminApi || !window.AdminModel) return;
    bindFilters();
    one('[data-admin-new]').addEventListener('click', event => createPost(event.currentTarget));
    one('[data-admin-retry]').addEventListener('click', loadPosts);
    one('[data-admin-logout]').addEventListener('click', async () => {
      await window.AdminApi.request('/api/admin/logout', { method: 'POST' });
      window.location.replace('/admin/login');
    });
    loadPosts();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
