# 固定共鸣实验账号

## 分组规则

- `^AISA[0-9]+$`（忽略大小写）：城市、人生背景、主题全部使用 `similar`。
- `^AISB[0-9]+$`（忽略大小写）：三个维度全部使用 `different`。
- 其他账号保持普通共鸣流程。

公开注册允许使用这两个实验前缀。路由隐藏只是体验层，数据库触发器和 RLS 才是偏好锁定的安全边界。

## 创建正式账号

先部署 migration、`analytics-track` 和前端，再执行预检：

```bash
npm run accounts:experiment
```

确认预检结果后才允许写入生产项目：

```bash
npm run accounts:experiment -- --apply --project-ref zgyrbtdyraxglxhbkazp
```

脚本创建 `AISA01–AISA20` 与 `AISB01–AISB20`，每人使用独立随机密码和密保答案。凭证默认写到 Git 仓库外：

```text
/Users/bytedance/Desktop/Academia/storyVerse/StoryVerse_experiment_accounts_20260826.csv
```

脚本不会覆盖现有账号或凭证文件。任何账号冲突都会在写入前停止。
