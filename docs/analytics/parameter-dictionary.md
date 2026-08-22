# StoryVerse 埋点参数字典

## 1. 公共参数

| 参数                      | 类型                  | 生成方            | 说明                                         |
| ------------------------- | --------------------- | ----------------- | -------------------------------------------- |
| `event_id`                | UUID                  | 客户端            | 幂等键；重试不改变                           |
| `event_name`              | string                | 客户端/服务端校验 | 小写 snake_case                              |
| `event_version`           | integer               | 客户端/服务端固定 | 当前为 1                                     |
| `priority`                | P0/P1/P2              | 服务端            | 服务端按事件字典覆盖客户端值                 |
| `occurred_at`             | ISO time              | 客户端            | 实际发生时间，允许与服务器相差不超过 7 天    |
| `received_at`             | ISO time              | 服务端            | 入库时间                                     |
| `user_id`                 | UUID/null             | 服务端            | 从 JWT 解析；账号删除后置空                  |
| `participant_key`         | hex                   | 服务端            | HMAC(user ID 或 anonymous ID)，不可逆        |
| `anonymous_id`            | UUID                  | localStorage      | 同一浏览器长期稳定                           |
| `session_id`              | UUID                  | sessionStorage    | 新标签页或闲置 30 分钟后更新                 |
| `page_view_id`            | UUID                  | 客户端            | 每次进入语义页面更新                         |
| `lobby_view_id`           | UUID/null             | 客户端            | 进入大厅或共鸣刷新成功后更新                 |
| `recommendation_batch_id` | UUID/null             | 服务端推荐结果    | 当前推荐批次                                 |
| `page_id`                 | string                | App               | `home_intro`、`icebreaker`、`story_write` 等 |
| `route`                   | string                | 浏览器            | pathname + search，不含域名                  |
| `component`               | string/null           | 事件              | 可选语义组件名                               |
| `language`                | zh/en                 | App               | 事件发生时语言                               |
| `theme`                   | day/night             | App               | 事件发生时主题                               |
| `device_type`             | desktop/tablet/mobile | 客户端            | `<768`、`768–1099`、`≥1100`                  |
| `viewport`                | object                | 客户端            | 宽、高和 pixel ratio                         |
| `browser` / `os`          | string                | User-Agent 解析   | 粗粒度环境信息                               |
| `study_id`                | string                | 环境配置          | 默认 `storyverse_lab_v1`                     |
| `condition_id`            | string                | 环境配置          | 默认 `default`                               |
| `app_version`             | string                | 构建配置          | Git 短 SHA                                   |
| `environment`             | enum                  | 客户端            | local/preview/production/test                |
| `properties`              | JSON object           | 事件              | 私有参数                                     |

## 2. 核心私有参数

| 参数                                   | 适用事件  | 说明                                                               |
| -------------------------------------- | --------- | ------------------------------------------------------------------ |
| `story_id`                             | 故事相关  | 故事 UUID                                                          |
| `story_title`                          | 星点相关  | 曝光/点击时标题快照                                                |
| `rank`                                 | 推荐/星点 | 推荐批次排名；本人中心故事为空                                     |
| `scores`                               | 推荐/星点 | city/life/theme/semantic/final 分数快照                            |
| `view_mode`                            | 大厅      | explore/owned/resonance/liked                                      |
| `is_own_story`                         | 星点/阅读 | 是否为本人故事                                                     |
| `resonance_preferences`                | 大厅      | 当时 city/stage/theme 的 similar/different                         |
| `read_id`                              | 阅读      | 一次面板打开会话 UUID                                              |
| `active_duration_ms`                   | 阅读      | 可见且有焦点的累计时长                                             |
| `wall_duration_ms`                     | 写作/阅读 | 从开始到结束的自然时长                                             |
| `meaningful_read`                      | 阅读结束  | 非本人且有效时长 ≥20 秒                                            |
| `end_reason`                           | 阅读结束  | close_button/story_switched/view_changed/escape_key/page_unmounted |
| `raw_query`                            | 搜索      | 用户原始搜索词                                                     |
| `normalized_query`                     | 搜索      | trim + lower case 后搜索词                                         |
| `zero_results`                         | 搜索      | 是否无结果                                                         |
| `previous_preferences` / `preferences` | 共鸣      | 修改前后完整快照                                                   |
| `changed_dimensions`                   | 共鸣      | 实际变化的维度                                                     |
| `title` / `body`                       | 输入快照  | AI 整理前完整输入内容                                              |
| `title_active_ms` / `body_active_ms`   | 输入快照  | 各输入框有效输入时长                                               |
| `pasted_texts`                         | 输入快照  | 本次创作会话所有粘贴文本                                           |
| `ai_type_id` / `final_type_id`         | 标签修改  | AI 与用户最终类型                                                  |
| `ai_themes` / `final_themes`           | 标签修改  | AI 与用户最终主题                                                  |
| `questionnaire_version`                | 问卷事件  | `pretest_v1` 或 `posttest_v1`；不包含具体答案或分值                |
| `step`                                 | 问卷事件  | 前测 1–4；后测 1–5                                                 |
| `fields`                               | 前测校验  | 未通过的字段名数组，不含字段值                                     |
| `error_count`                          | 前测校验  | 当前校验错误数量                                                   |
| `answer_count` / `answered_count`      | 后测事件  | 已回答的题目数量，不包含题号与具体分值                             |
| `missing_count`                        | 后测校验  | 当前部分未回答题数，不包含具体题号                                 |
| `status`                               | 后测入口  | `not_started` / `in_progress` / `completed`                        |

## 3. 明确禁止

Edge Function 会递归拒绝键名包含以下敏感信息的事件：密码、确认密码、密保答案、Access/Refresh Token、Authorization、Cookie、API Key、secret、音频或录音。完整 IP 不入库；匿名限流仅保存 IP 与匿名 ID 的 HMAC 指纹。

本实验允许明文采集故事标题、正文、粘贴文本和搜索词。它们只保存在受管理员权限保护的 `properties` 中。

前测人口统计答案和后测题目分值是例外：分别只写入 `pretest_responses` 与 `posttest_responses`，不得复制到 `analytics_events.properties`。
