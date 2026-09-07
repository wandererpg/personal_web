# Bot 管理与公开留言板实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use inline execution with test-first checkpoints and commit the completed change.

**Goal:** 将首页的博客区域与原“正在建造的东西”区域调换，并把后者改造成 Bot 管理与公开留言板的双栏工作台。

**Architecture:** 首页左栏使用三个外部服务入口，右栏使用公开留言板。留言以访客即时发布为 MVP 行为，文字使用 `textContent` 安全渲染；数据写入 `BLOG_DATA_DIR/guestbook.json`，图片写入同目录下的 `guestbook/media/`，管理员通过受保护接口删除内容。公开上传采用内存接收、文件签名校验、数量/大小限制和 IP 速率限制。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Node.js 20、Express、Multer、现有 session/CSRF 管线、Node 内置测试与 Supertest。

---

### Task 1: 建立留言板存储与 API

**Files:**
- Create: `server/guestbook-store.js`
- Create: `server/guestbook-api.js`
- Modify: `server/app.js`
- Modify: `tests/helpers/admin-fixture.mjs`
- Create: `tests/guestbook.test.mjs`

- [x] **Step 1: 写留言板存储、公开提交、图片读取和管理员删除的失败测试**
- [x] **Step 2: 实现私有数据目录中的原子 JSON 存储与安全图片文件名**
- [x] **Step 3: 挂载 `GET/POST /api/guestbook`、`GET /api/guestbook/media/:name` 和受保护的 `GET/DELETE /api/admin/guestbook`**
- [x] **Step 4: 验证访客可提交文字/图片、越界图片被拒绝、管理员删除后内容与文件都消失**

约束：昵称最多 32 字，留言最多 1000 字，最多 3 张图片，单张最多 4MB；至少提交文字或一张图片；只接受 PNG、JPEG、WebP；公开返回最新 100 条。

### Task 2: 重排首页并建立 Bot 管理入口

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Create: `guestbook.js`
- Modify: `server/app.js` public asset allowlist
- Modify: `tests/site-smoke.mjs`

- [x] **Step 1: 添加首页结构失败断言**
- [x] **Step 2: 将“我的博客”放到原项目区域之前**
- [x] **Step 3: 用双栏工作台替换原项目卡片，左侧加入 NapCat、AstroBot、宝塔 Docker 三个外部入口**
- [x] **Step 4: 加入图标失败时的本地字母图标兜底、键盘焦点态和窄屏单栏布局**
- [x] **Step 5: 用 `guestbook.js` 加载、提交、预览和安全渲染留言**

外部入口：
- NapCat：`http://39.96.37.102:6099/`
- AstroBot：`http://39.96.37.102:6185/`
- 宝塔 Docker：`https://39.96.37.102:29248/f3c1a365`

### Task 3: 添加管理员留言管理入口

**Files:**
- Create: `admin/guestbook.html`
- Create: `admin/guestbook.js`
- Modify: `admin/index.html`
- Modify: `admin/admin.css`
- Modify: `server/app.js`
- Modify: `tests/admin-ui.test.mjs`
- Modify: `tests/site-smoke.mjs`

- [x] **Step 1: 添加受保护留言管理页面与删除操作的失败断言**
- [x] **Step 2: 实现管理员查看最新留言、图片预览和删除确认**
- [x] **Step 3: 将“留言板”加入后台导航并注册页面/脚本路由**
- [x] **Step 4: 验证未登录跳转、已登录读取和 CSRF 删除**

### Task 4: 集成验证与交付

**Files:**
- Modify: `README.md` only if the final public upload limits or startup instructions need documenting.

- [x] **Step 1: 运行 `npm test`、语法检查和 `git diff --check`**
- [x] **Step 2: 通过本机 Edge headless 和响应式 CSS 检查验证首页顺序、三条 Bot 链接、留言文字/图片提交和移动端单栏布局**
- [x] **Step 3: 验证 `BLOG_DATA_DIR` 中课表仍为原有数据，留言数据与课表数据互不覆盖**
- [x] **Step 4: 创建对应 Git commit，保留用户提供的截图文件不入库**
