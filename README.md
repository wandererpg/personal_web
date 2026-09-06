# Personal Website

Wanderer 的个人网站与博客系统。公开页面展示个人项目、心得分享和日常学习；私人后台用于编写 Markdown、上传图片、保存草稿，并通过 Git 提交与推送发布文章。

## 功能概览

- 公开主页、项目页、三模块博客和文章详情页
- 星空与液态玻璃视觉、北京日期时间、日历事件和悬浮音乐播放器
- 单管理员登录，访客只能读取已发布文章
- 私有 Markdown 草稿、自动保存、即时预览和图片上传
- 发布时自动更新 `posts/` 与 `assets/blog/`，创建 Git commit 并推送远程仓库

后台入口为 `/admin`。草稿、待发布图片和登录会话都存放在仓库外的 `BLOG_DATA_DIR`，不会被公开静态路由访问，也不会随 Git 提交泄露。

## 本地启动

需要 Node.js 20 或更高版本、Git，以及已经配置好 Push 权限的 SSH key。

```powershell
npm ci
node scripts/hash-password.js
```

密码工具要求交互式终端和至少 12 个字符。输入不会回显，命令只会把 bcrypt 哈希输出到标准输出；请把哈希保存到环境变量，不要提交明文密码。

在仓库外创建私人数据目录，然后设置环境变量：

```powershell
New-Item -ItemType Directory -Force C:\WebsiteData\personal-website | Out-Null
$env:NODE_ENV = 'development'
$env:PORT = '3000'
$env:BLOG_REPO_DIR = (Get-Location).Path
$env:BLOG_DATA_DIR = 'C:\WebsiteData\personal-website'
$env:BLOG_ADMIN_USERNAME = 'wanderer'
$env:BLOG_ADMIN_PASSWORD_HASH = '粘贴生成的 bcrypt 哈希'
$env:BLOG_SESSION_SECRET = '至少 32 个随机字符'
$env:BLOG_GIT_BRANCH = 'master'
npm start
```

打开 `http://127.0.0.1:3000/` 查看网站，打开 `http://127.0.0.1:3000/admin` 登录后台。项目不会自动读取 `.env` 文件；`.env.example` 仅作为变量清单，实际值应由终端、服务管理器或密钥系统注入。

可以使用 OpenSSL 生成会话密钥：

```bash
openssl rand -base64 48
```

## 写作与发布

1. 在后台选择“新建文章”，归入“我的项目”“心得分享”或“日常学习”。
2. 填写标题、链接标识、摘要和 Markdown 正文。编辑器会在停止输入 1.5 秒后自动保存。
3. 可通过按钮、拖放或粘贴上传 PNG、JPEG、WebP 图片；单个文件最大 8 MB。
4. 发布前检查右侧预览，然后点击“发布文章”。
5. 服务会更新 `posts/<slug>.md`、`posts/index.json` 和文章图片，创建对应 Git commit，并 Push 到 `BLOG_GIT_BRANCH`。

只有已发布文章会进入公开索引。草稿只保存在 `BLOG_DATA_DIR`，其他访客无法读取或修改。编辑已发布文章时，系统会先创建私人修订稿，公开版本会一直保留到下一次发布完成。

如果 commit 已创建但网络 Push 失败，文章会显示为“待同步”。网络恢复后在编辑器点击“重试 Git 同步”；系统不会重复生成文章提交。

## GitHub SSH 自动上传

本仓库远程地址为：

```text
git@github.com:wandererpg/personal_web.git
```

当前 SSH 配置通过 GitHub 的 443 端口连接，适用于默认 22 端口被拦截的网络。验证认证：

```powershell
ssh -T git@github.com
git remote -v
git push --dry-run origin master
```

看到 GitHub 的认证成功提示后，后台发布服务即可使用同一系统用户的 SSH 配置自动 Push。不要把私钥、公钥以外的凭据或服务器环境文件提交到仓库。

## Linux 服务器部署

以下示例假设仓库位于 `/srv/personal_website`，私人数据位于 `/srv/personal_website-data`。

1. 创建非 root 用户，克隆仓库并安装生产依赖：

   ```bash
   sudo useradd --system --create-home personal-website
   sudo mkdir -p /srv/personal_website-data
   sudo chown -R personal-website:personal-website /srv/personal_website /srv/personal_website-data
   sudo -u personal-website npm ci --omit=dev --prefix /srv/personal_website
   ```

2. 根据 `.env.example` 创建 `/etc/personal-website.env`，权限设为 `600`，所有值使用真实绝对路径和随机密钥。该文件必须位于仓库外。
3. 将 `deploy/personal-website.service.example` 复制到 `/etc/systemd/system/personal-website.service`，检查 Node/npm 路径后启用服务：

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now personal-website
   sudo systemctl status personal-website
   ```

4. 将 `deploy/nginx.conf.example` 复制到 Nginx 站点配置，替换域名和证书路径。配置只让 Node 监听 `127.0.0.1:3000`，外部访问必须经过 HTTPS。
5. 给 `personal-website` 用户配置 GitHub SSH key，并执行 `sudo -u personal-website ssh -T git@github.com` 和一次 `git push --dry-run` 验证权限。

## 备份与故障恢复

### 草稿备份

定期备份整个 `BLOG_DATA_DIR`，其中包含 `drafts/`、`media/` 和 `sessions/`。推荐使用服务器快照或加密后的增量备份；恢复时先停止服务，恢复目录所有权，再启动服务。不要把该目录复制进公开仓库。

### 待同步与 Git 冲突

后台发布前会检查远程分支是否仍是本地提交的祖先。如果服务器仓库落后或发生分叉，发布会停止，不会强制覆盖远程历史。

```bash
sudo systemctl stop personal-website
cd /srv/personal_website
git status
git fetch origin
git log --oneline --graph --decorate --all -20
git pull --rebase origin master
npm test
sudo systemctl start personal-website
```

如 rebase 出现冲突，应人工核对 `posts/index.json` 和文章文件，完成后再次运行测试。不要使用 force-push。已有“待同步”提交时先保留当前仓库和 `BLOG_DATA_DIR` 备份，再处理分支差异。

## 验证与日常维护

每次改动和部署前运行：

```powershell
npm test
node --check server.js
git diff --check
```

每次功能改动都应同步更新测试并创建对应 Git commit，以便追踪和回滚。常规代码上传仍可使用：

```powershell
git add .
git commit -m "描述本次改动"
git push
```
