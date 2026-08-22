# StoryVerse

StoryVerse 是一个人生故事社区。前端保留 React、TypeScript、Vite 与原有 Three.js 星空体验；正式数据、账号权限、AI 任务、推荐结果和图片文件统一由 Supabase 与火山方舟提供。

当前代码不再包含浏览器假数据库、示例故事池、演示管理员密码、前端关键词审核或高德 Key。旧浏览器账号、故事和草稿不会迁移到新版本。

## 技术组成

- React 18 + TypeScript + Vite：页面与静态构建。
- Supabase Postgres + Auth + RLS + Storage + Queues：账号、故事、权限、图片与异步任务。
- `pgvector`：1024 维正文向量和主题向量。
- 火山方舟：Doubao 内容判断/标签、Embedding 与 Seedream 配图。
- Open-Meteo：城市搜索和缺失坐标补全。
- IPWhois：只给出城市建议，不保存完整 IP。
- 浏览器 `SpeechRecognition`：语音转文字，StoryVerse 不上传录音。

详细设计见 [架构说明](docs/architecture.md)、[页面和用户旅程](docs/site-overview.md) 与
[腾讯云部署手册](docs/deployment/tencent-cloud.md)。

## 目录

```text
src/                         # React 前端源码
├── app/                     # 页面调度、路由和全局流程
├── assets/                  # 视觉素材与图片风格预览
├── components/              # 跨功能组件
├── data/                    # 稳定文案、写作引导和本地城市回退表
├── features/                # gateway/story-editor/resonance/recommendations/star-lobby/admin/tour
├── lib/                     # 界面偏好、恢复草稿和本地文本提示
├── services/                # Supabase、地点、语音和图片服务适配
├── styles/                  # 共享样式
└── types/                   # 领域和界面类型
supabase/
├── migrations/              # 数据库、RLS、Queue、Storage 与推荐公式
├── functions/               # Edge Functions 与共享服务端代码
├── tests/                   # pgTAP 数据库测试
├── config.toml              # 本地 Supabase 配置
└── seed.sql                 # 本地种子入口（不放假故事）
tests/                       # 前端与服务端纯规则 Vitest 测试
docs/                        # 架构、旅程和变更记录
```

`node_modules/` 和 `dist/` 都是可重新生成的产物，不是源码，并已被 Git 忽略。

## 一次性配置

### 1. 前端环境变量

复制 `.env.example` 为 `.env.local`，填写 Supabase 项目 Settings → API 中的 Project URL 与 Publishable Key：

```dotenv
VITE_SUPABASE_URL=https://你的项目编号.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_BASE_PATH=/
```

前端只能放 Publishable Key。不要把 Service Role 或火山方舟 Key 写进 `VITE_` 变量。

### 2. Edge Function secrets

复制 `supabase/functions/.env.example` 为 `supabase/functions/.env.local`，仅供本地函数运行。线上使用 CLI secrets：

```bash
npx supabase secrets set --env-file supabase/functions/.env.local
```

需要填写：

```dotenv
ARK_API_KEY=...
ARK_TEXT_MODEL=doubao-seed-evolving
ARK_EMBEDDING_MODEL=doubao-embedding-vision-251215
ARK_IMAGE_MODEL=doubao-seedream-5-0-260128
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
FRONTEND_ORIGINS=http://127.0.0.1:4173,http://localhost:4173,https://storyverse-prod-d9f1q8jqe812448d-1351558504.tcloudbaseapp.com
STORYVERSE_WORKER_TOKEN=使用密码管理器生成的至少64位随机字符串
STORYVERSE_MONITOR_TOKEN=使用密码管理器生成的至少32位随机字符串
```

Supabase 会自动为函数注入 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEYS` 和 `SUPABASE_SECRET_KEYS`。StoryVerse 只读取两个 Key 集合中的 `default` 项，不再依赖旧的 `anon` 或 `service_role` Key。不要把这些值写入仓库。

## 本地运行完整网站

需要 Node.js、Docker Desktop（或兼容 Docker Runtime）和 Supabase CLI；CLI 已作为开发依赖安装。

```bash
npm install
npm run supabase:start
npm run db:reset
npm run functions:serve
npm run dev
```

打开 <http://127.0.0.1:4173>；Supabase Studio 在 <http://127.0.0.1:54323>。

若要让前端连接本地 Supabase，把 `.env.local` 临时改成本地 `supabase start` 输出的 API URL 与 Publishable Key。停止环境：

```bash
npm run supabase:stop
```

## 连接线上 Supabase

```bash
npx supabase login
npx supabase link --project-ref 你的项目编号
npx supabase db push
npx supabase functions deploy
npx supabase secrets set --env-file supabase/functions/.env.local
```

数据库迁移是结构的唯一事实来源；不要只在网页表格编辑器里手工建表。你可以完全在 VS Code 中维护迁移，再通过 `db push` 同步到线上。

注册一个普通账号后，首次管理员需要在 Supabase SQL Editor 中明确授权：

```sql
update public.profiles set role = 'admin' where username = '你的账号';
```

管理员仍使用普通账号密码登录，但所有后台接口会在服务端复核 `role` 与账号状态。

## 队列 Worker

普通故事提交会写入 Queue 并在当前请求中立即处理；冷启动批量导入只入队，避免一次请求超时。部署后需要按 [supabase/worker-cron.example.sql](supabase/worker-cron.example.sql) 配置每分钟 Worker 调用。定时任务只使用独立的 `STORYVERSE_WORKER_TOKEN`，不接触数据库管理员 Key。

## 腾讯云前端发布

正式前端使用腾讯云 CloudBase 静态网站托管，GitHub `main` 分支是自动部署来源。CloudBase 使用：

```text
Node.js       22
安装命令      npm ci
构建命令      npm run build:cloudbase
输出目录      dist
部署路径      /
```

CloudBase 构建环境必须填写 `.env.example` 中的前端变量，并固定 `VITE_BASE_PATH=/`。取得腾讯云默认域名后，还要把完整 Origin 加入线上 `FRONTEND_ORIGINS` 和 Supabase Auth Redirect URL；只上传前端文件并不能完成后端授权。

当前 CloudBase 生产候选环境为 `storyverse-prod-d9f1q8jqe812448d`，测试域名为 <https://storyverse-prod-d9f1q8jqe812448d-1351558504.tcloudbaseapp.com>。

GitHub Pages 已退出发布链路。深层路由由 CloudBase 将错误文档/SPA 回退配置为 `index.html`，不再生成或依赖 `404.html`。完整控制台步骤、缓存策略、拨测与回滚见 [腾讯云部署手册](docs/deployment/tencent-cloud.md)。

## 验证

```bash
npm test
npm run db:test
npm run build
npm run build:cloudbase
npm run format:check
```

- Vitest 覆盖新用户准入、100–1500 字、必填字段、21 类和主题规则等。
- pgTAP 覆盖核心表、RLS 策略、21 类种子和距离/阶段函数。
- `npm run build` 做 TypeScript 检查并生成 `dist/`；`npm run build:cloudbase` 额外执行测试、根路径和密钥扫描。
- `docs/visual-baseline/` 保存桌面、移动端、StoryStart、StoryWrite 和 StoryPage 的视觉回归基线。

CloudBase 只托管静态前端；数据库和 Edge Functions 仍由 Supabase 托管。生产构建中不应出现 Service Role、火山方舟 Key、高德 Key、腾讯云 SecretKey 或其他私密凭据。
