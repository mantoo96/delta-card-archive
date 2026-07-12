# Cloudflare 部署与运维记录

最后更新：2026-07-12

## 线上资源

| 资源 | 值 |
|---|---|
| Cloudflare Account ID | `296c13c55805e3d298de849f8683205a` |
| Worker 名称 | `delta-card-archive` |
| 正式域名 | `https://618889.xyz` |
| 备用地址 | `https://delta-card-archive.pei960615.workers.dev` |
| D1 数据库名称 | `delta-card-archive` |
| D1 Binding | `DB` |
| D1 Database ID | `036bd9fe-9389-46b1-9b27-6a4b98595faf` |
| D1 区域 | APAC |
| 静态资源 Binding | `ASSETS` |
| Wrangler 版本 | `4.110.0`（初次部署时） |

Cloudflare 登录使用官方 Wrangler OAuth。账号采用 Google 快捷登录不影响 CLI 授权；运行 `npx wrangler login` 后在浏览器完成确认即可，不需要提供 Google 密码或 API Token。

OAuth 凭据保存在用户系统目录，不在本项目内。不要读取、复制或提交凭据文件。

## 当前架构

```text
浏览器
  ├─ 静态页面 ───────────────→ Workers Static Assets
  └─ /api/* ────────────────→ src/worker.js
                                  ├─ 用户认证
                                  ├─ 会话 Cookie
                                  └─ D1 数据库
                                      ├─ users
                                      ├─ sessions
                                      └─ collections
```

收藏数据以每个用户一行的 JSON 数组保存。54 张牌规模很小，这种设计能减少查询和同步复杂度。

## 数据库结构

### users

- `id`：UUID
- `username`：忽略大小写的唯一用户名
- `password_hash`：PBKDF2-SHA256 摘要
- `password_salt`：随机盐
- `created_at`：毫秒时间戳

### sessions

- `token_hash`：会话 Token 的 SHA-256 摘要
- `user_id`：用户 ID
- `created_at` / `expires_at`：会话时间

浏览器仅保存原始随机 Token 的 HttpOnly Cookie，数据库不保存原始 Token。会话有效期为 30 天。

### collections

- `user_id`：用户 ID，同时是主键
- `owned_json`：拥有牌 ID 数组
- `updated_at`：最后更新时间

## 日常开发

首次或依赖变化后：

```bash
npm install
```

本地数据库迁移：

```bash
npm run db:migrate:local
```

启动本地 Worker：

```bash
npm run dev
```

Wrangler 的本地数据库位于 `.wrangler/`，已在 `.gitignore` 中忽略。删除该目录会清空本地测试账号，但不会影响线上 D1。

## 发布流程

确认登录账号：

```bash
npx wrangler whoami
```

代码和配置预检：

```bash
node --check src/worker.js
node --check static/app.js
npx wrangler deploy --dry-run
```

如果新增了数据库迁移：

```bash
npm run db:migrate:remote
```

发布：

```bash
npm run deploy
```

不要重复创建 D1。`wrangler.jsonc` 已经包含正式数据库 ID 和自定义域名。

## 线上检查

查看实时日志：

```bash
npx wrangler tail delta-card-archive --format pretty
```

查看部署记录：

```bash
npx wrangler deployments list
```

回滚到指定版本：

```bash
npx wrangler rollback <VERSION_ID>
```

查询用户数：

```bash
npx wrangler d1 execute DB --remote --command \
  "SELECT COUNT(*) AS users FROM users;"
```

根据用户名检查收藏数量：

```bash
npx wrangler d1 execute DB --remote --command \
  "SELECT users.username, collections.owned_json, collections.updated_at FROM users JOIN collections ON users.id = collections.user_id WHERE users.username = '用户名';"
```

## 自定义域名

根域名通过 `wrangler.jsonc` 的 Custom Domain 路由绑定：

```jsonc
"routes": [
  {
    "pattern": "618889.xyz",
    "custom_domain": true
  }
]
```

`workers_dev: true` 用于同时保留备用的 `workers.dev` 地址。

## 已知注意事项

- Cloudflare 生产 Web Crypto 拒绝超过 100,000 次的 PBKDF2；本地模拟器可能不会暴露这个限制。
- `/api/auth/me` 未登录时返回 HTTP 401，这是正常行为，不是站点故障。
- 公开注册目前没有邀请码或验证码，任何知道网址的人都能注册。若出现滥用，优先增加邀请码或 Cloudflare Turnstile。
- `data/collection.json` 是旧局域网版本的本地备份，不会自动上传。2026-07-12 检查时其中有 36 张收藏记录，可在用户注册后进行一次性迁移。

## 旧数据迁移方法

用户先在线注册，然后使用 D1 更新对应用户的 `collections.owned_json`。执行前先备份并核对用户名，切勿覆盖错误账号。

也可以把 `data/collection.json` 直接通过页面的“导入收藏数据”功能导入，文件结构与页面导入格式兼容。
