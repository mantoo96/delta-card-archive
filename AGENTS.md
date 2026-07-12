# Codex 项目维护说明

本项目是已经上线的 Cloudflare Workers + D1 应用。开始修改前请先阅读：

1. `README.md`
2. `docs/CLOUDFLARE_DEPLOYMENT.md`
3. `CHANGELOG.md`

## 项目入口

- Worker/API：`src/worker.js`
- 页面结构：`static/index.html`
- 页面样式：`static/styles.css`
- 页面交互：`static/app.js`
- D1 迁移：`migrations/`
- Cloudflare 配置：`wrangler.jsonc`

## 强制维护约定

- 当前生产数据库已经存在，不要再次运行 `wrangler d1 create`，除非明确要创建新环境。
- 不要修改 `wrangler.jsonc` 中现有 D1 `database_id`。
- 保留自定义域名 `618889.xyz` 和 `workers_dev: true`，确保正式域名与备用地址都能访问。
- 数据库结构变化必须新增迁移文件，不要修改已经在线执行过的 `0001_initial.sql`。
- Cloudflare Web Crypto 的 PBKDF2 迭代次数上限是 `100000`，不要调高，否则生产注册/登录会触发 Worker 1101 错误。
- 密码不得明文记录、输出或写入日志。认证 Cookie 必须继续使用 `HttpOnly`、`SameSite=Lax`，线上使用 `Secure`。
- 修改收藏牌 ID 时，需要同步更新 Worker 和前端的花色/点数定义，并考虑已有用户数据兼容。
- 生产测试若创建临时账号，测试完成后必须从 `sessions`、`collections`、`users` 中清理。
- 不要把 Wrangler OAuth 凭据、API Token 或 `.wrangler/` 内容提交到项目。

## 修改后的最低验证

```bash
npm install
node --check src/worker.js
node --check static/app.js
npm run db:migrate:local
npm run dev
```

需要验证：

- 注册、登录、退出
- 用户 A 与用户 B 数据隔离
- 点击牌面后自动保存
- 退出并重新登录后收藏恢复
- 手机宽度下无横向滚动
- 浏览器控制台无错误

部署前执行：

```bash
npx wrangler whoami
npx wrangler deploy --dry-run
```

涉及新迁移时，先执行远端迁移，再部署：

```bash
npm run db:migrate:remote
npm run deploy
```

仅前端或 Worker 代码更新时：

```bash
npm run deploy
```

部署完成后验证：

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://618889.xyz/
curl -sS -o /dev/null -w '%{http_code}\n' https://618889.xyz/api/auth/me
```

预期分别返回 `200` 和 `401`，后者表示未登录访问认证接口，属于正常结果。
