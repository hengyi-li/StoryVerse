# StoryVerse 后测问卷（posttest_v1）

## 资格与用户流程

只有满足以下条件的账号需要后测：

- 普通实验参与者（`profiles.role=user`）。
- 账号要求前测（`profiles.pretest_required=true`）。
- 已完成 `pretest_v1`。

管理员、系统种子账号、迁移前不需要前测的旧账号，以及尚未完成前测的账号均不进入后测。后测不会阻断 StarLobby。

```text
完成或跳过 StarLobby 新手引导
→ 显示可主动关闭的双语提醒
→ 右下角“问卷 / Questionnaire”入口持续带红点
→ /PostTest 五步填写
→ 提交后锁定答案并返回 /StarLobby
→ 入口变为完成状态，再次点击只显示感谢提示
```

关闭提醒或进入问卷后会由服务端保存 `reminder_dismissed_at`，因此刷新、重新登录或换设备都不会再次弹出提醒；问卷未完成时入口红点仍保留。

## 题项与分值

后测共 41 道必答题，所有中英文原文同时展示：

| 部分             | 稳定题项代码                            | 题数 |
| ---------------- | --------------------------------------- | ---- |
| 故事理解与沉浸   | `engagement_01`–`engagement_08`         | 8    |
| 公共叙事感知     | `publicness_01`–`publicness_10`         | 10   |
| 内容多样性与视角 | `diversity_01`–`diversity_07`           | 7    |
| 推荐体验         | `recommendation_01`–`recommendation_10` | 10   |
| 创作与 AI 体验   | `authorship_ai_01`–`authorship_ai_06`   | 6    |

每题只能保存整数 `1–5`：

- 1：非常不同意 / Strongly Disagree
- 2：不同意 / Disagree
- 3：既不同意也不反对 / Neither Agree nor Disagree
- 4：同意 / Agree
- 5：非常同意 / Strongly Agree

最后两道图片体验题同样必答，不提供“不适用”。客户端负责即时提示；Edge Function 和数据库约束都会再次校验题项代码、分值与完整性。

## 数据表与权限

表：`public.posttest_responses`，每个 `user_id` 最多一行。

| 字段                        | 说明                                        |
| --------------------------- | ------------------------------------------- |
| `user_id`                   | 参与者账号 UUID，唯一外键                   |
| `status`                    | `not_started` / `in_progress` / `completed` |
| `questionnaire_version`     | 固定 `posttest_v1`                          |
| `current_step`              | 1–5                                         |
| `answers`                   | 仅包含规定题项及 1–5 整数分值的 JSONB       |
| `reminder_dismissed_at`     | 用户关闭提醒或进入问卷的时间                |
| `submitted_at`              | 41 题完整提交时间                           |
| `created_at` / `updated_at` | 创建与最后更新时间                          |

- 普通参与者只能读取自己的记录，不能直接插入、修改或删除。
- 所有写入统一经过 `posttest` Edge Function。
- `completed` 记录由数据库触发器锁定，重复提交采用幂等返回。
- 管理员只能通过服务端查询和导出，不允许修改答案。

## 服务接口

Edge Function：`posttest`

```text
GET  /posttest
POST /posttest { action: "save", step, answers }
POST /posttest { action: "submit", answers }
POST /posttest { action: "dismiss_reminder" }
```

接口使用 Supabase JWT 识别账号，并从角色、前测门禁和前测终态计算后测资格。前端传入的资格声明不会被信任。

## 管理员与埋点

后台“后测数据 / Post-study”支持按账号、昵称、状态和提交时间筛选，查看双语题项答案，并导出带 UTF-8 BOM 的 CSV。CSV 使用稳定英文题项代码作为列名，每次导出写入 `admin_audit_logs`。

后测行为事件只记录版本、步骤、状态、耗时与回答数量。41 道题的具体分值只保存在 `posttest_responses`，不会复制到 `analytics_events`。
