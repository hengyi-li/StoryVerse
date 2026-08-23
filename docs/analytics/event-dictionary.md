# StoryVerse 事件字典 v1

公共参数见 [parameter-dictionary.md](./parameter-dictionary.md)。“截图”编号对应 `screenshots/README.md`。

所有条目当前均为 `event_version=1`，公共参数均使用参数字典第 1 节；表中只列私有参数。客户端事件先经过 `src/lib/analytics.ts` 的队列、大小和发送策略，再由 `supabase/functions/analytics-track/index.ts` 完成身份、来源、优先级和敏感字段校验。未满足“触发与去重”条件时不得触发。

## P0

| 事件                              | 触发与去重                                    | 主要私有参数                                    | 截图   |
| --------------------------------- | --------------------------------------------- | ----------------------------------------------- | ------ |
| `story_write_viewed`              | 每次进入 StoryWrite                           | draft_id                                        | ANA-03 |
| `story_paste_detected`            | 正文 onPaste；每次粘贴一次                    | pasted_text、字符数、粘贴前长度                 | ANA-03 |
| `story_input_snapshot`            | 必填校验通过且点击 AI 整理；同一内容快照一次  | 完整标题/正文、输入时长、粘贴、语音、全部元数据 | ANA-03 |
| `star_lobby_viewed`               | StarLobby 挂载一次                            | 故事数、本人故事数、批次                        | ANA-08 |
| `star_exposed`                    | 相机内连续可见 1 秒；按 lobby+story+view 去重 | story、rank、scores、view、visible_ms           | ANA-08 |
| `star_clicked`                    | 点击星点打开故事                              | 曝光关系、距曝光时长、read_id                   | ANA-08 |
| `lobby_nav_clicked`               | 点击底部导航                                  | previous_view、view、changed                    | ANA-08 |
| `lobby_search_executed`           | 停止输入 800ms 且查询变化                     | raw/normalized query、结果数                    | ANA-08 |
| `lobby_search_cleared`            | 关闭有内容的搜索框                            | previous_query、结果数                          | ANA-08 |
| `story_read_started`              | 星点打开面板                                  | read_id、story、rank、scores                    | ANA-09 |
| `story_read_ended`                | 关闭/切换/离开/卸载                           | 有效与墙上时长、meaningful、end_reason          | ANA-09 |
| `story_reaction_clicked`          | 喜欢/不喜欢/取消                              | 前后 reaction、来源                             | ANA-09 |
| `story_reaction_result`           | 服务端反应请求结束                            | success、error_code                             | ANA-09 |
| `lobby_resonance_option_clicked`  | 大厅共鸣选择变化                              | dimension、前后模式、草稿偏好                   | ANA-10 |
| `lobby_resonance_confirm_clicked` | 共鸣确认                                      | 前后偏好、变化维度、旧批次                      | ANA-10 |
| `lobby_resonance_refresh_result`  | 推荐刷新结束                                  | 成功、耗时、新旧批次、故事数                    | ANA-10 |

## P1

| 事件                          | 触发与去重                     | 主要私有参数              | 截图   |
| ----------------------------- | ------------------------------ | ------------------------- | ------ |
| `home_viewed`                 | 每次进入主页 intro             | gateway_section           | ANA-01 |
| `icebreaker_viewed`           | 每次进入 Icebreaker            | —                         | ANA-02 |
| `ai_organize_clicked`         | 点击 AI 整理，包含无效尝试     | draft、body_length、valid | ANA-03 |
| `resonance_page_viewed`       | 进入首次共鸣页                 | —                         | ANA-06 |
| `ai_label_edited`             | 每次用户标签操作形成新标签集合 | AI/最终类型、主题、情感   | ANA-05 |
| `publish_clicked`             | 点击发布，包含校验失败         | story、长度、类型、主题   | ANA-05 |
| `resonance_dimension_clicked` | 首次共鸣页选择                 | dimension、前后模式       | ANA-06 |
| `tour_started`                | 每个引导场景挂载               | scene、步骤数             | ANA-11 |
| `tour_step_viewed`            | 每个步骤出现                   | scene、index、count       | ANA-11 |
| `tour_next_clicked`           | 下一步或完成                   | scene、index、is_last     | ANA-11 |
| `tour_back_clicked`           | 上一步                         | scene、index              | ANA-11 |
| `tour_skipped`                | 跳过或 Esc                     | scene、index、count       | ANA-11 |
| `tour_completed`              | 场景最后一步完成               | scene、count              | ANA-11 |

