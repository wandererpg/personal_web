# Personal Blog MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首页“值得留下的想法”改造成由仓库内容驱动的“我的博客”，支持 Markdown 文章、文章图片、博客列表和独立阅读页。

**Architecture:** 使用原生 HTML、CSS 和 JavaScript。`posts/index.json` 保存文章元数据，`posts/*.md` 保存正文，`assets/blog/<slug>/` 保存封面和正文图片；`blog.js` 负责索引加载、排序、卡片渲染和文章渲染，三个页面共享同一份内容数据。保留 `notes.html` 作为博客列表入口，新增 `post.html?slug=<slug>` 作为文章详情模板。

**Tech Stack:** Static HTML5, CSS, browser Fetch API, Markdown subset renderer, CommonJS-compatible browser JavaScript, Node.js built-in test runner。

---

## 文件职责

- Create: `blog.js`，博客数据校验、排序、Markdown 安全渲染、页面控制器。
- Create: `tests/blog.test.mjs`，博客纯函数、索引加载和 Markdown 渲染测试。
- Create: `tests/blog-content.test.mjs`，真实文章索引、正文和图片路径校验。
- Create: `posts/index.json`，文章元数据索引。
- Create: `posts/small-projects.md`、`posts/visible-steps.md`、`posts/first-orbit.md`，迁移现有示例内容。
- Create: `assets/blog/small-projects/cover.svg`、`assets/blog/small-projects/diagram.svg`，提供可替换的星际档案示例素材。
- Modify: `index.html`，将首页旧想法卡片替换为动态博客预览，并将可见导航文案改为 Blog。
- Modify: `notes.html`，改造成动态博客归档页，保留文件名以兼容已有链接。
- Create: `post.html`，独立文章阅读页。
- Modify: `styles.css`，新增博客主卡片、档案列表、文章正文、封面、图片失败状态和响应式样式。
- Modify: `README.md`，记录新增文章和图片的发布流程。
- Modify: `tests/site-smoke.mjs`，验证博客相关页面的结构、脚本和关键文案。

## 约定的数据接口

`blog.js` 必须导出以下 API，浏览器挂载到 `window.WandererBlog`，Node 测试通过 `module.exports` 使用：

```javascript
{
  BLOG_INDEX_PATH,
  normalizePost,
  normalizePosts,
  sortPosts,
  latestPosts,
  findPost,
  getAdjacentPosts,
  loadPosts,
  loadPostContent,
  renderMarkdown,
  safeContentUrl,
}
```

文章索引采用数组格式，每条记录包含 `slug`、`title`、`date`、`category`、`excerpt`、`cover`、`tags`、`readingTime` 和 `content`。`cover` 可以为空；为空时卡片使用 CSS 星云占位背景。

### Task 1: 建立内容索引、示例文章和纯博客模型

**Files:**
- Create: `tests/blog.test.mjs`
- Create: `blog.js`
- Create: `posts/index.json`
- Create: `posts/small-projects.md`
- Create: `posts/visible-steps.md`
- Create: `posts/first-orbit.md`
- Create: `assets/blog/small-projects/cover.svg`
- Create: `assets/blog/small-projects/diagram.svg`
- Test: `tests/blog-content.test.mjs`

- [ ] **Step 1: Write failing unit tests for sorting, lookup, loading, and safe Markdown**

Create `tests/blog.test.mjs` with:

