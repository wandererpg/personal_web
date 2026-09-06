# Blog Preview Card Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首页博客预览改造成三张等宽分类卡片，每张卡片展示对应分类最新的一篇文章，并彻底移除封面/图片占位内容。

**Architecture:** 继续由 `blog.js` 从公开 `posts/index.json` 选择和渲染数据。首页分类卡片使用语义化 `article`，用一个覆盖卡片的分类链接承担外层导航，用同级的最新文章链接承担内层导航；通过层级和 `pointer-events` 让两个真实链接互不嵌套、互不抢占。`styles.css` 只负责 B 方案的分层视觉和响应式布局。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Node.js 内置测试运行器，无新增依赖。

---

### Task 1: Lock the module-preview and placeholder-removal behavior with tests

**Files:**
- Modify: `tests/blog.test.mjs`
- Modify: `tests/site-smoke.mjs`

- [ ] **Step 1: Write the failing unit tests**

在 `tests/blog.test.mjs` 引入 `latestPostForModule`，加入以下行为测试：

```js
test('homepage selects only the latest published article for each module', () => {
  const archive = [
    { ...posts[0], slug: 'learning-old', module: 'learning', updatedAt: '2026-01-02T09:00:00+08:00' },
    { ...posts[0], slug: 'learning-new', module: 'learning', updatedAt: '2026-04-02T09:00:00+08:00' },
    { ...posts[1], slug: 'project-new', module: 'projects' },
  ];
  assert.equal(latestPostForModule(archive, 'learning').slug, 'learning-new');
  assert.equal(latestPostForModule(archive, 'projects').slug, 'project-new');
  assert.equal(latestPostForModule(archive, 'insights'), null);
});
```

在 `tests/site-smoke.mjs` 将首页博客结构测试改为检查模块卡片渲染契约：

```js
assert.match(blog, /BLOG_MODULES\.map/);
assert.match(blog, /latestPostForModule/);
assert.match(blog, /blog-card__surface/);
assert.match(blog, /blog-card__latest/);
assert.doesNotMatch(blog, /COVER \/ SIGNAL LOST|IMAGE \/ SIGNAL LOST/);
```

同时将原来针对 featured/compact 布局的断言替换为：

```js
assert.match(css, /\.blog-section\s+\.card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
assert.match(css, /\.blog-card\s*\{[\s\S]*?min-height:/);
assert.match(css, /\.blog-card__latest\s*\{[\s\S]*?border/);
assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*?\.blog-section\s+\.card-grid[\s\S]*?grid-template-columns:\s*1fr;/);
assert.doesNotMatch(css, /blog-card__cover-fallback|blog-cover-fallback|blog-image-fallback/);
```

- [ ] **Step 2: Run the focused tests and verify the expected RED state**

Run:

```text
node --test tests/blog.test.mjs tests/site-smoke.mjs
```

Expected: failure because `latestPostForModule` and the new module-card hooks do not exist yet, and the current source still contains the old cover fallback text and featured/compact layout.

### Task 2: Implement latest-per-module rendering and remove all image placeholders

**Files:**
- Modify: `blog.js`
- Test: `tests/blog.test.mjs`, `tests/site-smoke.mjs`

- [ ] **Step 1: Add the tested module selector**

Implement and export the smallest helper needed by the failing unit test:

```js
const latestPostForModule = (posts, moduleId) =>
  latestPosts(filterPostsByModule(posts, moduleId), 1)[0] || null;
```

- [ ] **Step 2: Replace the home article-card renderer with the B layout**

Implement `createBlogModulePreviewCard(doc, module, post, index)` with this structure:

```html
<article class="blog-card ..." data-blog-preview-card="projects">
  <a class="blog-card__surface" href="notes.html?module=projects" aria-label="查看我的项目"></a>
  <div class="blog-card__content">
    <span class="card-index">MODULE / 01</span>
    <h3>我的项目</h3>
    <p>分类说明</p>
    <a class="blog-card__latest" href="post.html?slug=latest-slug">
      <small>LATEST ARTICLE · 3h ago</small>
      <strong>最新文章标题</strong>
      <span>文章摘要 · 2 min</span>
    </a>
    <span class="blog-card__footer" aria-hidden="true">VIEW MODULE ↗</span>
  </div>
</article>
```

实现约束：

