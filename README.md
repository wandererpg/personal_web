# Personal Website

个人静态网站，用于展示个人项目、知识分享和社交平台入口。

## GitHub 自动上传

本仓库已配置 GitHub SSH 远程地址：

```text
git@github.com:wandererpg/personal_web.git
```

当前 SSH 使用 GitHub 的 `443` 端口，适用于网络无法连接默认 `22` 端口的情况。

### 检查 SSH 认证

在任意终端执行：

```powershell
ssh -T git@github.com
```

如果看到下面的提示，说明认证成功：

```text
Hi wandererpg! You've successfully authenticated, but GitHub does not provide shell access.
```

### 日常上传

在仓库目录执行以下命令：

```powershell
git add .
git commit -m "描述本次改动"
git push
```

之后只要完成提交并执行 `git push`，本地改动就会上传到 GitHub 的 `master` 分支。

## 发布博客

博客内容由仓库文件驱动。当前 MVP 没有网页在线上传后台，发布文章需要在本地创建或更新文件，再提交到 GitHub。

1. 在 `posts/` 下新建一个使用小写短横线命名的 Markdown 文件，例如 `posts/my-first-note.md`。
2. 在 `assets/blog/<slug>/` 下放置文章图片，`<slug>` 使用与 Markdown 文件相同的短标识，例如 `assets/blog/my-first-note/cover.jpg`。
3. 更新 `posts/index.json`，加入文章的标题、日期、摘要、分类、标签、封面路径和 Markdown 内容路径。
4. 启动本地静态服务器预览，例如在仓库目录执行：

   ```powershell
   python -m http.server 8000
   ```

   然后打开 `http://localhost:8000/` 检查首页和博客列表，并通过 `http://localhost:8000/post.html?slug=<slug>` 检查文章详情页、正文图片和前后篇导航。

5. 确认内容和链接无误后，提交并上传博客文件：

   ```powershell
   git add posts assets/blog
   git commit -m "docs: publish a new blog post"
   git push
   ```

推送完成后，服务器重新部署即可公开显示新文章。图片应使用相对路径，并放在对应的 `assets/blog/<slug>/` 目录中，以便 Git 一起追踪和回滚。

### 提交前验证

上传前建议运行项目测试和基础检查：

```powershell
node --test tests/site-smoke.mjs
node --check script.js
git diff --check
```

### 安全注意事项

- 私钥保存在本机的 `.ssh` 目录中，不要复制到仓库或提交到 GitHub。
- 公钥可以上传到 GitHub 的 SSH keys 设置中，但不要公开私钥内容。
- 每次改动完成后都应创建对应的 Git commit，并在交付前确保测试和验证全部通过。