```javascript
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  findPost,
  getAdjacentPosts,
  latestPosts,
  loadPostContent,
  loadPosts,
  normalizePost,
  renderMarkdown,
  safeContentUrl,
  sortPosts,
} = require('../blog.js');

const posts = [
  { slug: 'old', title: '旧文章', date: '2026-01-02', category: 'LEARNING', excerpt: '旧摘要', cover: '', tags: ['A'], readingTime: '2 min', content: 'posts/old.md' },
  { slug: 'new', title: '新文章', date: '2026-03-08', category: 'MAKING', excerpt: '新摘要', cover: 'assets/blog/new/cover.jpg', tags: ['B'], readingTime: '5 min', content: 'posts/new.md' },
  { slug: 'middle', title: '中间文章', date: '2026-02-15', category: 'METHOD', excerpt: '中间摘要', cover: '', tags: ['C'], readingTime: '3 min', content: 'posts/middle.md' },
];

test('sortPosts returns a date-descending copy and latestPosts limits the result', () => {
  assert.deepEqual(sortPosts(posts).map((post) => post.slug), ['new', 'middle', 'old']);
  assert.deepEqual(latestPosts(posts, 2).map((post) => post.slug), ['new', 'middle']);
  assert.deepEqual(posts.map((post) => post.slug), ['old', 'new', 'middle']);
});

test('findPost and getAdjacentPosts use the normalized archive order', () => {
  assert.equal(findPost(posts, 'middle').title, '中间文章');
  assert.equal(findPost(posts, '../posts/secret'), null);
  assert.deepEqual(getAdjacentPosts(posts, 'middle'), { previous: 'old', next: 'new' });
});

test('normalizePost rejects invalid slugs, dates, titles, and content paths', () => {
  assert.equal(normalizePost(posts[0]).slug, 'old');
  assert.equal(normalizePost({ ...posts[0], slug: '../secret' }), null);
  assert.equal(normalizePost({ ...posts[0], date: '2026/01/02' }), null);
  assert.equal(normalizePost({ ...posts[0], title: '   ' }), null);
  assert.equal(normalizePost({ ...posts[0], content: 'C:/secret.md' }), null);
});

test('loadPosts parses an index response and rejects failed responses', async () => {
  const fetchOk = async () => ({ ok: true, json: async () => posts });
  assert.deepEqual((await loadPosts(fetchOk)).map((post) => post.slug), ['new', 'middle', 'old']);

  const fetchFailed = async () => ({ ok: false, status: 404, json: async () => [] });
  await assert.rejects(() => loadPosts(fetchFailed), /博客索引加载失败/);
});

test('loadPostContent reads the indexed Markdown file', async () => {
  const fetchStub = async (path) => ({ ok: true, text: async () => `# ${path}` });
  assert.equal(await loadPostContent(fetchStub, posts[0]), '# posts/old.md');
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
});