## P2

| 事件                                                              | 触发                                 | 主要私有参数                                | 截图      |
| ----------------------------------------------------------------- | ------------------------------------ | ------------------------------------------- | --------- |
| `home_cta_clicked` / `home_preview_opened`                        | 首页入口                             | target/source                               | ANA-01    |
| `auth_mode_changed` / `auth_attempted` / `auth_result`            | 登录注册                             | mode、success、非敏感 error_code            | ANA-01    |
| `password_recovery_started` / `password_recovery_result`          | 找回密码                             | success、error_code                         | ANA-01    |
| `language_changed` / `theme_changed`                              | 全站切换                             | previous/new                                | ANA-01    |
| `icebreaker_card_exposed` / `icebreaker_selected`                 | 卡片渲染/选择                        | guide、position                             | ANA-02    |
| `icebreaker_custom_input` / `icebreaker_continue_clicked`         | 自定义入口/继续                      | 文本、字符数、guide                         | ANA-02    |
| `story_field_focused`                                             | 标题、正文或城市聚焦                 | field                                       | ANA-03    |
| `story_metadata_changed`                                          | 情绪、阶段、年龄、性别、城市、人物   | fields、values                              | ANA-03    |
| `city_search_executed` / `city_selected`                          | 城市联想                             | query、结果、来源、坐标                     | ANA-03    |
| `voice_input_started` / `voice_input_ended`                       | 语音输入                             | success、插入字符数                         | ANA-03    |
| `focus_mode_changed`                                              | 专注模式开关                         | enabled                                     | ANA-03    |
| `story_validation_blocked`                                        | 校验阻止继续                         | step、missing_fields                        | ANA-03/05 |
| `story_back_clicked` / `story_autosaved`                          | 返回/自动保存                        | 步骤、draft、version、success               | ANA-03    |
| `story_analysis_started` / `story_analysis_result`                | AI 请求                              | attempt、duration、workflow、decision       | ANA-04    |
| `story_analysis_retry_clicked` / `moderation_routed`              | 重试/审核路由                        | attempt、decision、status                   | ANA-04    |
| `pending_review_lobby_entered`                                    | 待审用户进入大厅                     | story_id                                    | ANA-04    |
| `story_confirmation_viewed` / `story_body_edited`                 | 确认页                               | story、前后长度                             | ANA-05    |
| `story_label_editor_opened` / `story_custom_theme_added`          | 标签编辑                             | field/theme                                 | ANA-05    |
| `image_style_selected`                                            | 风格切换                             | previous/style                              | ANA-05    |
| `image_generation_started` / `image_generation_result`            | 图片生成                             | style、success、reused、error               | ANA-05    |
| `image_downloaded`                                                | StoryPage 成功下载图片               | story、style、source、file_name             | ANA-05    |
| `story_submit_result`                                             | 发布或转审核结果                     | success、status、story                      | ANA-05    |
| `resonance_confirm_clicked`                                       | 首次共鸣页确认；不计入大厅重排漏斗   | preferences、source                         | ANA-06    |
| `recommendation_page_viewed`                                      | 推荐页进入                           | —                                           | ANA-07    |
| `recommendation_card_exposed`                                     | 卡片可见 ≥50%                        | story、rank、batch、scores                  | ANA-07    |
| `recommendation_card_clicked`                                     | 卡片点击                             | story、rank、batch、scores                  | ANA-07    |
| `recommendation_refresh_clicked` / `recommendation_lobby_entered` | 换一批/进大厅                        | opened_story_count                          | ANA-07    |
| `lobby_search_opened`                                             | 搜索框展开                           | view                                        | ANA-08    |
| `lobby_gesture_summary`                                           | 离开大厅                             | wheel/rotate/zoom 次数、有效时长            | ANA-08    |
| `story_panel_closed`                                              | 关闭故事面板                         | story、reason                               | ANA-09    |
| `report_started` / `report_result`                                | 举报流程                             | story、reason、note_length、success         | ANA-12    |
| `account_opened` / `profile_update_result`                        | 个人中心                             | 修改种类、success                           | ANA-12    |
| `feedback_submitted`                                              | 反馈成功                             | character_count                             | ANA-12    |
| `notifications_opened`                                            | 打开收件箱                           | unread/count                                | ANA-12    |
| `logout_clicked`                                                  | 退出                                 | source                                      | ANA-12    |
| `pretest_consent_agreed`                                          | 第一步同意保存成功                   | questionnaire_version                       | ANA-13    |
| `pretest_step_viewed`                                             | 同意后进入任一问卷步骤               | questionnaire_version、step                 | ANA-13    |
| `pretest_validation_blocked`                                      | 前端校验阻止继续                     | step、fields、error_count                   | ANA-13    |
| `pretest_step_saved`                                              | 步骤草稿服务端保存成功               | questionnaire_version、step                 | ANA-13    |
| `pretest_submitted`                                               | 完整问卷锁定提交成功                 | questionnaire_version、step                 | ANA-13    |
| `posttest_reminder_shown`                                         | 合格用户完成或跳过大厅引导后首次显示 | questionnaire_version、status               | ANA-14    |
| `posttest_reminder_dismissed`                                     | 主动关闭提醒或进入问卷               | questionnaire_version、source               | ANA-14    |
| `posttest_entry_clicked`                                          | 点击大厅右下角问卷入口               | questionnaire_version、status               | ANA-14    |
| `posttest_step_viewed`                                            | 进入任一后测步骤                     | questionnaire_version、step、answered_count | ANA-14    |
| `posttest_validation_blocked`                                     | 当前部分存在未答题项                 | step、missing_count                         | ANA-14    |
| `posttest_step_saved`                                             | 当前部分服务端保存成功               | questionnaire_version、step、answer_count   | ANA-14    |
| `posttest_submitted`                                              | 41 题锁定提交成功                    | questionnaire_version、step、answer_count   | ANA-14    |
| `posttest_completed_button_clicked`                               | 已完成用户再次点击问卷按钮           | questionnaire_version、status               | ANA-14    |

