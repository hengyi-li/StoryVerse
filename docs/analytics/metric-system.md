# StoryVerse 实验指标体系

## 1. 统计口径

- 实验：`storyverse_lab_v1`，默认条件：`default`。
- 业务时区：`Asia/Shanghai`；自然周为周一 00:00 至下周一 00:00。
- 参与者：服务端根据登录用户 ID 或匿名浏览器 ID 生成不可逆 `participant_key`。
- 活跃时间：仅在页面可见并且窗口有焦点时累积，使用 `performance.now()`，不使用墙上时间替代。
- 管理员：不进入产品行为事件；后台操作继续写 `admin_audit_logs`。

## 2. 北极星指标

**周有意义共鸣用户数（WRU）**：一周内至少有一次 `story_read_ended` 满足：

```text
meaningful_read = true
is_own_story = false
active_duration_ms >= 20000
```

按 `participant_key` 去重。故事面板打开但页面隐藏、窗口失焦或阅读自己的故事，都不计入 WRU。

## 3. 指标树

| 层级 | 指标           | 计算口径                                                |
| ---- | -------------- | ------------------------------------------------------- |
| 获客 | 首页访问用户   | `home_viewed` 参与者去重                                |
| 获客 | 注册成功率     | 注册成功 `auth_result` / 注册 `auth_attempted`          |
| 前测 | 前测同意率     | `pretest_consent_agreed` / 迁移后新注册普通账号         |
| 前测 | 前测完成率     | `pretest_submitted` / `pretest_consent_agreed`          |
| 激活 | 首次故事完成率 | 首次成功 `story_submit_result` / 注册成功用户           |
| 创作 | 有效输入时长   | `story_input_snapshot.title_active_ms + body_active_ms` |
| 创作 | 正文粘贴率     | `was_pasted=true` 的快照会话 / 全部快照会话             |
| 创作 | AI 整理成功率  | 成功 `story_analysis_result` / `story_analysis_started` |
| 创作 | AI 标签修改率  | 有 `ai_label_edited` 的故事 / 分析成功故事              |
| 发现 | 星空到达率     | `star_lobby_viewed` 用户 / 激活用户                     |
| 发现 | 星点点击率     | 去重星点点击 / 去重星点曝光                             |
| 搜索 | 无结果率       | `zero_results=true` 搜索 / 全部搜索                     |
| 阅读 | 有效阅读率     | `meaningful_read=true` / 全部 `story_read_ended`        |
| 共鸣 | 偏好修改率     | 有变化的共鸣确认 / 共鸣设置曝光                         |
| 引导 | 引导完成率     | `tour_completed` / `tour_started`                       |
| 后测 | 后测进入率     | `posttest_entry_clicked` 用户 / 需要后测且看到提醒用户  |
| 后测 | 后测完成率     | `posttest_submitted` 用户 / 需要后测的参与者            |
| 留存 | 次日、7 日留存 | 首次激活 cohort 后第 1/7 天再次出现行为事件             |

星点曝光唯一键：

```text
lobby_view_id + story_id + view_mode
```

同一推荐批次和同一视图中只曝光一次。共鸣确认并产生新推荐批次后生成新的 `lobby_view_id`，可再次曝光。

## 4. 优先级

- `P0`：核心创作、星点、搜索、阅读、反应和大厅共鸣行为。
- `P1`：首页、Icebreaker、AI 整理、标签修改、发布、首次共鸣和引导漏斗。
- `P2`：其余完整旅程与系统诊断事件。

前测人口统计答案和后测 41 道题的具体分值都不进入 `analytics_events`。新账号在点击同意前只发送匿名主页与认证事件；同意后才启用登录态产品埋点。

数据库与代码只允许 `P0`、`P1`、`P2`；不再使用 `P000`。

## 5. 看板

管理员后台“实验数据”默认查询最近 28 天，包含：

- 统一筛选：北京时间范围、完整登录账号、P0/P1/P2 与行为模块；提供 7/28/90 天快捷范围。
- 总览：活跃参与者、故事创作者、星空访客和有意义阅读用户。
- 创作、发现、阅读和引导：输入快照、粘贴率、有效输入时长、曝光、点击、搜索、阅读、反应和共鸣重排。
- 旅程：完整漏斗、每日实验活动、行为模块分布和事件明细分布。
- 搜索与导航：原始搜索词、无结果次数、底部导航点击和参与者数。
- 账号下钻：按 `profiles.username` 展示登录账号，点击后整页切换到该账号，并显示故事状态、组合筛选后的指标和最近 200 条行为时间线。

实验看板只呈现用户行为与研究指标，不展示前端加载耗时、接口延迟或机器资源等性能指标。系统健康仍由 QA 和运维检查负责，不混入实验结论。
