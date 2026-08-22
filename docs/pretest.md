# StoryVerse 前测问卷（pretest_v1）

## 用户流程

```text
注册 / 登录
→ 服务端查询前测门禁
→ /PreTest（仅迁移后新普通账号）
→ 同意并完成四步问卷
→ /StoryStart
```

- 迁移前账号、管理员和系统种子账号的 `profiles.pretest_required=false`，保持原流程。
- 新普通账号默认 `pretest_required=true`。未完成时，任何登录后业务路由都回到 `/PreTest`。
- 门禁接口不可用时失败关闭：不加载故事、推荐或大厅数据，只显示双语重试页。
- 同意后逐步保存草稿；刷新、换设备或重新登录后从 `current_step` 恢复。
- `completed` 和 `declined` 为终态。普通用户只能读取自己的记录，不能直接写表。
- 选择不同意后，人口统计字段全部为空，只保留账号关联、版本、状态和拒绝时间，并立即退出登录。

## 数据表

表：`public.pretest_responses`，每个 `user_id` 最多一行。

| 字段                                            | 说明                                                                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `user_id`                                       | 参与者账号 UUID，唯一外键                                                                                                        |
| `status`                                        | `in_progress` / `completed` / `declined`                                                                                         |
| `questionnaire_version`                         | 固定 `pretest_v1`                                                                                                                |
| `current_step`                                  | 1–4                                                                                                                              |
| `consented`                                     | 是否同意参与                                                                                                                     |
| `birth_year`                                    | 1900–2026                                                                                                                        |
| `gender`                                        | `male` / `female` / `other`                                                                                                      |
| `residence_region`                              | `china_mainland` / `hong_kong` / `macau` / `taiwan` / `overseas`                                                                 |
| `country_region`                                | 海外国家或地区自由文本                                                                                                           |
| `province` / `city`                             | 中国省市稳定拼音代码；港澳台两级均保存同名稳定代码                                                                               |
| `community_type`                                | `residents_committee` / `village_committee`                                                                                      |
| `ethnicity`                                     | 民族稳定拼音代码；非中国公民为 `not_chinese_citizen`                                                                             |
| `education`                                     | `less_than_primary` / `primary` / `junior_high` / `senior_high_vocational` / `associate` / `bachelor` / `postgraduate` / `other` |
| `education_other`                               | 仅 `education=other` 时存在                                                                                                      |
| `employment`                                    | `full_time` / `internship_part_time` / `freelancer` / `unemployed` / `student_unpaid`                                            |
| `industry_primary` / `industry_secondary`       | 仅全职、实习/兼职、自由职业者填写                                                                                                |
| `discipline` / `major`                          | 仅大专及以上且无工资收入学生填写                                                                                                 |
| `consented_at` / `submitted_at` / `declined_at` | 授权、提交、拒绝时间                                                                                                             |
| `created_at` / `updated_at`                     | 创建与最后更新                                                                                                                   |

所有选项在界面中同时展示中文和英文。省市使用规范罗马化地名，民族补齐英文名称；行业和学科沿用原问卷英文。前端与 Edge Function 由同一份问卷目录生成代码，服务端会校验省市、行业和专业的上下级组合。

## 服务接口

Edge Function：`pretest`

```text
GET  /pretest
POST /pretest { action: "save", step, answers }
POST /pretest { action: "submit", step: 4, answers }
POST /pretest { action: "decline" }
```

接口使用 Supabase JWT 识别用户。条件字段既在客户端即时清空，也由服务端再次校验；伪造的隐藏字段会被拒绝。

## 管理员

后台“前测数据 / Pre-study”支持：

- 按登录账号、状态和日期筛选。
- 点击账号查看双语标签形式的只读完整答案。
- 将当前筛选结果导出为带 UTF-8 BOM 的 CSV。
- CSV 使用本页列出的稳定英文列名与代码值。
- 每次导出写入 `admin_audit_logs`，不包含密码、密保答案、Token 或内部认证邮箱。

## 配图

- 原件：`src/assets/storyverse1.png`、`src/assets/storyverse2.png`。
- 页面使用 960px / 1600px 响应式 WebP，保留原始宽高比，不裁剪。
- 替代文本同时包含中文和英文。