## 不触发规则

- React 重渲染不算页面曝光；页面语义 ID 未变化时不重复。
- 星点可见不足 1 秒、页面隐藏或窗口失焦，不算曝光。
- 阅读面板打开但页面隐藏的时间不累积。
- 搜索为空、800ms 内继续输入、相同视图下相同规范化查询，不重复上报。
- 管理员角色的任何产品行为不入 `analytics_events`。
- 新账号点击同意前不发送登录态产品事件；拒绝只写 `pretest_responses`，不写行为事件。
- 具体前测答案不复制到埋点属性。
- 后测的具体题目分值不复制到埋点属性，只记录版本、步骤、状态、耗时和回答数量。
- 埋点失败不改变登录、保存、审核、推荐、反应、举报和发布结果。

## 指标、代码位置与 QA

下表与上方事件条目共同构成完整字典：事件的触发、去重、参数、截图来自上表；指标、实现入口和验收方式来自本表。

| 事件范围                                                                                                         | 对应指标                                   | 主要代码位置                                                                                     | QA 验证                                                            |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `story_write_viewed`、`story_paste_detected`、`story_input_snapshot`                                             | 创作会话、粘贴率、有效输入时长             | `src/app/App.tsx`、`src/features/story-editor/StoryEditor.tsx`                                   | `analytics-contract.test.ts`；完整 UI 旅程检查快照、正文和粘贴内容 |
| `star_lobby_viewed`、`star_exposed`、`star_clicked`                                                              | 星空到达率、曝光量、星点点击率             | `src/features/star-lobby/StarLobby.tsx`、`analytics-rules.ts`                                    | 999/1000ms 单测；UI 旅程验证真实曝光且唯一键无重复                 |
| `lobby_nav_clicked`、`lobby_search_*`                                                                            | 导航分布、搜索量、无结果率                 | `src/features/star-lobby/StarLobby.tsx`                                                          | 搜索规范化单测；UI 旅程验证 800ms 路径、清空和零结果               |
| `story_read_started`、`story_read_ended`、`story_panel_closed`                                                   | 打开率、有效阅读率、WRU、阅读时长          | `src/features/star-lobby/StarLobby.tsx`、`analytics-rules.ts`                                    | 19.999/20.000 秒与本人排除单测；UI 旅程阅读超过 20 秒              |
| `story_reaction_*`                                                                                               | 喜欢、不喜欢及请求成功率                   | `src/app/App.tsx`、`RecommendationsPage.tsx`、`StarLobby.tsx`                                    | UI 旅程验证点击与服务端成功；本人故事入口不可见                    |
| `lobby_resonance_*`                                                                                              | 大厅偏好修改率、重排成功率和耗时           | `src/features/star-lobby/StarLobby.tsx`                                                          | UI 旅程验证前后批次不同并允许重新曝光                              |
| `home_*`、`auth_*`、`password_recovery_*`                                                                        | 获客、注册、登录和找回漏斗                 | `src/app/App.tsx`、`src/features/gateway/Gateway.tsx`                                            | 线上合约验证匿名白名单/JWT；UI 旅程验证注册登录                    |
| `icebreaker_*`                                                                                                   | Icebreaker 到达、选择和继续率              | `src/app/App.tsx`、`StoryEditorFields.tsx`、`StoryEditor.tsx`                                    | UI 旅程逐步触发；截图 ANA-02 核对热点                              |
| `ai_organize_clicked`、`story_analysis_*`、`moderation_routed`                                                   | AI 整理成功率、失败率和人工审核比例        | `src/features/story-editor/StoryEditor.tsx`                                                      | 业务 E2E 验证成功分支；错误结果由数据质量看板聚合                  |
| `ai_label_edited`、`story_label_*`、`story_custom_theme_added`                                                   | AI 标签修改率                              | `src/features/story-editor/StoryEditor.tsx`                                                      | UI 旅程验证 AI 类型修改事件                                        |
| `publish_clicked`、`story_submit_result`、`pending_review_lobby_entered`                                         | 首次故事完成率、发布/待审漏斗              | `src/app/App.tsx`、`src/features/story-editor/StoryEditor.tsx`                                   | 业务 E2E 验证公开流程；本地脚本包含人工审核兜底分支                |
| `resonance_*`（不含 `lobby_` 前缀）                                                                              | 首次共鸣页漏斗                             | `src/features/resonance/ResonancePage.tsx`                                                       | UI 旅程验证页面、维度和首次确认；不计作大厅重排                    |
| `recommendation_*`                                                                                               | 推荐曝光、点击、刷新与大厅到达             | `src/features/recommendations/RecommendationsPage.tsx`                                           | UI 旅程验证推荐页到大厅路径                                        |
| `tour_*`                                                                                                         | 引导开始、步骤、完成和跳过率               | `src/features/tour/Tour.tsx`                                                                     | UI 旅程分别走完完成与跳过分支                                      |
| `image_*`                                                                                                        | 风格分布、生成成功率、复用与下载           | `src/features/story-editor/StoryEditor.tsx`                                                      | UI 旅程真实生成 2048×2048 图片；图片对象随后清理                   |
| `city_*`、`story_metadata_changed`、`story_field_focused`                                                        | 城市搜索、字段填写与写作操作               | `StoryEditorFields.tsx`、`StoryEditor.tsx`                                                       | UI 旅程验证北京搜索和选择                                          |
| `voice_input_*`、`focus_mode_changed`、`story_back_clicked`、`story_autosaved`                                   | 语音、专注、返回和保存行为                 | `src/features/story-editor/StoryEditor.tsx`、`src/app/App.tsx`                                   | 事件合约与页面热点人工检查；失败不阻塞业务                         |
| `language_changed`、`theme_changed`                                                                              | 语言和主题使用                             | `src/app/App.tsx` 及各页面切换入口                                                               | UI 旅程验证中英文切换；公共参数保存切换时状态                      |
| `report_*`、`account_*`、`profile_update_result`、`feedback_submitted`、`notifications_opened`、`logout_clicked` | 举报、账户、反馈、消息和退出               | `src/features/star-lobby/StarLobby.tsx`                                                          | UI 旅程验证举报、账户、反馈、收件箱和可靠退出上报                  |
| `pretest_*`                                                                                                      | 前测同意、步骤完成和最终提交漏斗           | `src/features/pretest/PreTestPage.tsx`、`src/app/App.tsx`、`pretest` Edge Function               | 条件分支、暂停埋点、草稿恢复、拒绝和提交 E2E                       |
| `posttest_*`                                                                                                     | 后测提醒、进入、步骤保存和完成漏斗         | `src/features/posttest/PostTestPage.tsx`、`StarLobby.tsx`、`posttest` Edge Function              | 资格判断、提醒状态、五步恢复、41 题提交和锁定 E2E                  |
| 全部事件                                                                                                         | 送达率、重复率、缺失参数、版本和业务一致性 | `analytics-track`、`202608200001_analytics.sql`、`202608200003_analytics_research_dashboard.sql` | 134 项前端/合约测试、78 项数据库测试、39 项后测真实接口 QA         |
