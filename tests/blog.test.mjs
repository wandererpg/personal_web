import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  BLOG_MODULES,
  filterPostsByModule,
  findPost,
  findBlogModule,
  formatBlogDate,
  getAdjacentPosts,
  getBlogSlug,
  latestPosts,
  loadPostContent,
  loadPosts,
  normalizePost,
  normalizePosts,
  renderMarkdown,
  safeContentUrl,
  sortPosts,
} = require('../blog.js');

const posts = [
  { slug: 'old', title: '旧文章', module: 'learning', createdAt: '2026-01-02T09:00:00+08:00', updatedAt: '2026-01-02T09:00:00+08:00', publishedAt: '2026-01-02T09:00:00+08:00', excerpt: '旧摘要', cover: '', tags: ['A'], readingTime: '2 min', content: 'posts/old.md' },
  { slug: 'new', title: '新文章', module: 'projects', createdAt: '2026-03-08T09:00:00+08:00', updatedAt: '2026-03-08T09:00:00+08:00', publishedAt: '2026-03-08T09:00:00+08:00', excerpt: '新摘要', cover: 'assets/blog/new/cover.jpg', tags: ['B'], readingTime: '5 min', content: 'posts/new.md' },
  { slug: 'middle', title: '中间文章', module: 'insights', createdAt: '2026-02-15T09:00:00+08:00', updatedAt: '2026-02-15T09:00:00+08:00', publishedAt: '2026-02-15T09:00:00+08:00', excerpt: '中间摘要', cover: '', tags: ['C'], readingTime: '3 min', content: 'posts/middle.md' },
];

test('sortPosts returns a date-descending copy and latestPosts limits the result', () => {
  assert.deepEqual(sortPosts(posts).map((post) => post.slug), ['new', 'middle', 'old']);
  assert.deepEqual(latestPosts(posts, 2).map((post) => post.slug), ['new', 'middle']);
  assert.deepEqual(posts.map((post) => post.slug), ['old', 'new', 'middle']);
});

test('latestPosts limits the home preview to the three newest posts', () => {
  const archive = [
    ...posts,
    { slug: 'newest', title: '最新文章', module: 'projects', createdAt: '2026-04-01T09:00:00+08:00', updatedAt: '2026-04-01T09:00:00+08:00', publishedAt: '2026-04-01T09:00:00+08:00', excerpt: '最新摘要', cover: '', tags: [], readingTime: '1 min', content: 'posts/newest.md' },
  ];

  assert.deepEqual(latestPosts(archive, 3).map((post) => post.slug), ['newest', 'new', 'middle']);
  assert.equal(latestPosts(archive, 3).length, 3);
});

test('findPost and getAdjacentPosts use the normalized archive order', () => {
  assert.equal(findPost(posts, 'middle').title, '中间文章');
  assert.equal(findPost(posts, '../posts/secret'), null);
  assert.deepEqual(getAdjacentPosts(posts, 'middle'), { previous: 'old', next: 'new' });
});

test('normalizePost requires supported modules, ISO timestamps, titles, and safe content paths', () => {
  assert.equal(normalizePost(posts[0]).slug, 'old');
  assert.equal(normalizePost({ ...posts[0], slug: '../secret' }), null);
  assert.equal(normalizePost({ ...posts[0], createdAt: '2026/01/02' }), null);
  assert.equal(normalizePost({ ...posts[0], createdAt: '2026-01-02T09:00:00' }), null);
  assert.equal(normalizePost({ ...posts[0], module: 'private' }), null);
  assert.equal(normalizePost({ ...posts[0], title: '   ' }), null);
  assert.equal(normalizePost({ ...posts[0], content: 'C:/secret.md' }), null);
});

test('blog modules are stable and filter posts without falling back on unknown values', () => {
  assert.deepEqual(BLOG_MODULES.map((module) => module.id), ['projects', 'insights', 'learning']);
  assert.equal(findBlogModule('insights').label, '心得分享');
  assert.equal(findBlogModule('unknown'), null);
  assert.deepEqual(filterPostsByModule(posts, 'projects').map((post) => post.slug), ['new']);
  assert.deepEqual(filterPostsByModule(posts, 'unknown'), []);
});

test('normalizePosts filters invalid records without changing valid input', () => {
  const normalized = normalizePosts([posts[0], { ...posts[1], tags: ['B', 2] }, null]);
  assert.deepEqual(normalized.map((post) => post.slug), ['old']);
  assert.equal(posts[0].title, '旧文章');
});

test('loadPosts parses an index response and rejects failed responses', async () => {
  const fetchOk = async () => ({ ok: true, json: async () => posts });
  assert.deepEqual((await loadPosts(fetchOk)).map((post) => post.slug), ['new', 'middle', 'old']);

  const fetchFailed = async () => ({ ok: false, status: 404, json: async () => [] });
  await assert.rejects(() => loadPosts(fetchFailed), /博客索引加载失败/);

  const fetchInvalid = async () => ({ ok: true, json: async () => ({ posts }) });
  await assert.rejects(() => loadPosts(fetchInvalid), /博客索引加载失败/);
});

test('loadPostContent reads the indexed Markdown file and rejects failures', async () => {
  const fetchStub = async (path) => ({ ok: true, text: async () => `# ${path}` });
  assert.equal(await loadPostContent(fetchStub, posts[0]), '# posts/old.md');

  const fetchFailed = async () => ({ ok: false, status: 404, text: async () => '' });
  await assert.rejects(() => loadPostContent(fetchFailed, posts[0]), /文章内容加载失败/);
});

test('renderMarkdown supports headings, images, links, lists, code, and escapes HTML', () => {
  const html = renderMarkdown('# 标题\n\n![图示](assets/blog/demo/diagram.jpg "说明")\n\n- 一\n- 二\n\n[GitHub](https://github.com/wandererpg)\n\n```js\nalert(1)\n```\n\n<script>alert(1)</script>');
  assert.match(html, /<h2>标题<\/h2>/);
  assert.match(html, /<img[^>]+src="assets\/blog\/demo\/diagram\.jpg"/);
  assert.match(html, /<figcaption>说明<\/figcaption>/);
  assert.match(html, /<ul>[\s\S]*<li>一<\/li>[\s\S]*<\/ul>/);
  assert.match(html, /<a href="https:\/\/github\.com\/wandererpg"/);
  assert.match(html, /<pre><code class="language-js">alert\(1\)<\/code><\/pre>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('safeContentUrl only allows local assets and safe external links', () => {
  assert.equal(safeContentUrl('assets/blog/demo/image.jpg'), 'assets/blog/demo/image.jpg');
  assert.equal(safeContentUrl('https://example.com/image.jpg'), 'https://example.com/image.jpg');
  assert.equal(safeContentUrl('mailto:wanderer@example.com'), 'mailto:wanderer@example.com');
  assert.equal(safeContentUrl('javascript:alert(1)'), '');
  assert.equal(safeContentUrl('../secret.txt'), '');
});

test('adjacent posts point older and newer navigation in archive order', () => {
  assert.deepEqual(getAdjacentPosts(posts, 'new'), { previous: 'middle', next: null });
  assert.deepEqual(getAdjacentPosts(posts, 'old'), { previous: null, next: 'middle' });
  assert.deepEqual(getAdjacentPosts(posts, 'missing'), { previous: null, next: null });
});

test('archive dates and article URLs are normalized for display and lookup', () => {
  assert.equal(formatBlogDate('2026-03-15T23:30:00+08:00'), '2026.03.15');
  assert.equal(getBlogSlug('?slug=small-projects'), 'small-projects');
  assert.equal(getBlogSlug('?mode=preview'), null);
});
