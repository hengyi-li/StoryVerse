# StoryVerse 架构说明

## 1. 系统边界

StoryVerse 使用“静态前端 + Supabase 后端 + 火山方舟 AI”的结构：

```text
腾讯云 CloudBase / 本地 Vite
        │ Publishable Key + 用户 JWT
        ▼
Supabase Auth ── Edge Functions ── 火山方舟 / Open-Meteo / IPWhois
        │                │
        ├── Postgres + RLS + pgvector
        ├── Queue
        └── Storage
```

- 浏览器不持有 Service Role、数据库密码或 AI Key。
- 普通数据查询受 RLS 限制；需要特权、AI 或第三方网络调用的操作统一进入 Edge Functions。
- CloudBase 只发布 `dist/` 静态文件并提供大陆 CDN、HTTPS 与 SPA 路由，不承担后端职责。
- GitHub `main` 通过 CloudBase Git 仓库部署自动发布；构建必须先通过 Vitest、TypeScript 和产物密钥扫描。
- `localStorage` 只保存语言、页面和引导等界面偏好；IndexedDB 只保存异常恢复草稿。账号和正式故事不落在浏览器假数据库中。

## 2. 前端分层

依赖方向：

```text
main → app → features / components → services / lib / data → types
```

- `src/main.tsx`：挂载 React 与全局样式。
- `src/app`：页面路由、会话恢复、第一篇故事准入和跨页面流程。
- `src/features`：按 Gateway、StoryEditor、Resonance、Recommendations、StarLobby、Admin、Tour 分区。
- `src/components`：两个以上功能复用的视觉组件。
- `src/services/data-service.ts`：前端唯一业务数据门面，封装 Supabase 表与 Functions。
- `src/services/place-search.ts`：本地城市回退 + 服务端 Open-Meteo/IPWhois。
- `src/services/speech-input.ts`：浏览器语音能力。
- `src/services/story-image.ts`：真实图片生成接口和下载。
- `src/lib`：恢复草稿、界面偏好和本地非安全性提示。
- `src/data`：稳定文案、写作引导和本地城市表，不保存假用户或假故事。

React 组件/文件使用 `PascalCase`；普通变量和函数使用 `camelCase`；普通模块文件使用 `kebab-case`；常量使用 `UPPER_SNAKE_CASE`。`StarLobby` 是产品页面名，`GalaxyScene` 只描述其内部 Three.js 场景。

## 3. Supabase 结构

数据库结构只由 `supabase/migrations/` 管理：

| 领域 | 主要表                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------ |
| 账号 | `profiles`, `account_credentials`                                                                |
| 创作 | `story_drafts`, `stories`, `story_versions`                                                      |
| 审核 | `moderation_results`, `review_cases`, `notifications`                                            |
| 标签 | `story_types`, `stories.ai_*`, `stories.final_*`                                                 |
| 向量 | `story_embeddings`                                                                               |
| 推荐 | `resonance_preferences`, `algorithm_configs`, `recommendation_batches`, `recommendation_results` |
| 图片 | `generated_images`, Storage `story-images` bucket                                                |
| 社区 | `reactions`, `reports`, `feedback`                                                               |
| 运维 | `ai_tasks`, `import_batches`, `import_failures`, `admin_audit_logs`                              |

`account_credentials` 保存内部 Auth 邮箱映射、密保问题、随机盐和 PBKDF2 哈希。该表没有普通用户 RLS policy，并撤销了 `anon/authenticated` 权限。密码只由 Supabase Auth 保存。

`profiles.role/status` 不能由普通用户修改；普通用户在表级权限上只能改自己的 `display_name`。管理员身份由 `is_admin()` 和 Edge Function 双重检查。

## 4. 故事状态机

```text
draft → analyzing
          ├── 机审不确定/失败 → pending_review
          │                         ├── 人审通过 → published
          │                         └── 需要修改 → needs_edit
          └── 机审通过 → needs_confirmation → published

published → private / removed
正文或标题变化 → analyzing（重新审核与重新向量化）
```