- 分类链接和文章链接必须是同级元素，不能嵌套 `<a>`。
- `.blog-card__surface` 覆盖卡片，`.blog-card__content` 位于其上方但默认不拦截指针，`.blog-card__latest` 恢复指针事件，保证卡片其余区域进入分类页、子卡片进入文章页。
- `renderBlogPreview` 遍历 `BLOG_MODULES`，调用 `latestPostForModule`，因此永远最多渲染三张卡片且每类最多一篇文章。
- 没有最新文章时渲染无链接的 `blog-card__latest--empty`，文本为“暂无公开文章”。
- 按现有 `formatBlogTimestamp(post.updatedAt || post.createdAt)` 展示时间。

- [ ] **Step 3: Remove all cover and image placeholders**

调整 `blog.js`：

- 删除 `createBlogImageFallback`。
- `createBlogCover` 在无封面时只返回空的媒体容器；有封面时加载真实图片，加载失败时移除图片，不创建 fallback 节点。
- `renderBlogCover` 没有封面或图片加载失败时隐藏 `[data-blog-article-cover]`。
- `bindBlogContentImages` 图片加载失败时删除所属 `figure`（没有 `figure` 时删除图片本身），不创建替代节点。
- 删除 `COVER / SIGNAL LOST` 和 `IMAGE / SIGNAL LOST` 字符串及其相关 DOM 创建逻辑。

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```text
node --test tests/blog.test.mjs tests/site-smoke.mjs
```

Expected: all focused tests pass, including one-newest-per-module and no-placeholder assertions.

### Task 3: Style the three equal cards in the approved B direction

**Files:**
- Modify: `styles.css`
- Test: `tests/site-smoke.mjs`

- [ ] **Step 1: Replace the old featured/compact rules**

Use a single equal-height desktop grid:

```css
.blog-section .card-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: 1fr;
}

.blog-card {
  display: flex;
  min-height: 330px;
}

.blog-card__surface {
  position: absolute;
  z-index: 0;
  inset: 0;
}

.blog-card__content {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  pointer-events: none;
}

.blog-card__latest {
  display: block;
  margin-top: auto;
  padding: 14px;
  border: 1px solid rgba(119, 230, 255, 0.18);
  border-radius: 10px;
  background: rgba(3, 9, 24, 0.58);
  pointer-events: auto;
}
```

保留现有液态玻璃、hover、focus-visible 和 reduced-motion 体系；删除不再使用的 `blog-card--featured`、`blog-card--compact` 以及三类 fallback 样式，避免旧规则继续影响等高布局。

- [ ] **Step 2: Add responsive rules**

在现有断点中覆盖首页博客网格：

```css
@media (max-width: 920px) {
  .blog-section .card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 680px) {
  .blog-section .card-grid { grid-template-columns: 1fr; }
  .blog-card { min-height: 290px; }
}
```

子卡片补充 hover/focus-visible 边框状态，外层 surface 保持可见焦点轮廓，确保键盘操作可识别。

- [ ] **Step 3: Run CSS-focused tests**

Run:

```text
node --test tests/site-smoke.mjs
```

Expected: all site smoke tests pass, including equal three-column desktop layout, responsive breakpoints, focus behavior, and no placeholder styles.

### Task 4: Full verification and implementation commit

**Files:**
- Verify: all changed files
- Preserve untracked: `f3c000b265e5463c8f4aa6c7266181c8.jpg`

- [ ] **Step 1: Run the full test suite**

Run:

```text
npm test
```

Expected: every test passes with no failures.

- [ ] **Step 2: Run syntax and whitespace checks**

Run:

```text
Get-ChildItem server,admin,scripts -File -Recurse -Include *.js | ForEach-Object { node --check $_.FullName }
node --check blog.js
node --check script.js
git diff --check
```

Expected: all commands exit successfully.

- [ ] **Step 3: Confirm the diff scope**

Run:

```text
git status --short
git diff --stat
```

Expected: only the planned source/test files are staged; the school calendar JPG remains untracked and unstaged.

- [ ] **Step 4: Commit the implementation**

```text
git add blog.js styles.css tests/blog.test.mjs tests/site-smoke.mjs
git commit -m "feat: redesign homepage blog preview cards"
```

Expected: one implementation commit containing the tested B layout and placeholder cleanup.