test('safeContentUrl only allows local assets and safe external links', () => {
  assert.equal(safeContentUrl('assets/blog/demo/image.jpg'), 'assets/blog/demo/image.jpg');
  assert.equal(safeContentUrl('https://example.com/image.jpg'), 'https://example.com/image.jpg');
  assert.equal(safeContentUrl('javascript:alert(1)'), '');
  assert.equal(safeContentUrl('../secret.txt'), '');
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run: `node --test tests/blog.test.mjs`

Expected: FAIL because `../blog.js` does not exist.

- [ ] **Step 3: Implement the pure blog API**

Create `blog.js` using a UMD wrapper. The implementation must use these exact rules:

```javascript
const BLOG_INDEX_PATH = 'posts/index.json';
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const sortPosts = (posts) => [...posts].sort((left, right) => (
  right.date.localeCompare(left.date) || left.slug.localeCompare(right.slug)
));

const latestPosts = (posts, limit = 3) => sortPosts(posts).slice(0, Math.max(0, limit));

const findPost = (posts, slug) => {
  if (typeof slug !== 'string' || !slugPattern.test(slug)) return null;
  return sortPosts(posts).find((post) => post.slug === slug) ?? null;
};

const getAdjacentPosts = (posts, slug) => {
  const ordered = sortPosts(posts);
  const index = ordered.findIndex((post) => post.slug === slug);
  if (index < 0) return { previous: null, next: null };
  return {
    previous: ordered[index + 1]?.slug ?? null,
    next: ordered[index - 1]?.slug ?? null,
  };
};

const safeContentUrl = (value) => {
  const url = String(value ?? '').trim();
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return url;
  if (/^assets\/[a-zA-Z0-9._/-]+$/.test(url)) return url;
  return '';
};
```

Add `normalizePost` so it returns a new record only when `slug` matches `slugPattern`, `date` matches `datePattern`, `title` and `content` are non-empty, `content` starts with `posts/` and contains no `..`, `cover` is empty or passes `safeContentUrl`, `tags` is an array of strings, and `readingTime` is a string. `normalizePosts` must filter invalid records without throwing.

Add `loadPosts(fetchImpl)` to fetch `BLOG_INDEX_PATH`, throw `new Error('博客索引加载失败')` for a non-OK response or invalid top-level JSON, normalize the array, and return `sortPosts(normalizedPosts)`.

Add `loadPostContent(fetchImpl, post)` to fetch `post.content`, throw `new Error('文章内容加载失败')` for a non-OK response, and return the response text.

Add `renderMarkdown(markdown)` with a deliberately small safe subset: `#` becomes `h2`, `##` becomes `h3`, fenced code becomes `pre > code`, consecutive `- ` lines become `ul`, image syntax becomes `figure > img` with an optional `figcaption`, links accept only `safeContentUrl`, and all text/attributes pass through an HTML escape function. Raw HTML must be rendered as text rather than inserted as markup.

Export the API through both `globalScope.WandererBlog = api` and `module.exports = api`.

- [ ] **Step 4: Add the initial content files and path-validation test**

Create `posts/index.json` with exactly three valid records:

```json
[
  {
    "slug": "small-projects",
    "title": "为什么我喜欢把想法做成小项目？",
    "date": "2026-03-15",
    "category": "MAKING",
    "excerpt": "当一个念头变成可以点击、运行或被别人使用的东西，它才真正开始和世界发生联系。",
    "cover": "assets/blog/small-projects/cover.svg",
    "tags": ["Making", "Project"],
    "readingTime": "4 min",
    "content": "posts/small-projects.md"
  },
  {
    "slug": "visible-steps",
    "title": "把复杂问题拆成可见的步骤。",
    "date": "2026-02-20",
    "category": "METHOD",
    "excerpt": "先找到边界，再决定下一步，最后让结果能够被复用。",
    "cover": "",
    "tags": ["Process"],
    "readingTime": "3 min",
    "content": "posts/visible-steps.md"
  },
  {
    "slug": "first-orbit",
    "title": "个人知识库的第一条轨道。",
    "date": "2026-01-12",
    "category": "LEARNING",
    "excerpt": "比起收藏更多内容，更重要的是为真正会再次使用的知识留出位置。",
    "cover": "",
    "tags": ["Learning"],
    "readingTime": "3 min",
    "content": "posts/first-orbit.md"
  }
]
```

每个 Markdown 文件至少包含一个 `#` 标题、两段正文和一个列表。`small-projects.md` 另加入一张图片：`![从想法到项目的路径](assets/blog/small-projects/diagram.svg "Idea → Project")`。两个 SVG 文件使用深蓝背景、电光青线条和少量星点，作为可替换的演示素材；后续可以直接替换为 JPG、PNG 或 WEBP 而不改变索引字段。

Create `tests/blog-content.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (name) => readFile(new URL(name, root), 'utf8');
const exists = (name) => access(new URL(name, root)).then(() => true, () => false);

test('blog index points to existing Markdown and optional cover files', async () => {
  const posts = JSON.parse(await read('posts/index.json'));
  assert.equal(posts.length, 3);
  for (const post of posts) {
    assert.match(post.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.match(post.content, /^posts\/[a-z0-9-]+\.md$/);
    assert.equal(await exists(post.content), true, `${post.content} is missing`);
    if (post.cover) assert.equal(await exists(post.cover), true, `${post.cover} is missing`);
  }
  assert.equal(await exists('assets/blog/small-projects/diagram.svg'), true, 'diagram.svg is missing');
});

test('sample articles contain readable Markdown content', async () => {
  for (const file of ['posts/small-projects.md', 'posts/visible-steps.md', 'posts/first-orbit.md']) {
    const markdown = await read(file);
    assert.match(markdown, /^# /m, `${file} needs a title`);
    assert.ok(markdown.trim().length > 120, `${file} needs article content`);
  }
});
```

- [ ] **Step 5: Run the model and content tests**

Run: `node --test tests/blog.test.mjs tests/blog-content.test.mjs`

Expected: all focused blog tests PASS.

- [ ] **Step 6: Commit the content model**

```powershell
git add blog.js tests/blog.test.mjs tests/blog-content.test.mjs posts assets/blog
git commit -m "feat: add repository-driven blog content model"
```

### Task 2: 首页博客预览

**Files:**
- Modify: `tests/site-smoke.mjs`
- Modify: `index.html`
- Modify: `blog.js`
- Test: `tests/blog.test.mjs`

- [ ] **Step 1: Add failing smoke assertions for the home preview**

Extend `tests/site-smoke.mjs` with:

```javascript
test('home exposes the repository-driven blog preview', async () => {
  const html = await read('index.html');
  const blogJs = await read('blog.js');
  assert.match(html, /<script src="blog\.js" defer><\/script>/);
  assert.match(html, /id="blog"/);
  assert.match(html, /data-blog-preview/);
  assert.match(html, /data-blog-preview-empty/);
  assert.match(html, /我的博客。/);
  assert.match(html, /查看全部博客/);
  assert.doesNotMatch(html, /值得留下的想法/);
  assert.match(blogJs, /latestPosts\(/);
  assert.match(blogJs, /post\.html\?slug=/);
});
```

- [ ] **Step 2: Run the smoke test and verify it fails**

Run: `node --test tests/site-smoke.mjs`

Expected: FAIL because the homepage still contains the hardcoded notes section and does not load `blog.js`.

- [ ] **Step 3: Replace the homepage notes markup with dynamic preview hooks**

In `index.html`, load `<script src="blog.js" defer></script>` before `script.js`. Change the navigation label from `Notes` to `Blog` while retaining `href="notes.html"`. Replace the `#notes` section with this structure:

```html
<section class="section blog-section" id="blog" aria-labelledby="blog-title">
  <div class="container">
    <div class="section-heading reveal">
      <div>
        <span class="section-label">02 / Blog archive</span>
        <h2 id="blog-title">我的博客。</h2>
      </div>
      <div>
        <p>记录正在学习、制作和重新理解的东西。</p>
        <a class="text-link" href="notes.html">查看全部博客</a>
      </div>
    </div>
    <div class="blog-preview-grid" data-blog-preview aria-live="polite"></div>
    <p class="blog-empty" data-blog-preview-empty hidden>博客信号暂时为空。</p>
    <p class="blog-error" data-blog-preview-error role="status" hidden>博客暂时无法读取，请稍后再试。</p>
  </div>
</section>
```

Change the hero button text to `进入博客` and the metadata from `NOTES: IN TRANSMISSION` to `BLOG: IN TRANSMISSION`.

- [ ] **Step 4: Add home preview rendering to `blog.js`**

Add DOM-only helpers that run when `document.querySelector('[data-blog-preview]')` exists. Load the index with `loadPosts(globalScope.fetch.bind(globalScope))`, pass `latestPosts(posts, 3)` to the renderer, and render one featured card followed by two compact cards. Every card must be an anchor with `href="post.html?slug=<valid slug>"`, use `textContent` for title, excerpt, category and tags, and use `img.alt` from the article title. When `cover` is empty, add `is-cover-fallback`; when an image errors, remove its `src` and add the same fallback class.

Use this card shape so CSS and tests have stable hooks:

```html
<a class="blog-card blog-card--featured liquid-glass" data-liquid-glass data-blog-card href="post.html?slug=small-projects">
  <span class="blog-card__media" data-blog-cover></span>
  <span class="blog-card__body">
    <span class="blog-card__meta"><span data-blog-category>MAKING</span><time data-blog-date>2026.03.15</time></span>
    <strong data-blog-title>为什么我喜欢把想法做成小项目？</strong>
    <span data-blog-excerpt>当一个念头变成可以点击、运行或被别人使用的东西，它才真正开始和世界发生联系。</span>
    <span class="blog-card__footer"><span data-blog-tags></span><span class="card-arrow" aria-hidden="true">↗</span></span>
  </span>
</a>
```

After replacing dynamic cards, call `globalScope.WandererLiquidGlass?.initLiquidGlass(document, globalScope)` so the shared glass interaction also applies to newly created cards. The loading failure path must reveal `[data-blog-preview-error]`; an empty valid index must reveal `[data-blog-preview-empty]`.

- [ ] **Step 5: Add unit coverage for the three-card preview contract**

Add this test to `tests/blog.test.mjs`:

```javascript
test('latestPosts keeps the homepage preview at three records', () => {
  const sixPosts = Array.from({ length: 6 }, (_, index) => ({
    slug: `post-${index}`,
    title: `文章 ${index}`,
    date: `2026-0${Math.floor(index / 2) + 1}-${String(index + 1).padStart(2, '0')}`,
    category: 'MAKING',
    excerpt: '摘要',
    cover: '',
    tags: [],
    readingTime: '1 min',
    content: `posts/post-${index}.md`,
  }));
  assert.equal(latestPosts(sixPosts).length, 3);
});
```

- [ ] **Step 6: Run focused tests and commit the homepage preview**

Run: `node --test tests/blog.test.mjs tests/blog-content.test.mjs tests/site-smoke.mjs && node --check blog.js && git diff --check`

Expected: all tests PASS, `blog.js` parses, and there are no whitespace errors.

```powershell
git add index.html blog.js tests/blog.test.mjs tests/site-smoke.mjs
git commit -m "feat: add dynamic blog preview to home"
```

### Task 3: 博客归档页和文章详情页

**Files:**
- Modify: `tests/site-smoke.mjs`
- Modify: `notes.html`
- Modify: `blog.js`
- Create: `post.html`
- Test: `tests/blog.test.mjs`

- [ ] **Step 1: Add failing smoke assertions for archive and article hooks**

Add to `tests/site-smoke.mjs`:

```javascript
test('blog archive and article pages expose dynamic content hooks', async () => {
  const archive = await read('notes.html');
  const article = await read('post.html');
  const blogJs = await read('blog.js');
  assert.match(archive, /<script src="blog\.js" defer><\/script>/);
  assert.match(archive, /data-blog-list/);
  assert.match(archive, /data-blog-list-empty/);
  assert.match(archive, /我的博客。/);
  assert.match(article, /data-blog-article/);
  assert.match(article, /data-blog-article-title/);
  assert.match(article, /data-blog-article-content/);
  assert.match(article, /data-blog-article-previous/);
  assert.match(article, /data-blog-article-next/);
  assert.match(blogJs, /loadPostContent\(/);
  assert.match(blogJs, /URLSearchParams/);
});
```

- [ ] **Step 2: Run the smoke test and verify the detail page is missing**

Run: `node --test tests/site-smoke.mjs`

Expected: FAIL because `post.html` and the dynamic archive hooks do not exist.

- [ ] **Step 3: Convert `notes.html` into the archive page**

Keep the shared header, music player and footer. Change the title, description, active navigation label and visible copy to Blog / 我的博客。Keep the file name and `href="notes.html"` links for compatibility. Load `blog.js` after `liquid-glass.js` and before `script.js`. Replace the three hardcoded `.note-row` elements with:

```html
<section class="section listing-section container" aria-labelledby="blog-list-title">
  <div class="section-heading reveal">
    <div>
      <span class="section-label">Transmission archive</span>
      <h2 id="blog-list-title">所有博客记录。</h2>
    </div>
    <p>从项目经验到日常观察，把真正有用的部分整理成可以再次阅读的信号。</p>
  </div>
  <div class="blog-list" data-blog-list aria-live="polite"></div>
  <p class="blog-empty" data-blog-list-empty hidden>博客信号暂时为空。</p>
  <p class="blog-error" data-blog-list-error role="status" hidden>博客暂时无法读取，请稍后再试。</p>
</section>
```

- [ ] **Step 4: Create the semantic article template**

Create `post.html` with the same header, Beijing clock, music player, footer, favicon and shared scripts as `notes.html`; load `blog.js`. The main content must be:

```html
<main id="main">
  <article class="blog-article container" data-blog-article aria-labelledby="blog-article-title">
    <a class="text-link blog-article__back" href="notes.html">← 返回博客</a>
    <div class="blog-article__hero">
      <span class="section-label" data-blog-article-category></span>
      <h1 id="blog-article-title" data-blog-article-title>载入文章…</h1>
      <p data-blog-article-excerpt></p>
      <div class="blog-article__meta"><time data-blog-article-date></time><span data-blog-article-reading-time></span></div>
      <div class="blog-article__cover" data-blog-article-cover aria-hidden="true"></div>
    </div>
    <div class="blog-article__content" data-blog-article-content></div>
    <p class="blog-error" data-blog-article-error role="status" hidden>文章暂时无法读取，请返回博客列表。</p>
    <nav class="blog-article__nav" aria-label="文章导航">
      <a data-blog-article-previous hidden></a>
      <a data-blog-article-next hidden></a>
    </nav>
  </article>
</main>
```

- [ ] **Step 5: Implement archive and article controllers**

For `[data-blog-list]`, call `loadPosts`, render every post in descending date order, and use this archive card structure:

```html
<a class="blog-row liquid-glass" data-liquid-glass data-blog-row href="post.html?slug=visible-steps">
  <span class="blog-row__media" data-blog-cover></span>
  <span class="blog-row__date" data-blog-date>2026.02.20<br>METHOD</span>
  <span class="blog-row__content"><strong data-blog-title>把复杂问题拆成可见的步骤。</strong><span data-blog-excerpt>先找到边界，再决定下一步。</span><span data-blog-tags></span></span>
  <span class="blog-row__arrow" aria-hidden="true">↗</span>
</a>
```

For `[data-blog-article]`, read `new URLSearchParams(globalScope.location.search).get('slug')`, call `findPost`, load only the indexed `post.content`, put `renderMarkdown(markdown)` into `[data-blog-article-content]`, set `document.title` to `<title> · Blog · Wanderer.OS`, and populate the previous/next links from `getAdjacentPosts`. For a missing or invalid slug, hide the article content, show the error message and keep the return link usable.

The controller must use `textContent` for metadata and `innerHTML` only for the output of `renderMarkdown`. Images created by Markdown get a `data-blog-content-image` attribute and an error listener that swaps the image for a `.blog-image-fallback` state without showing a broken-image icon.

After archive or article content is inserted, call `WandererLiquidGlass.initLiquidGlass(document, globalScope)` when the API exists. Do not attach duplicate listeners to cards already marked `data-liquid-glass-ready="true"`.

- [ ] **Step 6: Add adjacent-post coverage and commit the pages**

Add this test to `tests/blog.test.mjs`:

```javascript
test('adjacent posts point older and newer navigation in archive order', () => {
  assert.deepEqual(getAdjacentPosts(posts, 'new'), { previous: 'middle', next: null });
  assert.deepEqual(getAdjacentPosts(posts, 'old'), { previous: null, next: 'middle' });
  assert.deepEqual(getAdjacentPosts(posts, 'missing'), { previous: null, next: null });
});
```

Run: `node --test tests/blog.test.mjs tests/blog-content.test.mjs tests/site-smoke.mjs && node --check blog.js && git diff --check`

Expected: all tests PASS with valid archive and article hooks.

```powershell
git add notes.html post.html blog.js tests/blog.test.mjs tests/site-smoke.mjs
git commit -m "feat: add blog archive and article pages"
```

### Task 4: 星际档案视觉和响应式布局

**Files:**
- Modify: `tests/site-smoke.mjs`
- Modify: `styles.css`

- [ ] **Step 1: Add failing CSS contract assertions**

Add to `tests/site-smoke.mjs`:

```javascript
test('blog styles define the archive card, cover fallback, article reading column, and motion boundaries', async () => {
  const css = await read('styles.css');
  assert.match(css, /\.blog-preview-grid\s*\{/);
  assert.match(css, /\.blog-card--featured\s*\{/);
  assert.match(css, /\.blog-row\s*\{/);
  assert.match(css, /\.blog-article__content\s*\{/);
  assert.match(css, /\.blog-cover-fallback|\.is-cover-fallback/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(css, /radial-gradient\(circle 220px at var\(--glass-x\)/);
});
```

- [ ] **Step 2: Run the CSS smoke test and verify it fails**

Run: `node --test tests/site-smoke.mjs`

Expected: FAIL because the blog-specific selectors do not exist.

- [ ] **Step 3: Add the desktop archive-card layout**

Add styles using existing variables and preserve the project’s no-pointer-halo rule:

```css
.blog-preview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(0, 0.85fr);
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.blog-card,
.blog-row {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: linear-gradient(145deg, rgba(17, 36, 74, 0.58), rgba(6, 12, 30, 0.72));
}

.blog-card--featured {
  grid-row: 1 / -1;
  min-height: 410px;
}

.blog-card__media,
.blog-row__media {
  display: block;
  background: linear-gradient(135deg, rgba(119, 230, 255, 0.2), rgba(9, 18, 47, 0.82));
  background-position: center;
  background-size: cover;
}

.blog-card__media {
  min-height: 195px;
}

.blog-card__media.is-cover-fallback,
.blog-row__media.is-cover-fallback,
.blog-article__cover.is-cover-fallback {
  background-image: radial-gradient(circle at 25% 30%, rgba(119, 230, 255, 0.38) 0 1px, transparent 2px), linear-gradient(135deg, rgba(119, 230, 255, 0.18), rgba(8, 17, 43, 0.86));
  background-size: 38px 38px, auto;
}

.blog-card__body {
  display: grid;
  gap: 12px;
  padding: 20px;
}

.blog-card__meta,
.blog-card__footer,
.blog-article__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--muted);
  font: 10px var(--mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.blog-card__body strong {
  color: var(--ink-strong);
  font-family: var(--display);
  font-size: clamp(1.3rem, 2.4vw, 2.15rem);
  letter-spacing: -0.06em;
  line-height: 1.06;
}

.blog-card__body > span:not(.blog-card__meta):not(.blog-card__footer) {
  color: var(--muted-strong);
  line-height: 1.7;
}

.blog-row {
  display: grid;
  grid-template-columns: 148px 105px minmax(0, 1fr) 34px;
  align-items: center;
  gap: 20px;
  min-height: 132px;
  padding: 12px;
}

.blog-row__media {
  align-self: stretch;
  min-height: 106px;
  border-radius: 9px;
}

.blog-row__date {
  color: var(--muted);
  font: 10px/1.6 var(--mono);
}

.blog-row__content {
  display: grid;
  gap: 7px;
}

.blog-row__content strong {
  color: var(--ink-strong);
  font-family: var(--display);
  font-size: clamp(1.25rem, 2.2vw, 1.75rem);
  letter-spacing: -0.05em;
  line-height: 1.1;
}

.blog-row__content > span:not([data-blog-tags]) {
  color: var(--muted);
  font-size: 13px;
}

.blog-row__arrow {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  color: var(--cyan);
  transition: color 180ms ease, background 180ms ease, transform 180ms ease;
}

.blog-card:hover,
.blog-row:hover {
  border-color: var(--line-strong);
  transform: translateY(-4px);
}

.blog-card:hover .blog-card__media,
.blog-row:hover .blog-row__media {
  filter: saturate(1.08);
  transform: scale(1.02);
}

.blog-row:hover .blog-row__arrow {
  color: var(--bg);
  background: var(--cyan);
  transform: translate(2px, -2px) rotate(45deg);
}
```

Do not add a cursor-position radial gradient. Keep `.liquid-glass__shine { display: none; }` and the existing pointer effect module unchanged unless browser verification exposes a regression.

- [ ] **Step 4: Add article typography, states, and mobile layout**

Add a centered reading column with `max-width: 760px`, generous line height, `figure` image styles, code-block overflow handling, empty/error states, and previous/next navigation. At `max-width: 720px`, make the preview grid one column, remove the featured row span, make archive rows two columns with date above content, and keep the fixed music player from covering article controls. Add the blog selectors to the existing reduced-motion block so `transform`, filter, and transition animations are disabled when motion is reduced.

- [ ] **Step 5: Run CSS and full static checks, then commit**

Run: `node --test tests/blog.test.mjs tests/blog-content.test.mjs tests/site-smoke.mjs && node --check blog.js && node --check script.js && git diff --check`

Expected: all tests PASS, JavaScript syntax checks PASS, and no whitespace errors.

```powershell
git add styles.css tests/site-smoke.mjs
git commit -m "style: add cosmic blog archive surfaces"
```

### Task 5: 发布说明和内容回归测试

**Files:**
- Modify: `README.md`
- Modify: `tests/site-smoke.mjs`

- [ ] **Step 1: Add failing README and page inventory assertions**

Add to `tests/site-smoke.mjs`:

```javascript
test('README documents the repository-driven blog publishing workflow', async () => {
  const readme = await read('README.md');
  assert.match(readme, /posts\/index\.json/);
  assert.match(readme, /assets\/blog/);
  assert.match(readme, /Markdown/);
  assert.match(readme, /git add/);
  assert.match(readme, /git commit/);
  assert.match(readme, /git push/);
});

test('all public pages keep the shared blog route and article template available', async () => {
  for (const page of ['index.html', 'projects.html', 'notes.html', 'post.html']) {
    const html = await read(page);
    assert.match(html, /href="notes\.html"/);
    assert.match(html, /href="https:\/\//);
  }
  assert.equal(await exists('posts/index.json'), true);
  assert.equal(await exists('blog.js'), true);
});
```

- [ ] **Step 2: Run the smoke test and verify the README assertion fails**

Run: `node --test tests/site-smoke.mjs`

Expected: FAIL until the blog publishing section and `post.html` page inventory are present.

- [ ] **Step 3: Add the authoring workflow to `README.md`**

Document the exact workflow:

```markdown
## 发布博客

1. 在 `posts/` 新建一个小写短横线命名的 Markdown 文件，例如 `posts/my-first-log.md`。
2. 在 `assets/blog/my-first-log/` 放入封面和正文图片。
3. 在 `posts/index.json` 增加同名 `slug`、标题、日期、摘要、标签、封面路径和正文路径。
4. 使用本地静态服务器预览，检查图片路径和 `post.html?slug=my-first-log` 链接。
5. 提交并上传：

   ```powershell
   git add posts assets/blog
   git commit -m "content: add blog post my-first-log"
   git push
   ```

博客当前是仓库内容驱动的静态发布方式，网页内在线上传和后台编辑不属于 MVP。
```

- [ ] **Step 4: Run the complete regression suite and commit documentation**

Run: `node --test tests/*.test.mjs tests/site-smoke.mjs && node --check blog.js && node --check script.js && git diff --check`

Expected: all tests PASS, both scripts parse, and the documentation matches the implemented workflow.

```powershell
git add README.md tests/site-smoke.mjs
git commit -m "docs: document blog publishing workflow"
```

### Task 6: 浏览器验收和交付

**Files:**
- Modify only the file and matching test that a verification failure directly identifies.

- [ ] **Step 1: Start a local static server**

Run: `py -m http.server 4173 --bind 127.0.0.1`

Expected: the site is available at `http://localhost:4173/`.

- [ ] **Step 2: Verify the homepage preview at desktop width**

At 1440×1000:

1. Confirm the section reads “我的博客。” and no old “值得留下的想法” copy remains.
2. Confirm exactly three cards are rendered from `posts/index.json`.
3. Confirm the first card is visually larger and has the cover or CSS fallback.
4. Hover a card and confirm it rises slightly, the border highlights, and the arrow reacts without a cursor-following halo.
5. Press and release a card and confirm its layout position does not jump downward.
6. Open the first card and confirm the URL is `post.html?slug=small-projects`.

- [ ] **Step 3: Verify archive, article, image, and error behavior**

1. Confirm `notes.html` lists all three records in date-descending order.
2. Confirm the article title, category, date, reading time, Markdown heading, list and image render on `post.html?slug=small-projects`.
3. Confirm previous/next links are hidden at the ends and point to the correct adjacent slugs elsewhere.
4. Open `post.html?slug=missing` and confirm a readable error state with a working return link.
5. Temporarily make one image path invalid in DevTools and confirm the styled fallback replaces the broken image indicator.
6. Confirm there are no console errors on Home, Blog and article pages.

- [ ] **Step 4: Verify mobile and accessibility behavior**

At 390×844:

1. Confirm the preview and archive become single-column layouts with no horizontal scrolling.
2. Confirm article content, image captions, previous/next controls and the fixed music player do not overlap.
3. Tab through navigation, cards, return link, article links and music controls; confirm visible focus indicators.
4. Enable reduced motion and confirm cards do not transform or filter during interaction.

- [ ] **Step 5: Run final checks and confirm the worktree**

Run: `node --test tests/*.test.mjs tests/site-smoke.mjs && node --check blog.js && node --check script.js && git diff --check && git status --short`

Expected: all tests PASS, no syntax or whitespace errors, and only the intentionally untracked user-provided school calendar image remains if it was not previously committed.

- [ ] **Step 6: Push the completed implementation**

Run: `git push`

Expected: the new blog commits are available on `origin/master`. Report the final commit and any browser-policy or static-host limitations to the user.
