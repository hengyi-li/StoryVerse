# StoryVerse 腾讯云部署手册

## 1. 当前目标架构

```text
GitHub main
  → CloudBase 自动构建（测试 + TypeScript + Vite + 密钥扫描）
  → CloudBase 静态托管 / CDN / HTTPS
  → 浏览器直接访问 Supabase Auth、Postgres、Edge Functions、Storage
```

第一阶段只使用腾讯云默认 `*.tcloudbaseapp.com` 域名做内部测试。正式实验入口必须切换到已备案的自有域名。

当前已创建的生产候选环境：

| 配置        | 值                                                                      |
| ----------- | ----------------------------------------------------------------------- |
| 环境名称    | `storyverse-prod`                                                       |
| 环境 ID     | `storyverse-prod-d9f1q8jqe812448d`                                      |
| 默认 Origin | `https://storyverse-prod-d9f1q8jqe812448d-1351558504.tcloudbaseapp.com` |

## 2. 创建 CloudBase 部署

1. 使用已实名认证的腾讯云账号创建一个中国大陆 CloudBase 环境，记录环境 ID。
2. 进入“静态网站托管 → 新建部署 → Git 仓库 → 公开仓库”，填写 `https://github.com/hengyi-li/StoryVerse`。
3. 选择 `main` 分支并开启分支更新后自动部署。
4. 填写构建配置：

   | 配置     | 值                        |
   | -------- | ------------------------- |
   | Node.js  | `22`                      |
   | 安装命令 | `npm ci`                  |
   | 构建命令 | `npm run build:cloudbase` |
   | 输出目录 | `dist`                    |
   | 部署路径 | `/`                       |

5. 在 CloudBase 构建环境填写：

   ```dotenv
   VITE_SUPABASE_URL=https://zgyrbtdyraxglxhbkazp.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=现有_publishable_key
   VITE_BASE_PATH=/
   VITE_ANALYTICS_STUDY_ID=storyverse_lab_v1
   VITE_ANALYTICS_CONDITION_ID=default
   ```

6. 将首页文档和错误文档都设为 `index.html`，然后验证 `/StoryPage`、`/StarLobby` 和 `/Admin` 硬刷新返回 HTTP 200。
7. 浏览器缓存规则：`index.html` 不长期缓存；`/assets/*` 使用一年缓存。刷新配置后等待 CDN 生效再回归。

## 3. 接通 Supabase

本环境的完整 Origin 是 `https://storyverse-prod-d9f1q8jqe812448d-1351558504.tcloudbaseapp.com`，配置时不要带路径或末尾 `/`。

1. 生成独立拨测 Token：`openssl rand -hex 32`。
2. 更新线上 Edge Function secrets，保留本地来源并加入腾讯域名：

   ```bash
   npx supabase secrets set \
     FRONTEND_ORIGINS=http://127.0.0.1:4173,http://localhost:4173,https://storyverse-prod-d9f1q8jqe812448d-1351558504.tcloudbaseapp.com \
     STORYVERSE_MONITOR_TOKEN=生成的随机值
   npx supabase functions deploy --project-ref zgyrbtdyraxglxhbkazp
   ```

3. 在 Supabase Auth URL Configuration 中把 Site URL 和 Additional Redirect URLs 更新为腾讯默认域名，同时保留本地开发地址。
4. 所有线上 QA 命令必须显式提供真实来源：

   ```bash
   STORYVERSE_FRONTEND_ORIGIN=https://storyverse-prod-d9f1q8jqe812448d-1351558504.tcloudbaseapp.com npm run qa:online-smoke
   ```

代码不再把任何 GitHub Pages 域名视为可信来源。陌生 Origin 的预检响应不会包含 `Access-Control-Allow-Origin`。

## 4. GitHub 发布门禁与回滚

- `main` 开启分支保护，禁止直接推送；合并前要求 `StoryVerse CI / verify` 和 `StoryVerse CI / database` 通过。
- CloudBase 在 `main` 更新后自动发布，并再次运行 `npm run build:cloudbase`。
- 自动部署失败时不得覆盖当前可用版本。
- 回滚使用 `git revert <有问题的提交>`，合并到 `main` 后由同一流程重新部署；不在腾讯云控制台手工拼接旧文件。
- CloudBase 验收完成后关闭 GitHub Pages。旧地址最多保留 72 小时，只作为切换期间回滚入口。

## 5. 大陆拨测

部署 `health-check` Edge Function 后，在腾讯云云拨测创建以下任务：

| 对象          | 请求                                                                                                    | 通过标准                     |
| ------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 前端首页      | `GET https://腾讯域名/`                                                                                 | HTTP 200、可用率 ≥ 99.9%     |
| SPA 深链      | `GET https://腾讯域名/StarLobby`                                                                        | HTTP 200、返回应用入口       |
| Supabase + DB | `GET https://项目.supabase.co/functions/v1/health-check`，携带 `apikey` 与 `x-storyverse-monitor-token` | 可用率 ≥ 99.5%、P95 ≤ 2.5 秒 |
| Storage 图片  | 对一张公开测试图片发起 GET/Range                                                                        | P95 ≤ 3 秒                   |

节点至少覆盖北京、上海、广州、成都、西安，并分别选择移动、联通、电信。连续运行 72 小时后才能判定是否适合大陆实验。

单个网络环境的发布前检查：

```bash
STORYVERSE_SITE_URL=https://storyverse-prod-d9f1q8jqe812448d-1351558504.tcloudbaseapp.com \
VITE_SUPABASE_URL=https://zgyrbtdyraxglxhbkazp.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=现有_publishable_key \
STORYVERSE_MONITOR_TOKEN=拨测_token \
STORYVERSE_STORAGE_PROBE_URL=公开测试图片地址 \
npm run qa:mainland-connectivity
```

任一运营商无法完成注册、登录、写作、分析、发布、StarLobby 阅读时，停止正式招募并输出地域、运营商、接口和失败率报告，不通过 CNAME/CDN 掩盖跨境问题。

## 6. 正式域名

1. 购买并实名认证域名，备案主体与域名实名主体保持一致。
2. 完成 ICP 备案后，将 `www.<正式域名>` 绑定 CloudBase 并开启 HTTPS。
3. 在 Supabase `FRONTEND_ORIGINS`、Auth URL Configuration 和线上 QA 来源中加入正式域名。
4. 验收正式域名后移除默认域名的生产授权。
5. 页面底部展示 ICP 备案号并链接 `https://beian.miit.gov.cn/`；网站开通后按要求完成公安联网备案，再展示公安备案号。

正式招募中国大陆参与者前，实验机构还需确认隐私告知、个人信息出境单独同意与个人信息保护影响评估；部署验收不替代合规审查。
