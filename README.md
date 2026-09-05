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
