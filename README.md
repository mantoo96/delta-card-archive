# 三角洲扑克牌收集记录

部署在 Cloudflare Workers 上的多用户扑克牌收藏 Web UI。每个账号拥有独立的收藏进度，数据保存在 Cloudflare D1 中。

> 非官方玩家工具，与《三角洲行动》及其开发、发行和运营主体无隶属或合作关系。

- 试用地址：<https://618889.xyz>
- Codex/维护说明：[`AGENTS.md`](AGENTS.md)
- Cloudflare 运维记录：[`docs/CLOUDFLARE_DEPLOYMENT.md`](docs/CLOUDFLARE_DEPLOYMENT.md)
- 变更历史：[`CHANGELOG.md`](CHANGELOG.md)

## 功能

- 用户名和密码注册、登录，30 天登录状态
- 每个用户独立保存标准 54 张牌的收藏进度
- 按点数排序：每行红桃、方片、黑桃、梅花，从 A 开始
- 按花色排序、拥有状态筛选、牌名搜索
- 自动保存、JSON 导入导出
- 手机、平板和电脑响应式布局
- 游客本机保存，注册登录后可合并并跨设备同步
- Cloudflare Turnstile 人机验证和接口限流

## 隐私与安全

- [隐私说明](static/privacy.html)
- [安全问题报告](SECURITY.md)
- 本项目采用 [MIT License](LICENSE)

## 技术结构

- 前端：原生 HTML、CSS、JavaScript
- API：Cloudflare Workers
- 数据库：Cloudflare D1
- 静态文件：Workers Static Assets
- 身份认证：PBKDF2-SHA256 密码摘要和 HttpOnly 会话 Cookie

## 本地开发

安装依赖并初始化本地数据库：

```bash
npm install
npm run db:migrate:local
```

启动：

```bash
npm run dev
```

Wrangler 会显示本地访问地址，通常为 `http://localhost:8787`。

## 首次部署

登录 Cloudflare：

```bash
npx wrangler login
```

创建数据库：

```bash
npx wrangler d1 create delta-card-archive
```

将返回的 `database_id` 写入 `wrangler.jsonc`，然后执行：

```bash
npm run db:migrate:remote
npm run deploy
```

之后更新只需要：

```bash
npm run deploy
```

## 数据结构

- `users`：用户账号和密码摘要
- `sessions`：登录会话
- `collections`：以用户 UID 为主键保存收藏牌 ID 数组

数据库迁移文件位于 `migrations/`。
