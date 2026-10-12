# ES6 模块版本

这是原网站的原生 ES Modules 重构版。原代码保留在仓库根目录，所有新代码和测试位于 `es6/`；界面、样式和现有业务功能保持一致，没有引入框架或动画库。

## 启动

需要 Node.js 20 或更新版本。在仓库根目录安装原项目的锁定依赖：

```powershell
npm ci
```

沿用原网站的 `BLOG_REPO_DIR`、`BLOG_DATA_DIR`、`BLOG_ADMIN_USERNAME`、`BLOG_ADMIN_PASSWORD_HASH`、`BLOG_SESSION_SECRET` 和 `BLOG_GIT_BRANCH` 环境变量。`BLOG_REPO_DIR` 必须指向原仓库根目录，不是 `es6/`。环境变量配置方法见根目录 `README.md`，不要将密码或私有配置写进仓库。

```powershell
$env:PORT = '3001'
npm --prefix es6 start
```

公开页面：[http://127.0.0.1:3001/](http://127.0.0.1:3001/)

管理后台：[http://127.0.0.1:3001/admin/login](http://127.0.0.1:3001/admin/login)

未设置 `PORT` 时，新版默认使用 3001；旧版启动方式不变。请通过 HTTP 访问，不要双击 HTML 以 `file://` 打开：浏览器模块需要服务器提供正确的响应和模块路径。

## 目录与数据

- `public.js`：公开页面的统一入口，显式初始化各功能。
- `calendar-model.js`、`schedule-model.js`：无 DOM 副作用的共享模型。
- `music.js`、`calendar.js`、`blog.js` 等：按功能划分的前端模块。
- `admin/`：后台页面入口、API 客户端和编辑界面。
- `server/`：ESM 后端服务、存储与路由；`server.js` 是启动入口。
- `tests/`、`scripts/`：行为测试、模块检查和真实浏览器验证。

页面与模块从 `es6/` 提供；文章、公开图片和音乐仍使用原仓库的 `posts/`、`assets/`、`music/`。草稿、课表、留言和会话继续存储在原来的仓库外 `BLOG_DATA_DIR`，无需搬迁或重新录入。不要为了启动新版更换为新的空数据目录。

这不是独立分发包：新版复用根目录的 `package-lock.json` 和 `node_modules`，不要单独复制 `es6/` 后运行。原生 `import/export` 用于前后端，不依赖旧版脚本的执行顺序或全局 API；保留原有现代 JavaScript 语法，并非将代码限制在 ES2015 的全部语法范围内。

## 双版本切换

可使用不同端口预览两个版本，但不要让两个版本同时编辑同一份私人数据。正式切换时，先停止旧服务，再以相同环境变量启动新版；回退时反向操作。当前重构不会自动替换正在运行的服务，也不会部署或推送。

日历自定义事件仍只保存在当前浏览器的 `localStorage`。不同域名或端口属于不同来源，不共享这些事件；使用原来的协议、域名和端口切换，才能继续读取原浏览器日历。服务器保存的博客、课表和留言不受此限制。

## 验证

在仓库根目录执行：

```powershell
npm test
npm --prefix es6 test
npm --prefix es6 run check
npm --prefix es6 run test:browser
```

最后一项需要 Node.js 22+ 和本机 Chrome、Edge 或 Chromium。自动寻找常见安装路径，也可用 `CHROME_PATH` 指定浏览器可执行文件。

浏览器检查使用临时服务器、临时数据和独立浏览器配置，覆盖首页模块、音乐选播、登录、草稿保存和重载、课程保存与服务器重启后的持久化。验证时屏蔽远程字体和 Bot 图标请求，使用字体回退，不依赖外部站点响应；实际网站资源与原版保持一致。发布、删除和 Git 推送被禁止，不接触真实私人数据。音乐自动播放仍受浏览器策略限制，不能保证未经用户交互的有声播放。
