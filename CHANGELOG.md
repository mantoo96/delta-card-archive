# 变更记录

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
- D1 Database ID：`036bd9fe-9389-46b1-9b27-6a4b98595faf`
- 初始 Workers.dev 部署版本：`e7641250-c16e-478a-856e-6380f3a9b0b6`
- 修复 PBKDF2 后版本：`78bcece9-cbf3-4a48-b660-9610e271acbc`
- 首次绑定自定义域名版本：`001fc10e-b515-4f2e-b9de-baf6ef8be648`
- 当前同时启用自定义域名和 Workers.dev 的版本：`294b37c3-a5ed-4d3b-973b-6766a60c6523`
- 正式地址：`https://618889.xyz`
- 备用地址：`https://delta-card-archive.pei960615.workers.dev`
