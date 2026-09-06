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

  return { MODULES, filterPosts, summarizePosts };
}));
