# 变更记录

## 2026-07-14

### 公开发布与安全加固

- 增加游客模式，未登录时收藏只保存在当前浏览器；登录或注册后安全合并到账号数据。
- 注册增加 Cloudflare Turnstile，人机验证 Secret 使用 Worker Secret 保存。
- 为注册、登录和收藏写入接口增加 Cloudflare Rate Limiting 绑定。
- 增加隐私说明、安全报告指南、MIT License 和 GitHub Actions 部署工作流。
- 创建公开仓库 `mantoo96/delta-card-archive`，发布前完成生产 D1 完整备份。
- 关闭公开的 `workers.dev` 地址，只保留 `https://618889.xyz`，防止绕过正式域名上的防护策略。
- 生产验证未创建遗留测试账号；原有用户、会话和收藏记录数量保持不变。

## 2026-07-12

### 初始局域网版本

- 创建标准 54 张扑克牌收藏页面。
- 增加按拥有状态筛选、搜索、进度统计和 JSON 导入导出。
- 增加点数排序：A 到 K，每行四个花色。
- 花色顺序调整为红桃、方片、黑桃、梅花。
- 初始 Python 局域网服务使用 `data/collection.json` 共享保存收藏。

### Cloudflare 多用户版本

- 将后端迁移为 Cloudflare Workers。
- 使用 Workers Static Assets 提供原生前端文件。
- 创建 D1 数据库 `delta-card-archive`。
- 新增 `users`、`sessions`、`collections` 三张表。
- 增加用户名密码注册、登录、退出和 30 天会话。
- 密码改为 PBKDF2-SHA256 加盐摘要，会话 Token 在数据库中只保存 SHA-256 摘要。
- 每个用户使用独立收藏数据，完成双账号隔离验证。
- 增加账号登录界面和登录用户显示。
- 生产测试发现 Cloudflare PBKDF2 上限为 100,000 次，将迭代次数由 120,000 调整为 100,000。
- 删除已经不兼容的 Python 服务入口，Wrangler 成为唯一开发与部署入口。

### 首次上线

- Worker：`delta-card-archive`
- 正式地址：`https://618889.xyz`
- 初次上线时提供过 `workers.dev` 备用地址，已于 2026-07-14 关闭。