- `pending_review` 已满足“写完第一篇故事”的大厅门槛，但不公开。
- 用户重新提交会取消旧的待审案件与旧任务。
- 标题/正文变化删除旧图片，并重算正文和主题向量。
- 只改主题仅更新主题向量；只改类型不更新向量。

## 5. AI 管线与 Queue

`story-analyze` 校验故事、保存版本、创建 `ai_tasks`、写入 `pgmq`，随后尝试即时处理。结果只有：

- `pass`：生成 21 类中的一个类型、两个主题、1024 维正文向量和主题向量。
- `human_review`：创建人工审核案件；模型失败、超时或 JSON 无效也走这里。

冷启动 CSV 最多每批 500 行。导入请求只校验、去重、补坐标并写队列，Worker 后台消费，避免请求超时。`external_id` 在全部种子故事中唯一；管理员跳过机审时必须提供来源说明。

Queue Worker 的远程定时调用使用 Supabase Vault 保存 URL 与 Service Role，示例在 `supabase/worker-cron.example.sql`。任务失败保留错误、尝试次数和管理员重试入口。

## 6. 推荐公式

`refresh_recommendations()` 在数据库中一次性计算并保存可追溯批次：

```text
cityScore = 1 / (1 + distanceKm / 500)
ageScore = clamp(1 - ageDifference / 60, 0, 1)
stageScore = 1 - stageIndexDifference / 4
genderScore = same ? 1 : 0
lifeScore = age × 0.50 + stage × 0.30 + gender × 0.20

finalScore = city × 0.15 + life × 0.25 + theme × 0.25 + semantic × 0.35
```

城市、人生和主题按用户选择应用原分或 `1 - 原分`，全文语义始终正向。候选只包含其他用户的 `published` 故事；Embedding 模型与版本必须一致。结果严格按总分排序，推荐页取 5，星空取 100。点赞、点踩和未处理举报不参与公式。

每个批次记录参照故事、算法配置、偏好、分项分数、总分和排名。管理员推荐配置先保存 `draft`，再发布版本，旧批次继续指向旧版本。

## 7. 星空映射

- 距离：数据库返回的全文 `semanticScore`。
- 大小：正文长度的平方根映射，并设置上下限。
- 角度与高度：由故事 UUID 稳定哈希，刷新不跳动。
- 颜色：故事最终 21 类关联 `story_types.color`，管理员更新后随下一次读取生效。

旧 `city/choice/family/future/memory` 星空分类和硬编码模拟相似度已删除。

## 8. 管理后台

`AdminGate` 使用同一套真实账号登录；`AdminConsole` 只在服务端确认 `role=admin` 后显示。后台支持：

- 人工审核的“允许公开 / 需要修改”。
- 账号停用、恢复与人工密码重置（不能读取密码或密保答案）。
- 故事搜索、下架和恢复，不能修改普通用户正文。
- 21 类颜色、启用状态和顺序。
- 推荐权重草稿与发布。
- AI 失败任务查看和重试。
- 用户反馈与冷启动 CSV 导入。

所有写操作调用 `admin-api` 并写入 `admin_audit_logs`。

## 9. 安全约束

- `.env.local` 和函数 secrets 不提交 Git。
- 前端只使用 `VITE_SUPABASE_URL` 与 Publishable Key。
- RLS：本人可读写草稿和个人数据；公众只读 `published`；管理员通过服务端角色提升权限。
- 服务端审核是公开前唯一安全判定；浏览器关键词和正则审核已删除。
- 地点查询不发送正文；IP 提示只返回城市/国家/坐标且不保存 IP。
- 语音输入由浏览器实现，应用不上传录音。
- 管理员不能删除 21 类；已使用类型不会失去外键。

## 10. 验证顺序

```bash
npm test
npm run db:reset
npm run db:test
npm run build
npm run build:cloudbase
npm run format:check
```

视觉回归入口保持为 `/`、`/StoryStart`、`/StoryWrite`、`/StoryAnalyzing`、`/StoryPage`、`/Resonance`、`/Recommendations`、`/StarLobby`、`/Admin`。`?tour=1` 可重播新手引导。涉及 DOM、CSS、Three.js 参数或动画时间的调整必须重新截取桌面、移动端、日间和夜间基线。
