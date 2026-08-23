import type { Language } from "../types/domain";

type LocalizedMessage = { zh: string; en: string };

const messageByCode: Record<string, LocalizedMessage> = {
  ACCOUNT_EXISTS: { zh: "这个账号已经被使用。", en: "This username is already in use." },
  ACCOUNT_NOT_FOUND: { zh: "没有找到这个账号。", en: "This account could not be found." },
  ACCOUNT_SUSPENDED: { zh: "这个账号目前暂时无法使用。", en: "This account is currently unavailable." },
  ADMIN_REQUIRED: { zh: "这个账号没有管理员权限。", en: "This account does not have administrator access." },
  CANNOT_SUSPEND_SELF: { zh: "不能停用当前管理员账号。", en: "You cannot suspend the current admin account." },
  INVALID_ACCOUNT_STATUS: { zh: "请选择启用或停用账号。", en: "Choose whether to activate or suspend the account." },
  INVALID_CREDENTIALS: { zh: "账号或密码不正确。", en: "Incorrect username or password." },
  INVALID_DISPLAY_NAME: { zh: "昵称需要在 1–40 字之间。", en: "The nickname must be 1–40 characters." },
  INVALID_PASSWORD: { zh: "密码需要在 10–72 位之间。", en: "The password must be 10–72 characters." },
  INVALID_SECURITY_ANSWER: {
    zh: "找回密码答案需要在 2–80 字之间。",
    en: "The recovery answer must be 2–80 characters.",
  },
  INVALID_SECURITY_QUESTION: { zh: "请选择一个有效的找回密码问题。", en: "Choose a valid password recovery question." },
  INVALID_USERNAME: {
    zh: "账号需要使用 4–20 位字母、数字或下划线。",
    en: "Use 4–20 letters, numbers, or underscores for the username.",
  },
  PASSWORD_MISMATCH: { zh: "两次输入的密码不一致。", en: "The two passwords do not match." },
  RECOVERY_FAILED: {
    zh: "账号、找回密码问题或答案不正确。",
    en: "The username, recovery question, or answer is incorrect.",
  },
  UNAUTHENTICATED: { zh: "登录状态已失效，请重新登录。", en: "Please sign in again." },
  USERNAME_IMMUTABLE: {
    zh: "登录账号创建后不能直接修改。",
    en: "The login username cannot be changed after registration.",
  },

  AGE_REQUIRED: { zh: "请填写 1–120 之间的有效年龄。", en: "Enter a valid age from 1 to 120." },
  CITY_REQUIRED: { zh: "请填写城市。", en: "Enter a city." },
  CITY_COORDINATES_REQUIRED: {
    zh: "请从搜索结果中选择城市，确认地点坐标。",
    en: "Choose a city from the search results to confirm its coordinates.",
  },
  GENDER_REQUIRED: { zh: "请选择性别。", en: "Choose a gender option." },
  LIFE_STAGE_REQUIRED: { zh: "请选择当时所处的人生阶段。", en: "Choose the life stage at the time." },
  MOOD_REQUIRED: { zh: "请选择回想这段故事时的主要感受。", en: "Choose the main feeling this story brings up." },
  PEOPLE_REQUIRED: { zh: "请选择故事中的人物。", en: "Choose who appears in the story." },
  INVALID_COORDINATES: { zh: "城市坐标超出有效范围。", en: "The city coordinates are outside the valid range." },
  INVALID_STORY: { zh: "故事信息还不完整。", en: "The story details are incomplete." },
  INVALID_STORY_LENGTH: { zh: "故事正文需要在 100–1500 字之间。", en: "The story must be 100–1,500 characters." },
  INVALID_STORY_STATUS: {
    zh: "当前故事状态不支持这个操作。",
    en: "This action is not available for the story's current status.",
  },
  INVALID_STORY_TYPE: { zh: "请选择一个有效的故事类型。", en: "Choose a valid story type." },
  STORY_TYPE_DISABLED: {
    zh: "这个故事类型当前不可用，请重新选择。",
    en: "This story type is currently unavailable. Choose another one.",
  },
  INVALID_THEMES: { zh: "请确认两个不重复的故事主题。", en: "Confirm exactly two different story themes." },
  INVALID_THEME_LENGTH: {
    zh: "中文主题需要 2–6 字，英文主题最多 3 个词。",
    en: "Use 2–6 Chinese characters or up to 3 English words per theme.",
  },
  STORY_NOT_FOUND: {
    zh: "这篇故事不存在，或你没有查看权限。",
    en: "This story is unavailable or you do not have access to it.",
  },
  STORY_REQUIRED: { zh: "请选择一篇故事。", en: "Choose a story." },

  IMAGE_BLOCKED: {
    zh: "这篇故事正在等待内容确认，确认完成后即可生成图片。",
    en: "This story is awaiting content review. An image can be generated when review is complete.",
  },
  IMAGE_GENERATING: {
    zh: "这篇故事的图片正在生成，请稍后查看。",
    en: "The story image is being generated. Check again shortly.",
  },
  IMAGE_RATE_LIMIT: {
    zh: "每小时最多生成 5 张图片，请稍后再试。",
    en: "You can generate up to 5 images per hour. Try again later.",
  },
  INVALID_IMAGE_STYLE: { zh: "请选择一个有效的图片风格。", en: "Choose a valid image style." },

  INVALID_REACTION: { zh: "请选择喜欢、不喜欢或取消操作。", en: "Choose like, dislike, or clear the reaction." },
  SELF_REACTION_NOT_ALLOWED: {
    zh: "不能对自己的故事进行喜欢或不喜欢操作。",
    en: "You cannot like or dislike your own story.",
  },
  REPORT_REASON_REQUIRED: { zh: "请选择举报原因。", en: "Choose a reason for the report." },
  SELF_REPORT_NOT_ALLOWED: { zh: "不能举报自己的故事。", en: "You cannot report your own story." },
  INVALID_FEEDBACK: { zh: "反馈内容需要在 1–2000 字之间。", en: "Feedback must be 1–2,000 characters." },
  INVALID_STORY_IDS: { zh: "每次需要选择 1–5 篇故事。", en: "Select 1–5 stories at a time." },
  INVALID_TARGET_LANGUAGE: {
    zh: "请选择中文或英文作为翻译语言。",
    en: "Choose Chinese or English as the translation language.",
  },

  CONFIG_DRAFT_NOT_FOUND: { zh: "请先保存一个推荐配置草稿。", en: "Save a recommendation draft first." },
  INVALID_IMPORT: { zh: "每次请选择包含 1–500 条故事的 CSV。", en: "Choose a CSV containing 1–500 stories." },
  INVALID_REVIEW_DECISION: { zh: "请选择允许公开或需要修改。", en: "Choose approve or needs changes." },
  INVALID_TYPE: { zh: "没有找到这个故事类型。", en: "This story type could not be found." },
  INVALID_TYPE_ORDER: { zh: "类型顺序必须完整包含 21 个类型。", en: "The type order must include all 21 story types." },
  INVALID_TYPE_UPDATE: { zh: "没有可保存的类型变化。", en: "There are no type changes to save." },
  INVALID_WEIGHTS: { zh: "推荐权重不完整。", en: "The recommendation weights are incomplete." },
  INVALID_WEIGHT_TOTAL: {
    zh: "总分四项与人生分三项的权重必须分别加总为 1。",
    en: "Final-score and life-score weights must each add up to 1.",
  },
  LAST_TYPE_REQUIRED: { zh: "至少需要保留一个启用的故事类型。", en: "At least one story type must remain enabled." },
  REASON_REQUIRED: { zh: "请填写原因。", en: "Provide a reason." },
  REVIEW_NOT_FOUND: { zh: "没有找到这条内容确认任务。", en: "This review item could not be found." },
  SEED_STORY_NOT_FOUND: { zh: "没有找到这条冷启动故事。", en: "This seed story could not be found." },
  TASK_NOT_FAILED: { zh: "只有失败的 AI 任务可以重试。", en: "Only failed AI tasks can be retried." },
  TASK_NOT_FOUND: { zh: "没有找到这个任务。", en: "This task could not be found." },
  UNKNOWN_ACTION: { zh: "无法识别这个后台操作。", en: "This admin action is not recognised." },

  INVALID_JSON: { zh: "请求内容格式不正确。", en: "The request format is invalid." },
  METHOD_NOT_ALLOWED: { zh: "当前操作暂时不可用。", en: "This action is not available." },
  FUNCTION_ERROR: {
    zh: "服务暂时不可用，请稍后重试。",
    en: "The service is temporarily unavailable. Try again later.",
  },
  SESSION_ERROR: {
    zh: "登录状态没有保存成功，请重新登录。",
    en: "The sign-in session could not be saved. Please sign in again.",
  },
  PROFILE_UNAVAILABLE: { zh: "暂时无法读取账号资料。", en: "Account details are temporarily unavailable." },
  PROFILE_UPDATE_FAILED: { zh: "暂时无法保存账号资料。", en: "Account details could not be saved." },
  LOGOUT_FAILED: { zh: "暂时无法退出，请稍后重试。", en: "Could not sign out. Try again shortly." },
  DRAFT_UNAVAILABLE: { zh: "暂时无法读取草稿。", en: "The draft is temporarily unavailable." },
  DRAFT_CLEAR_FAILED: { zh: "暂时无法清除旧草稿。", en: "The previous draft could not be cleared." },
  STORIES_UNAVAILABLE: { zh: "暂时无法读取故事。", en: "Stories are temporarily unavailable." },
  STORY_TYPES_UNAVAILABLE: { zh: "暂时无法读取故事类型。", en: "Story types are temporarily unavailable." },
  RESONANCE_UNAVAILABLE: { zh: "暂时无法读取共鸣偏好。", en: "Preferences are temporarily unavailable." },
  RESONANCE_SAVE_FAILED: { zh: "暂时无法保存共鸣偏好。", en: "Preferences could not be saved." },
  REACTIONS_UNAVAILABLE: { zh: "暂时无法读取喜欢记录。", en: "Reactions are temporarily unavailable." },
  STORY_IMAGE_UNAVAILABLE: { zh: "暂时无法读取故事图片。", en: "The story image is temporarily unavailable." },
};

const speechMessageByKind: Record<string, LocalizedMessage> = {
  permission: {
    zh: "没有拿到麦克风权限。可以在浏览器地址栏右侧允许后重试。",
    en: "Microphone access is blocked. Allow it from the browser address bar, then try again.",
  },
  unsupported: {
    zh: "这个浏览器不支持语音输入，可以直接打字。",
    en: "This browser does not support voice input. You can type instead.",
  },
  network: {
    zh: "语音识别暂时不可用，可以重试，也可以直接打字。",
    en: "Voice recognition is temporarily unavailable. Try again, or type instead.",
  },
  empty: {
    zh: "这段录音里没有听到清晰的话，可以再录一次。",
    en: "No clear speech was detected. Try recording again.",
  },
};

export function localizedError(error: unknown, language: Language, fallback: LocalizedMessage) {
  const value = error as { code?: unknown; kind?: unknown } | null;
  const code = String(value?.code ?? "");
  const kind = String(value?.kind ?? "");
  return messageByCode[code]?.[language] ?? speechMessageByKind[kind]?.[language] ?? fallback[language];
}
