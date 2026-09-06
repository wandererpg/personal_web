(function exposeAdminModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AdminModel = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createAdminModel() {
  const MODULES = Object.freeze({
    projects: '我的项目',
    insights: '心得分享',
    learning: '日常学习'
  });

  function filterPosts(posts, filters = {}) {
    const query = String(filters.query || '').trim().toLocaleLowerCase('zh-CN');
    return posts.filter(post => (!filters.module || post.module === filters.module)
      && (!filters.status || post.status === filters.status)
      && (!query || `${post.title || ''} ${post.excerpt || ''}`
        .toLocaleLowerCase('zh-CN').includes(query)));
  }

  function summarizePosts(posts) {
    return posts.reduce((summary, post) => {
      summary.all += 1;
      if (post.status === 'draft') summary.drafts += 1;
      if (post.status === 'published') summary.published += 1;
      if (post.syncStatus === 'pending') summary.pending += 1;
      return summary;
    }, { all: 0, drafts: 0, published: 0, pending: 0 });
  }

  function insertMarkdown(value, start, end, markdown) {
    const source = String(value || '');
    const from = Math.max(0, Math.min(source.length, Number(start) || 0));
    const to = Math.max(from, Math.min(source.length, Number(end) || from));
    const insertion = String(markdown || '');
    return {
      value: `${source.slice(0, from)}${insertion}${source.slice(to)}`,
      cursor: from + insertion.length
    };
  }

  function normalizeEditorPayload(fields) {
    const tags = [...new Set(String(fields.tags || '').split(',')
      .map(tag => tag.trim()).filter(Boolean))].slice(0, 10);
    return {
      title: String(fields.title || '').trim(),
      slug: String(fields.slug || '').trim(),
      module: fields.module,
      excerpt: String(fields.excerpt || '').trim(),
      tags,
      cover: String(fields.cover || '').trim(),
      body: String(fields.body || '')
    };
  }

  function validateForPublish(post) {
    const required = [['title', post.title], ['slug', post.slug], ['module', post.module],
      ['excerpt', post.excerpt], ['body', String(post.body || '').trim()]];
    const errors = required.filter(([, value]) => !value).map(([field]) => field);
    if (post.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)) errors.push('slug');
    return [...new Set(errors)];
  }

  function getOpenAction(post) {
    if (post.status === 'draft' || (post.syncStatus === 'pending' && post.id)) {
      return { type: 'draft', id: post.id };
    }
    return { type: 'revise', slug: post.slug };
  }

  function getDeleteTarget(post) {
    if (post.status === 'draft' && post.id) return { type: 'draft', id: post.id };
    if (post.status === 'published' && post.slug) return { type: 'published', slug: post.slug };
    return null;
  }

  function getPostPublishDestination(result) {
    return result?.syncStatus === 'synced' ? '/admin/login' : null;
  }

  return {
    MODULES, filterPosts, getDeleteTarget, getOpenAction, getPostPublishDestination, insertMarkdown,
    normalizeEditorPayload, summarizePosts, validateForPublish
  };
}));
