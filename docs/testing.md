# StoryVerse 测试手册

本项目采用分层测试。任何单独一层通过，都不能代表网站可以发布；发布候选版本至少需要通过静态检查、规则测试、数据库测试、浏览器 E2E、真实 AI 链路和生产冒烟测试。

## 完整验证

启动 Docker Desktop 和本地 Supabase，并在 `supabase/functions/.env.local` 配置测试用火山方舟模型。先在终端一保持本地前端和 Functions 运行：

```bash
npm run supabase:start
npm run dev:local
```

然后在终端二运行完整发布验证：

```bash
npm run qa:release
```

`qa:release` 顺序执行：

1. Prettier 格式检查。
2. Vitest 前端与服务端规则测试。
3. pgTAP 数据库、约束、函数和 RLS 测试。
4. TypeScript、Vite、CloudBase 路由与密钥扫描。
5. Playwright 核心浏览器旅程。
6. Playwright 真实豆包 AI 浏览器旅程。
7. 现有的本地 API 级完整 QA，包括图片生成等长耗时任务。

真实 AI 和图片测试会产生 API 用量，所以 GitHub CI 只执行不依赖真实 AI 的 `e2e:core`；发版人在本地明确执行 `qa:release`。

## 测试层级

| 层级       | 命令                      | 主要验证内容                                          |
| ---------- | ------------------------- | ----------------------------------------------------- |
| 代码格式   | `npm run format:check`    | 源码、测试和配置格式                                  |
| 规则/组件  | `npm test`                | 字数、状态机、问卷条件、标签、推荐和埋点契约          |
| 数据库     | `npm run db:test`         | 表、约束、RLS、触发器、推荐函数、问卷锁定、管理员权限 |
| 浏览器核心 | `npm run e2e:core`        | 真实点击、输入、刷新、路由、数据库落库和权限          |
| 浏览器 AI  | `npm run e2e:ai`          | 写故事、AI 分析、确认/发布、推荐刷新、大厅            |
| API 长链路 | `npm run qa:local`        | Edge Functions、队列、AI、图片、翻译及业务边界        |
| 生产冒烟   | `npm run qa:online-smoke` | 已部署前后端的只读/受控生产验证                       |

## Playwright 浏览器场景矩阵

### 认证与前测

- 注册账号格式不合法时显示反馈。
- 密码与确认密码不一致时阻止提交。
- 新账号不能绕过 `/PreTest` 直接进入 `/StarLobby`。
- 同意前不能进入下一步；中英文说明和两张预览图可见。
- 每一步保存后刷新可恢复。
- 海外居住分支、行业条件字段、学生专业条件字段按规则显示。
- 完成后进入 `/StoryStart` 且不能重新修改答案。
- 拒绝后退出登录，受保护路由不可访问。

### 故事写作与发布

- 从 StoryStart 选择写作引导并进入 StoryWrite。
- 缺少必填字段或正文不足 100 字时阻止 AI 整理。
- 年龄、性别、人生阶段、城市、情绪、人物和正文完整填写。
- 草稿自动保存到本地 Supabase，刷新页面后恢复。
- `@real-ai` 用例调用真实豆包进行分析；在 StoryPage 通过真实按钮生成 Seedream 图片，校验 1:1 尺寸及 Storage 新页面打开；随后覆盖确认、发布/待人工确认、共鸣选择和进入大厅。

### StarLobby、阅读和后测

- 已发布的本人故事和其他故事可从真实数据库加载。
- 新手引导完成或跳过后出现后测提醒。
- 搜索实际筛选故事。
- 星空语义按钮支持键盘聚焦和打开阅读面板。
- 不喜欢操作有可见反馈。
- 后测未答题时阻止前进，五个部分共 41 题逐步保存并最终提交。
- 完成后回到大厅；再次点击问卷入口显示已完成提示。

### 管理员与权限

- 普通账号不能进入 `/Admin`。
- 管理员账号可以进入后台。
- 管理员可以打开前测和后测数据视图。

### 响应式、深层路由与基础可访问性

- 手机视口无横向溢出，语言/主题按钮和登录表单可操作。
- `/PreTest`、`/PostTest`、`/StoryStart`、`/StoryWrite`、`/StoryPage`、`/StarLobby` 直接刷新不白屏，未登录时回到安全入口。
- 关键星点可以通过键盘而非只能依赖 Three.js 鼠标命中。
- 桌面 Chromium 使用 1440×900；移动 Chromium 使用 iPhone 13 设备参数，并单独检查 320、390、768 三档宽度。

## 隔离与安全

- `scripts/run-browser-e2e.mjs` 必须从 Supabase CLI 读取本地地址；如果不是 `127.0.0.1` 会立即终止，防止 E2E 清理逻辑触碰生产数据。
- 测试账号、故事和问卷数据使用唯一标识，用例结束后由 Service Key 清理。
- pgTAP 的埋点固定数据使用独立历史时间窗，避免被浏览器 E2E 的埋点数据污染。
- 浏览器测试失败不会只给一行报错：`outputs/playwright-artifacts/` 会保留截图、录像和 trace，`outputs/playwright-report/` 会生成 HTML 报告。
- 密码、密保答案、Token 和 API Key 不写入测试报告或仓库。

## CI 与发布门槛

GitHub CI 有三个互相独立的作业：

1. `verify`：格式、Vitest、TypeScript 和构建。
2. `database`：全新本地 Supabase 上执行 pgTAP。
3. `browser-e2e`：安装 Chromium，在全新本地 Supabase 上执行核心浏览器旅程；失败时上传诊断产物。

发版前还必须由本地执行真实 AI/图片测试。CloudBase 部署后进行生产冒烟，确认登录、前后测、故事发布、StarLobby、Storage 图片和管理员入口。生产 E2E 必须使用专用测试账号和可清理数据，不能复用真实参与者账号。

## 当前明确边界

- 自动浏览器回归目前使用 Chromium，覆盖 Chrome/Edge 内核；Safari/WebKit 和 Firefox 尚未纳入 CI。
- 动态 Three.js 星空和 AI 图片不做逐像素快照，避免随机渲染导致伪失败；关键布局使用无溢出断言，失败时保留截图人工复核。
- 中国大陆多运营商网络质量、第三方 AI 响应时间和 Supabase 跨境链路不能由本地 E2E 证明，仍需云拨测和生产监控。
