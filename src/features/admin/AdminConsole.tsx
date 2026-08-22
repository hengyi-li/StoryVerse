import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Bot,
  ChevronRight,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  Database,
  Download,
  FileText,
  Filter,
  Languages,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  MousePointerClick,
  Moon,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Tags,
  UploadCloud,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { dataService, type AdminDashboard } from "../../services/data-service";
import { AuthenticatedGreeting } from "../../components/AuthenticatedGreeting";
import { localizedError } from "../../lib/localized-error";
import type { Language, ModerationFlag, ReviewBucket, ReviewItem } from "../../types/domain";
import type { ThemeMode } from "../../types/ui";
import {
  communityOptions,
  educationOptions,
  employmentOptions,
  genderOptions,
  residenceOptions,
} from "../pretest/pretest-content";
import {
  chinaRegions,
  disciplineOptions,
  ethnicityOptions,
  industryOptions,
  type BilingualOption,
} from "../pretest/pretest-options.generated";
import { posttestItemIds, posttestSections } from "../posttest/posttest-content";
import "./admin.css";

type AdminView =
  | "overview"
  | "reviews"
  | "tasks"
  | "stories"
  | "accounts"
  | "feedback"
  | "analytics"
  | "pretest"
  | "posttest"
  | "types"
  | "algorithm"
  | "imports";

type ViewDefinition = {
  label: [string, string];
  description: [string, string];
  icon: LucideIcon;
};

const viewDefinitions: Record<AdminView, ViewDefinition> = {
  overview: {
    label: ["工作台总览", "Overview"],
    description: ["掌握待办、内容与系统运行状态", "Review priorities and system health"],
    icon: LayoutDashboard,
  },
  reviews: {
    label: ["人工审核", "Human review"],
    description: ["处理机审不确定和被举报的故事", "Handle uncertain and reported stories"],
    icon: ClipboardCheck,
  },
  tasks: {
    label: ["AI 任务", "AI tasks"],
    description: ["查看分析任务并重试失败项目", "Monitor and retry analysis tasks"],
    icon: Bot,
  },
  stories: {
    label: ["故事管理", "Stories"],
    description: ["检索、下架或恢复公开故事", "Find, remove or restore stories"],
    icon: BookOpen,
  },
  accounts: {
    label: ["账号管理", "Accounts"],
    description: ["维护用户账号状态与访问权限", "Manage account status and access"],
    icon: Users,
  },
  feedback: {
    label: ["用户反馈", "Feedback"],
    description: ["集中查看用户提交的意见", "Review user-submitted feedback"],
    icon: MessageSquareText,
  },
  analytics: {
    label: ["实验数据", "Experiment analytics"],
    description: ["查看创作、星空、阅读与共鸣指标", "Inspect creation, lobby, reading and resonance metrics"],
    icon: BarChart3,
  },
  pretest: {
    label: ["前测数据", "Pre-study"],
    description: ["按账号查看、筛选并导出前测问卷", "Inspect, filter and export pre-study responses"],
    icon: FileText,
  },
  posttest: {
    label: ["后测数据", "Post-study"],
    description: ["按账号查看、筛选并导出后测问卷", "Inspect, filter and export post-study responses"],
    icon: ClipboardCheck,
  },
  types: {
    label: ["类型与颜色", "Types & colours"],
    description: ["管理 21 种故事类型及星星颜色", "Manage story types and star colours"],
    icon: Tags,
  },
  algorithm: {
    label: ["推荐权重", "Recommendation"],
    description: ["保存并发布可追溯的公式版本", "Version and publish recommendation weights"],
    icon: Settings2,
  },
  imports: {
    label: ["冷启动故事", "Seed stories"],
    description: ["按模板导入已获授权的初始故事", "Import authorised stories from a template"],
    icon: Database,
  },
};

const navGroups: Array<{ label: [string, string]; views: AdminView[] }> = [
  { label: ["今日处理", "Today"], views: ["overview", "reviews", "tasks"] },
  { label: ["内容与用户", "Content & people"], views: ["stories", "accounts", "feedback"] },
  {
    label: ["实验与配置", "Experiment & system"],
    views: ["analytics", "pretest", "posttest", "types", "algorithm", "imports"],
  },
];

const csvHeaders = [
  "external_id",
  "title",
  "body",
  "age",
  "gender",
  "stage",
  "city",
  "latitude",
  "longitude",
  "mood",
  "people",
  "source_note",
  "skip_moderation",
] as const;
const requiredCsvHeaders = ["external_id", "body", "age", "gender", "stage", "city", "mood", "people"];

const seedFields: Array<{
  name: (typeof csvHeaders)[number];
  required: "yes" | "no" | "conditional";
  description: [string, string];
  example: string;
}> = [
  {
    name: "external_id",
    required: "yes",
    description: ["你为故事设置的唯一编号；重复编号会自动跳过", "Your unique story ID; duplicates are skipped"],
    example: "seed-0001",
  },
  {
    name: "title",
    required: "no",
    description: ["故事标题；留空时由 AI 提供建议标题", "Story title; AI suggests one when blank"],
    example: "离开家乡的那一天",
  },
  {
    name: "body",
    required: "yes",
    description: ["故事正文，去除首尾空格后 100–1500 字", "Story body, 100–1,500 characters after trimming"],
    example: "完整的故事正文……",
  },
  {
    name: "age",
    required: "yes",
    description: ["故事发生时的年龄，1–120 的整数", "Age when it happened, an integer from 1–120"],
    example: "24",
  },
  {
    name: "gender",
    required: "yes",
    description: ["只能填：男、女、其他", "Use one exact stored value: 男, 女, or 其他"],
    example: "女",
  },
  {
    name: "stage",
    required: "yes",
    description: [
      "只能填：学龄期、青春期、成年早期、成年中期、老年期",
      "Use one exact stored value: 学龄期, 青春期, 成年早期, 成年中期, or 老年期",
    ],
    example: "成年早期",
  },
  {
    name: "city",
    required: "yes",
    description: ["故事发生的城市；坐标留空时会自动查询", "Story city; coordinates are looked up when blank"],
    example: "上海",
  },
  {
    name: "latitude",
    required: "no",
    description: [
      "城市纬度；建议和 longitude 同时填写或同时留空",
      "City latitude; fill together with longitude or leave both blank",
    ],
    example: "31.2304",
  },
  {
    name: "longitude",
    required: "no",
    description: ["城市经度；留空时根据 city 自动查询", "City longitude; looked up from city when blank"],
    example: "121.4737",
  },
  {
    name: "mood",
    required: "yes",
    description: [
      "愤怒、担心、失落、愧疚、平和自足、开心幸福、爱、自信骄傲",
      "Use one exact stored value: 愤怒, 担心, 失落, 愧疚, 平和自足, 开心幸福, 爱, or 自信骄傲",
    ],
    example: "担心",
  },
  {
    name: "people",
    required: "yes",
    description: [
      "故事人物；多项用 | 分隔，可用：自己、家人、恋人、朋友、陌生人、老师、同事、宠物/动物、其他",
      "Separate multiple values with |; use 自己, 家人, 恋人, 朋友, 陌生人, 老师, 同事, 宠物/动物, or 其他",
    ],
    example: "自己|家人",
  },
  {
    name: "source_note",
    required: "conditional",
    description: [
      "授权或来源说明；跳过机审时必填，仅后台可见",
      "Authorisation/source note; required when moderation is skipped",
    ],
    example: "已取得作者公开授权",
  },
  {
    name: "skip_moderation",
    required: "no",
    description: [
      "默认 false；仅已人工确认安全且有授权来源时使用 true",
      "Defaults to false; use true only for verified, authorised content",
    ],
    example: "false",
  },
];

const emptyDashboard: AdminDashboard = {
  reviews: [],
  users: [],
  stories: [],
  tasks: [],
  feedback: [],
  types: [],
  configs: [],
  imports: [],
  failures: [],
  analytics: {},
};

function rowObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function reviewFromRow(row: Record<string, unknown>): ReviewItem {
  const story = rowObject(row.story);
  const author = rowObject(row.author);
  const reports = Array.isArray(row.reports) ? row.reports.map(rowObject) : [];
  const source = String(row.source ?? "moderation");
  const status = String(row.status ?? "pending");
  return {
    id: String(row.id),
    storyId: String(row.story_id ?? story.id ?? ""),
    title: String(story.title || story.ai_suggested_title || "未命名故事"),
    body: String(story.body ?? ""),
    tags: [
      ...(Array.isArray(story.final_themes) ? story.final_themes.map(String) : []),
      String(story.final_type_id || story.ai_type_id || ""),
    ].filter(Boolean),
    author: String(author.display_name || author.username || "匿名作者"),
    city: String(story.city ?? ""),
    createdAt: new Date(String(row.created_at)).getTime(),
    bucket: (source === "report" ? "reported" : source === "appeal" ? "appealed" : "uncertain") as ReviewBucket,
    status: status === "approved" ? "kept" : status === "needs_edit" ? "removed" : "pending",
    reportCount: reports.length,
    reportReasons: reports.map((report) => [report.reason, report.note].filter(Boolean).join("：")),
    flags: (Array.isArray(row.categories) ? row.categories.map(String) : []) as ModerationFlag[],
    appealNote: row.appeal_note ? String(row.appeal_note) : undefined,
    removalReason: row.decision_reason ? String(row.decision_reason) : undefined,
    hasBeenOpened: Boolean(row.has_been_opened) || status === "reviewing",
  };
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  const headers = (rows.shift() ?? []).map((header) => header.replace(/^\ufeff/, "").trim());
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])),
  );
}

function displayStatus(value: unknown, zh: boolean) {
  const status = String(value ?? "");
  const labels: Record<string, [string, string]> = {
    active: ["正常", "Active"],
    suspended: ["已停用", "Suspended"],
    published: ["已公开", "Published"],
    private: ["仅自己可见", "Private"],
    pending_review: ["待人工审核", "Pending review"],
    analyzing: ["AI 处理中", "Analysing"],
    needs_confirmation: ["待用户确认", "Needs confirmation"],
    needs_edit: ["需要修改", "Needs changes"],
    removed: ["已下架", "Removed"],
    queued: ["排队中", "Queued"],
    processing: ["处理中", "Processing"],
    completed: ["已完成", "Completed"],
    failed: ["失败", "Failed"],
    draft: ["草稿", "Draft"],
  };
  return labels[status]?.[zh ? 0 : 1] ?? (status || "—");
}

function StatusPill({ value, zh }: { value: unknown; zh: boolean }) {
  const status = String(value ?? "unknown");
  return <span className={`admin-status status-${status}`}>{displayStatus(status, zh)}</span>;
}

export function AdminConsole({
  language,
  themeMode,
  displayName,
  onLogout,
  onLanguageChange,
  onThemeModeChange,
}: {
  language: Language;
  themeMode: ThemeMode;
  displayName: string;
  onLogout: () => void;
  onLanguageChange: (language: Language) => void;
  onThemeModeChange: (theme: ThemeMode) => void;
}) {
  const zh = language === "zh";
  const [view, setView] = useState<AdminView>("overview");
  const [dashboard, setDashboard] = useState<AdminDashboard>(emptyDashboard);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [weights, setWeights] = useState<Record<string, number>>({
    city: 0.15,
    life: 0.25,
    theme: 0.25,
    semantic: 0.35,
    age: 0.5,
    stage: 0.3,
    gender: 0.2,
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const next = await dataService.getAdminDashboard();
      setDashboard(next);
      const savedWeights = rowObject(rowObject(next.configs[0]).weights);
      if (Object.keys(savedWeights).length) {
        setWeights((current) =>
          Object.fromEntries(Object.keys(current).map((key) => [key, Number(savedWeights[key] ?? current[key])])),
        );
      }
    } catch (cause) {
      setError(localizedError(cause, language, { zh: "无法读取后台数据。", en: "Could not load admin data." }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const run = async (task: () => Promise<unknown>, success: string) => {
    setError("");
    try {
      await task();
      if (success) setNotice(success);
      await load();
      if (success) window.setTimeout(() => setNotice(""), 2600);
      return true;
    } catch (cause) {
      setError(localizedError(cause, language, { zh: "操作失败。", en: "Action failed." }));
      return false;
    }
  };

  const reviews = useMemo(
    () => dashboard.reviews.map(reviewFromRow).filter((review) => review.status === "pending"),
    [dashboard.reviews],
  );
  const selected = reviews.find((review) => review.id === selectedId) ?? null;
  const failedTasks = dashboard.tasks.filter((row) => String(row.status) === "failed");
  const pendingStories = dashboard.stories.filter((row) =>
    ["analyzing", "pending_review", "needs_confirmation"].includes(String(row.status)),
  );
  const publishedStories = dashboard.stories.filter((row) => String(row.status) === "published");
  const activeUsers = dashboard.users.filter((row) => String(row.status) === "active");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (values: unknown[]) =>
    !normalizedQuery ||
    values.some((value) =>
      String(value ?? "")
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );

  const changeView = (next: AdminView) => {
    setView(next);
    setSelectedId(null);
    setQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openReview = (review: ReviewItem) => {
    setSelectedId(review.id);
    setReason("");
    if (!review.hasBeenOpened) void run(() => dataService.adminAction("review-open", { reviewId: review.id }), "");
  };

  const decide = (decision: "approved" | "needs_edit") => {
    if (!selected) return;
    if (decision === "needs_edit" && !reason.trim()) {
      setError(zh ? "请先填写需要修改的原因。" : "Please provide a reason.");
      return;
    }
    void run(
      () => dataService.adminAction("review-decide", { reviewId: selected.id, decision, reason: reason.trim() }),
      decision === "approved"
        ? zh
          ? "故事已允许公开。"
          : "Story approved."
        : zh
          ? "已通知作者修改。"
          : "Author notified.",
    ).then((completed) => completed && setSelectedId(null));
  };

  const importCsv = async (file: File) => {
    const rows = parseCsv(await file.text());
    if (!rows.length) throw new Error(zh ? "CSV 中没有可导入的数据。" : "The CSV contains no data rows.");
    if (rows.length > 500) throw new Error(zh ? "每次最多导入 500 条故事。" : "Import at most 500 stories at a time.");
    const headers = Object.keys(rows[0]);
    const missing = csvHeaders.filter((header) => !headers.includes(header));
    if (missing.length) {
      throw new Error(zh ? `CSV 缺少字段：${missing.join("、")}` : `Missing CSV columns: ${missing.join(", ")}`);
    }
    const invalidRow = rows.findIndex((row) => requiredCsvHeaders.some((header) => !String(row[header] ?? "").trim()));
    if (invalidRow >= 0) {
      throw new Error(
        zh
          ? `第 ${invalidRow + 2} 行缺少必填内容，请参照字段说明补充。`
          : `Row ${invalidRow + 2} is missing required values.`,
      );
    }
    await dataService.adminAction("seed-import", { filename: file.name, rows });
  };

  const downloadTemplate = () => {
    const blob = new Blob([`\ufeff${csvHeaders.join(",")}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "storyverse-seed-template.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const definition = viewDefinitions[view];
  const CurrentIcon = definition.icon;
  const searchBox = !(["analytics", "pretest", "posttest", "types", "algorithm", "imports"] as AdminView[]).includes(
    view,
  ) && (
    <label className="admin-search-box">
      <Search size={17} aria-hidden="true" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={zh ? "搜索当前列表" : "Search this list"}
        aria-label={zh ? "搜索当前列表" : "Search this list"}
      />
    </label>
  );

  return (
    <main className={`admin-page ${themeMode === "night" ? "theme-night" : ""}`}>
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <span className="admin-brand-mark">SV</span>
            <div>
              <span className="admin-wordmark">StoryVerse</span>
              <small>{zh ? "运营管理台" : "Operations"}</small>
            </div>
          </div>
          <nav className="admin-nav" aria-label={zh ? "后台功能" : "Admin sections"}>
            {navGroups.map((group) => (
              <div className="admin-nav-group" key={group.label[0]}>
                <span className="admin-nav-label">{group.label[zh ? 0 : 1]}</span>
                {group.views.map((key) => {
                  const item = viewDefinitions[key];
                  const Icon = item.icon;
                  const count = key === "reviews" ? reviews.length : key === "tasks" ? failedTasks.length : 0;
                  return (
                    <button
                      type="button"
                      key={key}
                      className={view === key ? "is-active" : ""}
                      onClick={() => changeView(key)}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <span>{item.label[zh ? 0 : 1]}</span>
                      {count > 0 && <i>{count}</i>}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="admin-sidebar-foot">
            <ShieldCheck size={17} aria-hidden="true" />
            <span>{zh ? "服务端管理员权限已验证" : "Server-side admin role verified"}</span>
          </div>
        </aside>

        <section className="admin-workspace">
          <header className="admin-topbar">
            <div className="admin-page-heading">
              <span className="admin-heading-icon">
                <CurrentIcon size={20} aria-hidden="true" />
              </span>
              <div>
                <h1>{definition.label[zh ? 0 : 1]}</h1>
                <p>{definition.description[zh ? 0 : 1]}</p>
              </div>
            </div>
            <div className="admin-topbar-actions">
              <button
                type="button"
                className="admin-icon-button"
                onClick={() => void load()}
                title={zh ? "刷新数据" : "Refresh"}
              >
                <RefreshCw size={17} />
                <span>{zh ? "刷新" : "Refresh"}</span>
              </button>
              <button
                type="button"
                className="admin-icon-button is-compact"
                onClick={() => onThemeModeChange(themeMode === "night" ? "day" : "night")}
                aria-label={zh ? "切换主题" : "Switch theme"}
              >
                {themeMode === "night" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                type="button"
                className="admin-icon-button is-compact"
                onClick={() => onLanguageChange(zh ? "en" : "zh")}
                aria-label={zh ? "切换语言" : "Switch language"}
              >
                <Languages size={18} />
              </button>
              <AuthenticatedGreeting displayName={displayName} language={language} />
              <button type="button" className="admin-icon-button is-danger" onClick={onLogout}>
                <LogOut size={17} />
                <span>{zh ? "退出" : "Log out"}</span>
              </button>
            </div>
          </header>

          <div className="admin-content">
            {error && (
              <div className="admin-alert is-error" role="alert">
                <AlertTriangle size={18} />
                <span>{error}</span>
              </div>
            )}
            {loading && (
              <div className="admin-loading">
                <span className="admin-spinner" />
                {zh ? "正在同步后台数据…" : "Syncing admin data…"}
              </div>
            )}

            {view === "overview" && !loading && (
              <div className="admin-overview">
                <section className="admin-welcome-card">
                  <div>
                    <span className="admin-eyebrow">{zh ? "今日工作台" : "TODAY"}</span>
                    <h2>{zh ? "先处理需要你判断的事情" : "Start with decisions that need you"}</h2>
                    <p>
                      {zh
                        ? "审核、失败任务和导入异常会集中显示在这里；没有异常时，无需逐页检查。"
                        : "Reviews, failed tasks and import exceptions are gathered here so you do not need to inspect every page."}
                    </p>
                  </div>
                  <Sparkles size={54} aria-hidden="true" />
                </section>
                <section className="admin-metric-grid" aria-label={zh ? "关键指标" : "Key metrics"}>
                  {[
                    {
                      label: zh ? "待人工审核" : "Pending reviews",
                      value: reviews.length,
                      icon: ClipboardCheck,
                      view: "reviews" as AdminView,
                      tone: "amber",
                    },
                    {
                      label: zh ? "失败 AI 任务" : "Failed AI tasks",
                      value: failedTasks.length,
                      icon: Bot,
                      view: "tasks" as AdminView,
                      tone: "rose",
                    },
                    {
                      label: zh ? "公开故事" : "Published stories",
                      value: publishedStories.length,
                      icon: BookOpen,
                      view: "stories" as AdminView,
                      tone: "teal",
                    },
                    {
                      label: zh ? "正常账号" : "Active accounts",
                      value: activeUsers.length,
                      icon: Users,
                      view: "accounts" as AdminView,
                      tone: "blue",
                    },
                  ].map((metric) => {
                    const Icon = metric.icon;
                    return (
                      <button
                        type="button"
                        className={`admin-metric tone-${metric.tone}`}
                        key={metric.label}
                        onClick={() => changeView(metric.view)}
                      >
                        <span className="admin-metric-icon">
                          <Icon size={20} />
                        </span>
                        <strong>{metric.value}</strong>
                        <span>{metric.label}</span>
                      </button>
                    );
                  })}
                </section>
                <section className="admin-overview-grid">
                  <article className="admin-panel admin-priority-panel">
                    <div className="admin-panel-heading">
                      <div>
                        <span className="admin-eyebrow">{zh ? "优先队列" : "PRIORITY QUEUE"}</span>
                        <h2>{zh ? "需要处理" : "Needs attention"}</h2>
                      </div>
                    </div>
                    <PriorityRow
                      icon={ClipboardCheck}
                      tone="amber"
                      label={zh ? "人工审核" : "Human review"}
                      note={zh ? `${reviews.length} 条等待判断` : `${reviews.length} waiting`}
                      count={reviews.length}
                      onClick={() => changeView("reviews")}
                    />
                    <PriorityRow
                      icon={Bot}
                      tone="rose"
                      label={zh ? "失败任务" : "Failed tasks"}
                      note={zh ? "可以检查错误并重新执行" : "Inspect and retry"}
                      count={failedTasks.length}
                      onClick={() => changeView("tasks")}
                    />
                    <PriorityRow
                      icon={Database}
                      tone="blue"
                      label={zh ? "导入失败行" : "Failed import rows"}
                      note={zh ? "修正字段后可单行重试" : "Fix and retry individual rows"}
                      count={dashboard.failures.length}
                      onClick={() => changeView("imports")}
                    />
                  </article>
                  <article className="admin-panel admin-system-panel">
                    <div className="admin-panel-heading">
                      <div>
                        <span className="admin-eyebrow">{zh ? "内容状态" : "CONTENT STATUS"}</span>
                        <h2>{zh ? "当前数据概况" : "Current snapshot"}</h2>
                      </div>
                    </div>
                    <dl className="admin-summary-list">
                      <div>
                        <dt>{zh ? "处理中或待确认" : "In progress"}</dt>
                        <dd>{pendingStories.length}</dd>
                      </div>
                      <div>
                        <dt>{zh ? "已配置故事类型" : "Configured types"}</dt>
                        <dd>{dashboard.types.length}</dd>
                      </div>
                      <div>
                        <dt>{zh ? "导入批次" : "Import batches"}</dt>
                        <dd>{dashboard.imports.length}</dd>
                      </div>
                      <div>
                        <dt>{zh ? "待查看反馈" : "Feedback items"}</dt>
                        <dd>{dashboard.feedback.length}</dd>
                      </div>
                    </dl>
                    <button type="button" className="admin-text-action" onClick={() => changeView("stories")}>
                      {zh ? "查看全部故事 →" : "View all stories →"}
                    </button>
                  </article>
                </section>
              </div>
            )}

            {view === "reviews" && !loading && (
              <section className="admin-review-layout">
                <div className="admin-panel admin-review-queue">
                  <div className="admin-panel-heading">
                    <div>
                      <span className="admin-eyebrow">{zh ? "待办" : "QUEUE"}</span>
                      <h2>{zh ? `${reviews.length} 条待审核` : `${reviews.length} pending`}</h2>
                    </div>
                  </div>
                  {!reviews.length && (
                    <Empty
                      icon={CheckCircle2}
                      title={zh ? "审核队列已清空" : "Review queue is clear"}
                      body={zh ? "目前没有需要人工判断的故事。" : "There are no stories requiring a decision."}
                    />
                  )}
                  <div className="admin-review-list">
                    {reviews.map((review) => (
                      <button
                        type="button"
                        key={review.id}
                        className={`admin-review-row ${selectedId === review.id ? "is-selected" : ""}`}
                        onClick={() => openReview(review)}
                      >
                        <ReviewSource value={review.bucket} zh={zh} />
                        <b>{review.title}</b>
                        <small>
                          {review.author} · {review.city || (zh ? "城市未知" : "Unknown city")}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
                <article className="admin-panel admin-review-detail">
                  {!selected ? (
                    <Empty
                      large
                      icon={FileText}
                      title={zh ? "选择一条故事开始审核" : "Select a story to begin"}
                      body={zh ? "左侧列表会保留你的当前位置。" : "Your place in the queue will be preserved."}
                    />
                  ) : (
                    <>
                      <header className="review-detail-head">
                        <div>
                          <ReviewSource value={selected.bucket} zh={zh} />
                          <h2>{selected.title}</h2>
                          <p>
                            {selected.author} · {selected.city || "—"}
                          </p>
                        </div>
                      </header>
                      <div className="review-story-body">{selected.body}</div>
                      {(Boolean(selected.flags?.length) || Boolean(selected.reportReasons?.length)) && (
                        <div className="review-signals">
                          {!!selected.flags?.length && (
                            <div>
                              <span>{zh ? "机审关注项" : "Machine signals"}</span>
                              <div>
                                {selected.flags.map((flag) => (
                                  <i className="is-warning" key={flag}>
                                    {flag}
                                  </i>
                                ))}
                              </div>
                            </div>
                          )}
                          {!!selected.reportReasons?.length && (
                            <div>
                              <span>{zh ? "举报说明" : "Report notes"}</span>
                              <div>
                                {selected.reportReasons.map((item, index) => (
                                  <i className="is-report" key={index}>
                                    {item}
                                  </i>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <label className="review-reason">
                        <span>{zh ? "需要修改时，给作者的说明" : "Message to the author when changes are needed"}</span>
                        <textarea
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder={
                            zh
                              ? "用温和、具体的语言说明需要调整的位置……"
                              : "Explain what needs to change in clear, considerate language…"
                          }
                        />
                      </label>
                      <footer className="review-actions">
                        <button
                          type="button"
                          className="admin-button is-secondary"
                          onClick={() => decide("needs_edit")}
                        >
                          {zh ? "需要修改" : "Needs changes"}
                        </button>
                        <button type="button" className="admin-button is-primary" onClick={() => decide("approved")}>
                          <CheckCircle2 size={17} />
                          {zh ? "允许公开" : "Approve"}
                        </button>
                      </footer>
                    </>
                  )}
                </article>
              </section>
            )}

            {!(["overview", "reviews"] as AdminView[]).includes(view) && !loading && (
              <section className="admin-management">
                {searchBox}
                {view === "accounts" &&
                  dashboard.users
                    .filter((row) => matches([row.username, row.display_name]))
                    .map((row) => <AccountRow key={String(row.id)} row={row} zh={zh} run={run} />)}
                {view === "stories" &&
                  dashboard.stories
                    .filter((row) => matches([row.title, row.body, row.city]))
                    .map((row) => <StoryRow key={String(row.id)} row={row} zh={zh} run={run} />)}
                {view === "tasks" &&
                  dashboard.tasks
                    .filter((row) => matches([row.task_type, row.status, row.last_error]))
                    .map((row) => <TaskRow key={String(row.id)} row={row} zh={zh} run={run} />)}
                {view === "feedback" &&
                  dashboard.feedback
                    .filter((row) => matches([row.text, row.category]))
                    .map((row) => <FeedbackRow key={String(row.id)} row={row} />)}
                {view === "analytics" && (
                  <AnalyticsPanel analytics={dashboard.analytics} accounts={dashboard.users} zh={zh} />
                )}
                {view === "pretest" && <PretestPanel zh={zh} />}
                {view === "posttest" && <PosttestPanel zh={zh} />}
                {view === "types" && <TypesPanel rows={dashboard.types} zh={zh} run={run} />}
                {view === "algorithm" && (
                  <AlgorithmPanel
                    rows={dashboard.configs}
                    weights={weights}
                    setWeights={setWeights}
                    zh={zh}
                    run={run}
                  />
                )}
                {view === "imports" && (
                  <ImportsPanel
                    dashboard={dashboard}
                    zh={zh}
                    run={run}
                    importCsv={importCsv}
                    downloadTemplate={downloadTemplate}
                    setError={setError}
                  />
                )}
              </section>
            )}
          </div>
        </section>
      </div>
      {notice && (
        <div className="admin-toast">
          <CheckCircle2 size={17} />
          {notice}
        </div>
      )}
    </main>
  );
}

type RunFunction = (task: () => Promise<unknown>, success: string) => Promise<boolean>;

function PriorityRow({
  icon: Icon,
  tone,
  label,
  note,
  count,
  onClick,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  note: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className="admin-priority-row" onClick={onClick}>
      <span className={`priority-icon is-${tone}`}>
        <Icon size={19} />
      </span>
      <span>
        <b>{label}</b>
        <small>{note}</small>
      </span>
      <strong>{count}</strong>
    </button>
  );
}

function Empty({
  icon: Icon,
  title,
  body,
  large = false,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  large?: boolean;
}) {
  return (
    <div className={`admin-empty ${large ? "is-large" : ""}`}>
      <Icon size={large ? 34 : 28} />
      <b>{title}</b>
      <span>{body}</span>
    </div>
  );
}

function ReviewSource({ value, zh }: { value: ReviewBucket; zh: boolean }) {
  const label =
    value === "reported"
      ? zh
        ? "被举报"
        : "Reported"
      : value === "appealed"
        ? zh
          ? "申诉"
          : "Appeal"
        : zh
          ? "机审不确定"
          : "Uncertain";
  return <span className={`admin-source-tag source-${value}`}>{label}</span>;
}

function AccountRow({ row, zh, run }: { row: Record<string, unknown>; zh: boolean; run: RunFunction }) {
  return (
    <article className="admin-data-row">
      <div className="admin-row-primary">
        <span className="admin-avatar">{String(row.display_name || row.username || "?").slice(0, 1)}</span>
        <div>
          <b>{String(row.display_name || (zh ? "未设置昵称" : "No display name"))}</b>
          <span>
            @{String(row.username)} · {String(row.role)}
          </span>
        </div>
      </div>
      <StatusPill value={row.status} zh={zh} />
      <div className="admin-row-actions">
        <button
          type="button"
          className="admin-button is-tertiary"
          onClick={() =>
            void run(
              () =>
                dataService.adminAction("account-status", {
                  profileId: row.id,
                  status: row.status === "active" ? "suspended" : "active",
                }),
              zh ? "账号状态已更新。" : "Account updated.",
            )
          }
        >
          {row.status === "active" ? (zh ? "停用" : "Suspend") : zh ? "恢复" : "Restore"}
        </button>
        <button
          type="button"
          className="admin-button is-tertiary"
          onClick={() => {
            const password = window.prompt(zh ? "输入 10–72 位临时密码" : "Enter a 10–72 character temporary password");
            if (password)
              void run(
                () => dataService.adminAction("account-reset-password", { profileId: row.id, password }),
                zh ? "密码已重置。" : "Password reset.",
              );
          }}
        >
          {zh ? "重置密码" : "Reset password"}
        </button>
      </div>
    </article>
  );
}

function StoryRow({ row, zh, run }: { row: Record<string, unknown>; zh: boolean; run: RunFunction }) {
  return (
    <article className="admin-data-row is-story">
      <div className="admin-row-primary">
        <span className="admin-row-icon">
          <BookOpen size={18} />
        </span>
        <div>
          <b>{String(row.title || row.ai_suggested_title || (zh ? "未命名故事" : "Untitled story"))}</b>
          <span>
            {String(row.city || (zh ? "城市未知" : "Unknown city"))} ·{" "}
            {row.source_kind === "seed" ? (zh ? "冷启动故事" : "Seed story") : zh ? "用户故事" : "User story"}
          </span>
          <small>{String(row.body).slice(0, 120)}</small>
        </div>
      </div>
      <StatusPill value={row.status} zh={zh} />
      <div className="admin-row-actions">
        {row.source_kind === "seed" && (
          <button
            type="button"
            className="admin-button is-tertiary"
            onClick={() => {
              const title = window.prompt(zh ? "修改标题" : "Edit title", String(row.title ?? ""));
              if (title === null) return;
              const body = window.prompt(
                zh ? "修改正文（100–1500 字）" : "Edit body (100–1,500 characters)",
                String(row.body ?? ""),
              );
              if (body === null) return;
              void run(
                () => dataService.adminAction("seed-update", { storyId: row.id, title, body }),
                zh ? "冷启动故事已保存并重新入队。" : "Seed story saved and requeued.",
              );
            }}
          >
            {zh ? "编辑" : "Edit"}
          </button>
        )}
        <button
          type="button"
          className="admin-button is-tertiary"
          onClick={() => {
            const restoring = row.status === "removed";
            const removalReason = restoring
              ? ""
              : window.prompt(zh ? "填写下架原因（会通知作者）" : "Removal reason sent to the author");
            if (!restoring && !removalReason?.trim()) return;
            void run(
              () =>
                dataService.adminAction("story-status", {
                  storyId: row.id,
                  status: restoring ? "published" : "removed",
                  reason: removalReason?.trim() ?? "",
                }),
              zh ? "故事状态已更新。" : "Story updated.",
            );
          }}
        >
          {row.status === "removed" ? (zh ? "恢复公开" : "Restore") : zh ? "下架" : "Remove"}
        </button>
      </div>
    </article>
  );
}

function TaskRow({ row, zh, run }: { row: Record<string, unknown>; zh: boolean; run: RunFunction }) {
  return (
    <article className="admin-data-row">
      <div className="admin-row-primary">
        <span className="admin-row-icon">
          <Bot size={18} />
        </span>
        <div>
          <b>{String(row.task_type)}</b>
          <span>
            {zh ? "故事 ID" : "Story ID"}: {String(row.story_id ?? "—")}
          </span>
          {Boolean(row.last_error) && <small className="is-error-text">{String(row.last_error)}</small>}
        </div>
      </div>
      <StatusPill value={row.status} zh={zh} />
      {row.status === "failed" && (
        <button
          type="button"
          className="admin-button is-tertiary"
          onClick={() =>
            void run(
              () => dataService.adminAction("task-retry", { taskId: row.id }),
              zh ? "已重新执行任务。" : "Task retried.",
            )
          }
        >
          {zh ? "重新执行" : "Retry"}
        </button>
      )}
    </article>
  );
}

function FeedbackRow({ row }: { row: Record<string, unknown> }) {
  const profile = rowObject(row.profile);
  return (
    <article className="admin-data-row is-feedback">
      <div className="admin-row-primary">
        <span className="admin-row-icon">
          <MessageSquareText size={18} />
        </span>
        <div>
          <b>{String(profile.display_name || profile.username || "匿名用户")}</b>
          <span>{String(row.category)}</span>
          <small>{String(row.text)}</small>
        </div>
      </div>
    </article>
  );
}

function TypesPanel({ rows, zh, run }: { rows: Array<Record<string, unknown>>; zh: boolean; run: RunFunction }) {
  return (
    <div className="admin-panel admin-type-panel">
      <div className="admin-panel-heading">
        <div>
          <span className="admin-eyebrow">21 TYPES</span>
          <h2>{zh ? "星空类型配置" : "Star type settings"}</h2>
          <p>
            {zh
              ? "颜色用于星空中的星点；已被故事使用的类型请停用，不要删除。"
              : "Colours are used for stars. Disable types in use rather than deleting them."}
          </p>
        </div>
      </div>
      <div className="admin-type-list">
        {rows.map((row, index) => (
          <article className="admin-type-row" key={String(row.id)}>
            <span className="admin-type-swatch" style={{ backgroundColor: String(row.color) }} />
            <div>
              <b>{zh ? String(row.label_zh) : String(row.label_en)}</b>
              <span>{String(row.id)}</span>
            </div>
            <span className="admin-type-order">#{String(row.sort_order)}</span>
            <input
              type="color"
              aria-label={zh ? "修改颜色" : "Change colour"}
              defaultValue={String(row.color)}
              onBlur={(event) =>
                void run(
                  () => dataService.adminAction("type-update", { typeId: row.id, color: event.currentTarget.value }),
                  zh ? "类型颜色已保存。" : "Colour saved.",
                )
              }
            />
            <div className="admin-row-actions">
              <button
                type="button"
                className="admin-square-button"
                aria-label={zh ? "上移" : "Move up"}
                disabled={index === 0}
                onClick={() => {
                  const ids = rows.map((type) => String(type.id));
                  [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                  void run(
                    () => dataService.adminAction("types-reorder", { orderedIds: ids }),
                    zh ? "类型顺序已保存。" : "Order saved.",
                  );
                }}
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className="admin-square-button"
                aria-label={zh ? "下移" : "Move down"}
                disabled={index === rows.length - 1}
                onClick={() => {
                  const ids = rows.map((type) => String(type.id));
                  [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
                  void run(
                    () => dataService.adminAction("types-reorder", { orderedIds: ids }),
                    zh ? "类型顺序已保存。" : "Order saved.",
                  );
                }}
              >
                <ArrowDown size={16} />
              </button>
              <button
                type="button"
                className="admin-button is-tertiary"
                onClick={() =>
                  void run(
                    () => dataService.adminAction("type-update", { typeId: row.id, enabled: !row.enabled }),
                    zh ? "类型状态已保存。" : "Type updated.",
                  )
                }
              >
                {row.enabled ? (zh ? "停用" : "Disable") : zh ? "启用" : "Enable"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function AlgorithmPanel({
  rows,
  weights,
  setWeights,
  zh,
  run,
}: {
  rows: Array<Record<string, unknown>>;
  weights: Record<string, number>;
  setWeights: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  zh: boolean;
  run: RunFunction;
}) {
  const scoreLabels: Record<string, string> = {
    city: zh ? "城市" : "City",
    life: zh ? "人生" : "Life",
    theme: zh ? "主题" : "Theme",
    semantic: zh ? "全文语义" : "Semantic",
    age: zh ? "年龄" : "Age",
    stage: zh ? "人生阶段" : "Life stage",
    gender: zh ? "性别" : "Gender",
  };
  const weightGroup = (keys: string[]) => (
    <div className="admin-weight-grid">
      {keys.map((key) => (
        <label key={key}>
          <span>{scoreLabels[key]}</span>
          <div>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={weights[key]}
              onChange={(event) => setWeights((current) => ({ ...current, [key]: Number(event.target.value) }))}
            />
            <em>{Math.round(weights[key] * 100)}%</em>
          </div>
        </label>
      ))}
    </div>
  );
  return (
    <article className="admin-panel admin-config-panel">
      <div className="admin-panel-heading">
        <div>
          <span className="admin-eyebrow">{zh ? "版本化配置" : "VERSIONED CONFIG"}</span>
          <h2>{zh ? "推荐公式权重" : "Recommendation weights"}</h2>
          <p>
            {zh
              ? "总分四项与人生分三项必须分别加总为 1。先保存草稿，再发布新版本；历史推荐不会被改写。"
              : "Each weight group must total 1. Save a draft, then publish a new version; historical results remain unchanged."}
          </p>
        </div>
        <StatusPill value={rows[0]?.status ?? "draft"} zh={zh} />
      </div>
      <div className="admin-weight-sections">
        <div>
          <h3>{zh ? "总分权重" : "Final score"}</h3>
          {weightGroup(["city", "life", "theme", "semantic"])}
        </div>
        <div>
          <h3>{zh ? "人生分内部权重" : "Life score"}</h3>
          {weightGroup(["age", "stage", "gender"])}
        </div>
      </div>
      <footer className="admin-config-actions">
        <button
          type="button"
          className="admin-button is-secondary"
          onClick={() =>
            void run(
              () => dataService.adminAction("config-save-draft", { weights }),
              zh ? "推荐配置草稿已保存。" : "Draft saved.",
            )
          }
        >
          {zh ? "保存草稿" : "Save draft"}
        </button>
        <button
          type="button"
          className="admin-button is-primary"
          disabled={String(rows[0]?.status) !== "draft"}
          onClick={() =>
            void run(
              () => dataService.adminAction("config-publish", { configId: rows[0]?.id }),
              zh ? "新的权重版本已发布。" : "New weights published.",
            )
          }
        >
          {zh ? "发布最新草稿" : "Publish latest draft"}
        </button>
      </footer>
    </article>
  );
}

type PretestFilters = { account: string; status: string; start: string; end: string };

const pretestCsvFields = [
  "user_id",
  "username",
  "display_name",
  "status",
  "current_step",
  "questionnaire_version",
  "consented",
  "birth_year",
  "gender",
  "residence_region",
  "country_region",
  "province",
  "city",
  "community_type",
  "ethnicity",
  "education",
  "education_other",
  "employment",
  "industry_primary",
  "industry_secondary",
  "discipline",
  "major",
  "consented_at",
  "submitted_at",
  "declined_at",
  "account_created_at",
] as const;

function pretestOptionMap() {
  const map = new Map<string, BilingualOption>();
  const add = (options: BilingualOption[]) => options.forEach((option) => map.set(option.value, option));
  add(genderOptions);
  add(residenceOptions);
  add(communityOptions);
  add(educationOptions);
  add(employmentOptions);
  add(ethnicityOptions);
  for (const groups of [chinaRegions, industryOptions, disciplineOptions]) {
    groups.forEach((group) => {
      map.set(group.value, group);
      add(group.children);
    });
  }
  return map;
}

const pretestOptionsByCode = pretestOptionMap();

function pretestStatusLabel(status: unknown, zh: boolean) {
  const labels: Record<string, [string, string]> = {
    not_required: ["无需填写", "Not required"],
    not_started: ["未开始", "Not started"],
    in_progress: ["填写中", "In progress"],
    completed: ["已完成", "Completed"],
    declined: ["已拒绝", "Declined"],
  };
  return labels[String(status)]?.[zh ? 0 : 1] ?? String(status || "—");
}

function pretestAnswer(value: unknown) {
  if (value == null || value === "") return "—";
  const option = pretestOptionsByCode.get(String(value));
  return option ? `${option.labelZh} / ${option.labelEn}` : String(value);
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function PretestPanel({ zh }: { zh: boolean }) {
  const [filters, setFilters] = useState<PretestFilters>({ account: "", status: "", start: "", end: "" });
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const queryInput = () => ({
    ...filters,
    start: filters.start ? `${filters.start}T00:00:00.000Z` : "",
    end: filters.end ? `${filters.end}T23:59:59.999Z` : "",
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await dataService.adminAction<{ responses: Array<Record<string, unknown>> }>(
        "pretest-query",
        queryInput(),
      );
      setRows(result.responses);
      setSelectedId((current) =>
        current && result.responses.some((row) => String(row.user_id) === current) ? current : "",
      );
    } catch (cause) {
      setError(
        localizedError(cause, zh ? "zh" : "en", { zh: "无法读取前测数据。", en: "Could not load pre-study data." }),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const exportCsv = async () => {
    setExporting(true);
    setError("");
    try {
      const result = await dataService.adminAction<{ responses: Array<Record<string, unknown>> }>(
        "pretest-export",
        queryInput(),
      );
      const csv = [
        pretestCsvFields.join(","),
        ...result.responses.map((row) => pretestCsvFields.map((field) => csvCell(row[field])).join(",")),
      ].join("\r\n");
      const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `storyverse-pretest-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(localizedError(cause, zh ? "zh" : "en", { zh: "导出失败。", en: "Export failed." }));
    } finally {
      setExporting(false);
    }
  };

  const selected = rows.find((row) => String(row.user_id) === selectedId) ?? null;
  const answerFields: Array<{ key: string; label: [string, string] }> = [
    { key: "birth_year", label: ["出生年份", "Birth year"] },
    { key: "gender", label: ["性别", "Gender"] },
    { key: "residence_region", label: ["常住地区", "Residence"] },
    { key: "country_region", label: ["国家 / 地区", "Country / region"] },
    { key: "province", label: ["省级地区", "Province-level region"] },
    { key: "city", label: ["城市", "City"] },
    { key: "community_type", label: ["社区类型", "Community type"] },
    { key: "ethnicity", label: ["民族", "Ethnicity"] },
    { key: "education", label: ["最高学历", "Education"] },
    { key: "education_other", label: ["其他学历", "Other education"] },
    { key: "employment", label: ["工作状态", "Employment"] },
    { key: "industry_primary", label: ["一级行业", "Primary industry"] },
    { key: "industry_secondary", label: ["二级行业", "Secondary industry"] },
    { key: "discipline", label: ["学科", "Discipline"] },
    { key: "major", label: ["专业", "Major"] },
  ];

  return (
    <div className="admin-pretest-panel">
      <section className="admin-panel admin-pretest-toolbar">
        <div className="admin-panel-heading">
          <div>
            <span className="admin-eyebrow">PRE-STUDY · PRETEST_V1</span>
            <h2>{zh ? "参与者前测" : "Participant pre-study"}</h2>
            <p>{zh ? "按登录账号筛选；问卷答案只读。" : "Filter by login account. Responses are read-only."}</p>
          </div>
          <button
            type="button"
            className="admin-button is-primary"
            onClick={() => void exportCsv()}
            disabled={exporting}
          >
            <Download size={16} />{" "}
            {exporting ? (zh ? "导出中…" : "Exporting…") : zh ? "导出当前结果" : "Export current results"}
          </button>
        </div>
        <div className="admin-pretest-filters">
          <label>
            <span>{zh ? "登录账号" : "Login account"}</span>
            <input
              value={filters.account}
              onChange={(event) => setFilters((current) => ({ ...current, account: event.target.value }))}
              placeholder={zh ? "输入账号关键词" : "Account keyword"}
            />
          </label>
          <label>
            <span>{zh ? "状态" : "Status"}</span>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="">{zh ? "全部状态" : "All statuses"}</option>
              {["not_required", "not_started", "in_progress", "completed", "declined"].map((status) => (
                <option key={status} value={status}>
                  {pretestStatusLabel(status, zh)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{zh ? "开始日期" : "Start date"}</span>
            <input
              type="date"
              value={filters.start}
              onChange={(event) => setFilters((current) => ({ ...current, start: event.target.value }))}
            />
          </label>
          <label>
            <span>{zh ? "结束日期" : "End date"}</span>
            <input
              type="date"
              value={filters.end}
              onChange={(event) => setFilters((current) => ({ ...current, end: event.target.value }))}
            />
          </label>
          <button type="button" className="admin-button is-secondary" onClick={() => void load()} disabled={loading}>
            <Filter size={16} /> {zh ? "应用筛选" : "Apply filters"}
          </button>
        </div>
        {error && (
          <div className="admin-alert is-error">
            <AlertTriangle size={17} />
            {error}
          </div>
        )}
      </section>

      <div className="admin-pretest-grid">
        <section className="admin-panel admin-pretest-list">
          <header>
            <b>{zh ? `${rows.length} 个账号` : `${rows.length} accounts`}</b>
            {loading && <span className="admin-spinner" />}
          </header>
          {!loading && !rows.length && (
            <Empty
              icon={FileText}
              title={zh ? "没有匹配结果" : "No matching results"}
              body={zh ? "调整筛选条件后重试。" : "Try different filters."}
            />
          )}
          {rows.map((row) => (
            <button
              type="button"
              key={String(row.user_id)}
              className={selectedId === String(row.user_id) ? "is-selected" : ""}
              onClick={() => setSelectedId(String(row.user_id))}
            >
              <span className="admin-avatar">{String(row.display_name || row.username || "?").slice(0, 1)}</span>
              <span>
                <b>@{String(row.username)}</b>
                <small>{String(row.display_name || "—")}</small>
              </span>
              <i className={`admin-status status-${String(row.status)}`}>{pretestStatusLabel(row.status, zh)}</i>
              <ChevronRight size={16} />
            </button>
          ))}
        </section>

        <section className="admin-panel admin-pretest-detail">
          {!selected ? (
            <Empty
              large
              icon={UserRound}
              title={zh ? "选择一个账号" : "Select an account"}
              body={zh ? "查看该参与者的前测状态和完整答案。" : "View pre-study status and complete answers."}
            />
          ) : (
            <>
              <header>
                <div>
                  <span className="admin-eyebrow">@{String(selected.username)}</span>
                  <h2>{String(selected.display_name || "—")}</h2>
                </div>
                <span className={`admin-status status-${String(selected.status)}`}>
                  {pretestStatusLabel(selected.status, zh)}
                </span>
              </header>
              <dl className="admin-pretest-meta">
                <div>
                  <dt>{zh ? "当前步骤" : "Current step"}</dt>
                  <dd>{String(selected.current_step ?? "—")} / 4</dd>
                </div>
                <div>
                  <dt>{zh ? "提交时间" : "Submitted"}</dt>
                  <dd>{selected.submitted_at ? new Date(String(selected.submitted_at)).toLocaleString() : "—"}</dd>
                </div>
                <div>
                  <dt>{zh ? "拒绝时间" : "Declined"}</dt>
                  <dd>{selected.declined_at ? new Date(String(selected.declined_at)).toLocaleString() : "—"}</dd>
                </div>
                <div>
                  <dt>{zh ? "问卷版本" : "Version"}</dt>
                  <dd>{String(selected.questionnaire_version || "—")}</dd>
                </div>
              </dl>
              <div className="admin-pretest-answers">
                {answerFields.map((field) => (
                  <div key={field.key}>
                    <span>
                      {field.label[0]}
                      <small>{field.label[1]}</small>
                    </span>
                    <b>{pretestAnswer(selected[field.key])}</b>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

type PosttestFilters = { account: string; status: string; start: string; end: string };

const posttestCsvFields = [
  "user_id",
  "username",
  "display_name",
  "status",
  "current_step",
  "questionnaire_version",
  ...posttestItemIds,
  "reminder_dismissed_at",
  "submitted_at",
  "account_created_at",
] as const;

function posttestStatusLabel(status: unknown, zh: boolean) {
  const labels: Record<string, [string, string]> = {
    not_required: ["无需填写", "Not required"],
    not_started: ["未开始", "Not started"],
    in_progress: ["填写中", "In progress"],
    completed: ["已完成", "Completed"],
  };
  return labels[String(status)]?.[zh ? 0 : 1] ?? String(status || "—");
}

function PosttestPanel({ zh }: { zh: boolean }) {
  const [filters, setFilters] = useState<PosttestFilters>({ account: "", status: "", start: "", end: "" });
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const queryInput = () => ({
    ...filters,
    start: filters.start ? `${filters.start}T00:00:00.000Z` : "",
    end: filters.end ? `${filters.end}T23:59:59.999Z` : "",
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await dataService.adminAction<{ responses: Array<Record<string, unknown>> }>(
        "posttest-query",
        queryInput(),
      );
      setRows(result.responses);
      setSelectedId((current) =>
        current && result.responses.some((row) => String(row.user_id) === current) ? current : "",
      );
    } catch (cause) {
      setError(
        localizedError(cause, zh ? "zh" : "en", {
          zh: "无法读取后测数据。",
          en: "Could not load post-study data.",
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const exportCsv = async () => {
    setExporting(true);
    setError("");
    try {
      const result = await dataService.adminAction<{ responses: Array<Record<string, unknown>> }>(
        "posttest-export",
        queryInput(),
      );
      const csv = [
        posttestCsvFields.join(","),
        ...result.responses.map((row) => posttestCsvFields.map((field) => csvCell(row[field])).join(",")),
      ].join("\r\n");
      const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `storyverse-posttest-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(localizedError(cause, zh ? "zh" : "en", { zh: "导出失败。", en: "Export failed." }));
    } finally {
      setExporting(false);
    }
  };

  const selected = rows.find((row) => String(row.user_id) === selectedId) ?? null;

  return (
    <div className="admin-pretest-panel admin-posttest-panel">
      <section className="admin-panel admin-pretest-toolbar">
        <div className="admin-panel-heading">
          <div>
            <span className="admin-eyebrow">POST-STUDY · POSTTEST_V1</span>
            <h2>{zh ? "参与者后测" : "Participant post-study"}</h2>
            <p>
              {zh
                ? "按登录账号或昵称筛选；全部 41 道题的答案只读。"
                : "Filter by login account or nickname. All 41 responses are read-only."}
            </p>
          </div>
          <button
            type="button"
            className="admin-button is-primary"
            onClick={() => void exportCsv()}
            disabled={exporting}
          >
            <Download size={16} />{" "}
            {exporting ? (zh ? "导出中…" : "Exporting…") : zh ? "导出当前结果" : "Export current results"}
          </button>
        </div>
        <div className="admin-pretest-filters">
          <label>
            <span>{zh ? "账号或昵称" : "Account or nickname"}</span>
            <input
              value={filters.account}
              onChange={(event) => setFilters((current) => ({ ...current, account: event.target.value }))}
              placeholder={zh ? "输入账号或昵称关键词" : "Account or nickname keyword"}
            />
          </label>
          <label>
            <span>{zh ? "状态" : "Status"}</span>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="">{zh ? "全部状态" : "All statuses"}</option>
              {["not_required", "not_started", "in_progress", "completed"].map((status) => (
                <option key={status} value={status}>
                  {posttestStatusLabel(status, zh)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{zh ? "开始日期" : "Start date"}</span>
            <input
              type="date"
              value={filters.start}
              onChange={(event) => setFilters((current) => ({ ...current, start: event.target.value }))}
            />
          </label>
          <label>
            <span>{zh ? "结束日期" : "End date"}</span>
            <input
              type="date"
              value={filters.end}
              onChange={(event) => setFilters((current) => ({ ...current, end: event.target.value }))}
            />
          </label>
          <button type="button" className="admin-button is-secondary" onClick={() => void load()} disabled={loading}>
            <Filter size={16} /> {zh ? "应用筛选" : "Apply filters"}
          </button>
        </div>
        {error && (
          <div className="admin-alert is-error">
            <AlertTriangle size={17} />
            {error}
          </div>
        )}
      </section>

      <div className="admin-pretest-grid">
        <section className="admin-panel admin-pretest-list">
          <header>
            <b>{zh ? `${rows.length} 个账号` : `${rows.length} accounts`}</b>
            {loading && <span className="admin-spinner" />}
          </header>
          {!loading && !rows.length && (
            <Empty
              icon={ClipboardCheck}
              title={zh ? "没有匹配结果" : "No matching results"}
              body={zh ? "调整筛选条件后重试。" : "Try different filters."}
            />
          )}
          {rows.map((row) => (
            <button
              type="button"
              key={String(row.user_id)}
              className={selectedId === String(row.user_id) ? "is-selected" : ""}
              onClick={() => setSelectedId(String(row.user_id))}
            >
              <span className="admin-avatar">{String(row.display_name || row.username || "?").slice(0, 1)}</span>
              <span>
                <b>@{String(row.username)}</b>
                <small>{String(row.display_name || "—")}</small>
              </span>
              <i className={`admin-status status-${String(row.status)}`}>{posttestStatusLabel(row.status, zh)}</i>
              <ChevronRight size={16} />
            </button>
          ))}
        </section>

        <section className="admin-panel admin-pretest-detail">
          {!selected ? (
            <Empty
              large
              icon={UserRound}
              title={zh ? "选择一个账号" : "Select an account"}
              body={zh ? "查看该参与者的后测状态和完整答案。" : "View post-study status and complete answers."}
            />
          ) : (
            <>
              <header>
                <div>
                  <span className="admin-eyebrow">@{String(selected.username)}</span>
                  <h2>{String(selected.display_name || "—")}</h2>
                </div>
                <span className={`admin-status status-${String(selected.status)}`}>
                  {posttestStatusLabel(selected.status, zh)}
                </span>
              </header>
              <dl className="admin-pretest-meta">
                <div>
                  <dt>{zh ? "当前步骤" : "Current step"}</dt>
                  <dd>{String(selected.current_step ?? "—")} / 5</dd>
                </div>
                <div>
                  <dt>{zh ? "提交时间" : "Submitted"}</dt>
                  <dd>{selected.submitted_at ? new Date(String(selected.submitted_at)).toLocaleString() : "—"}</dd>
                </div>
                <div>
                  <dt>{zh ? "提醒关闭时间" : "Reminder dismissed"}</dt>
                  <dd>
                    {selected.reminder_dismissed_at
                      ? new Date(String(selected.reminder_dismissed_at)).toLocaleString()
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>{zh ? "问卷版本" : "Version"}</dt>
                  <dd>{String(selected.questionnaire_version || "—")}</dd>
                </div>
              </dl>
              <div className="admin-posttest-answers">
                {posttestSections.map((section) => (
                  <section key={section.step}>
                    <header>
                      <b>{section.titleZh}</b>
                      <small>{section.titleEn}</small>
                    </header>
                    {section.items.map((item) => (
                      <div key={item.id}>
                        <span>
                          <i>{item.id}</i>
                          {item.zh}
                          <small>{item.en}</small>
                        </span>
                        <b>{selected[item.id] == null ? "—" : `${String(selected[item.id])} / 5`}</b>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

type AnalyticsFilters = {
  start: string;
  end: string;
  account: string;
  priority: string;
  module: string;
};

const analyticsModules = ["acquisition", "creation", "discovery", "reading", "resonance", "guidance", "account"];

function analyticsDateInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function AnalyticsPanel({
  analytics,
  accounts,
  zh,
}: {
  analytics: Record<string, unknown>;
  accounts: Array<Record<string, unknown>>;
  zh: boolean;
}) {
  const today = analyticsDateInput(new Date());
  const initialStart = analyticsDateInput(new Date(Date.now() - 27 * 24 * 60 * 60 * 1000));
  const defaults: AnalyticsFilters = { start: initialStart, end: today, account: "", priority: "", module: "" };
  const [report, setReport] = useState(analytics);
  const [filters, setFilters] = useState<AnalyticsFilters>(defaults);
  const [appliedFilters, setAppliedFilters] = useState<AnalyticsFilters>(defaults);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  useEffect(() => setReport(analytics), [analytics]);

  const overview = rowObject(report.overview);
  const creation = rowObject(report.creation);
  const discovery = rowObject(report.discovery);
  const reading = rowObject(report.reading);
  const guidance = rowObject(report.guidance);
  const selectedAccount = rowObject(report.selected_account);
  const accountStories = rowObject(report.account_stories);
  const funnel = Array.isArray(report.funnel) ? report.funnel.map(rowObject) : [];
  const daily = Array.isArray(report.daily) ? report.daily.map(rowObject) : [];
  const modules = Array.isArray(report.modules) ? report.modules.map(rowObject) : [];
  const eventCounts = Array.isArray(report.event_counts) ? report.event_counts.map(rowObject) : [];
  const searches = Array.isArray(report.searches) ? report.searches.map(rowObject) : [];
  const navigation = Array.isArray(report.navigation) ? report.navigation.map(rowObject) : [];
  const activeAccounts = Array.isArray(report.accounts) ? report.accounts.map(rowObject) : [];
  const recentEvents = Array.isArray(report.recent_events) ? report.recent_events.map(rowObject) : [];

  const moduleLabel = (module: unknown) => {
    const labels: Record<string, [string, string]> = {
      acquisition: ["访问与注册", "Acquisition"],
      creation: ["故事创作", "Creation"],
      discovery: ["星空发现", "Discovery"],
      reading: ["故事阅读", "Reading"],
      resonance: ["共鸣互动", "Resonance"],
      guidance: ["新手引导", "Guidance"],
      account: ["账户与反馈", "Account"],
    };
    return labels[String(module)]?.[zh ? 0 : 1] ?? String(module || "—");
  };
  const funnelLabel = (stage: unknown) => {
    const labels: Record<string, [string, string]> = {
      home: ["访问首页", "Home visit"],
      signup: ["注册成功", "Signed up"],
      icebreaker: ["进入破冰", "Icebreaker"],
      story_input: ["完成故事输入", "Story input"],
      analysis: ["AI 整理完成", "AI organised"],
      published: ["完成发布", "Published"],
      resonance: ["进入共鸣设置", "Resonance settings"],
      lobby: ["进入星空", "Entered lobby"],
      star_click: ["点击星点", "Clicked a star"],
      meaningful_read: ["有效阅读", "Meaningful read"],
    };
    return labels[String(stage)]?.[zh ? 0 : 1] ?? String(stage);
  };
  const eventLabel = (name: unknown) => {
    const labels: Record<string, [string, string]> = {
      home_viewed: ["访问首页", "Home viewed"],
      home_cta_clicked: ["点击首页入口", "Home CTA clicked"],
      home_preview_opened: ["打开首页预览", "Home preview opened"],
      auth_mode_changed: ["切换账号操作", "Auth mode changed"],
      auth_attempted: ["提交账号操作", "Auth attempted"],
      auth_result: ["账号操作结果", "Auth result"],
      password_recovery_started: ["开始找回密码", "Recovery started"],
      password_recovery_result: ["找回密码结果", "Recovery result"],
      language_changed: ["切换语言", "Language changed"],
      theme_changed: ["切换主题", "Theme changed"],
      icebreaker_viewed: ["进入破冰页", "Icebreaker viewed"],
      icebreaker_card_exposed: ["破冰卡片曝光", "Icebreaker card exposed"],
      icebreaker_selected: ["选择破冰提示", "Icebreaker selected"],
      icebreaker_custom_input: ["填写自定义破冰", "Custom icebreaker input"],
      icebreaker_continue_clicked: ["从破冰页继续", "Icebreaker continued"],
      story_write_viewed: ["进入故事创作", "Story write viewed"],
      story_paste_detected: ["粘贴故事正文", "Story paste detected"],
      story_input_snapshot: ["提交故事输入", "Story input submitted"],
      story_field_focused: ["聚焦故事字段", "Story field focused"],
      story_metadata_changed: ["修改故事信息", "Story metadata changed"],
      city_search_executed: ["搜索城市", "City search"],
      city_selected: ["选择城市", "City selected"],
      voice_input_started: ["开始语音输入", "Voice input started"],
      voice_input_ended: ["结束语音输入", "Voice input ended"],
      focus_mode_changed: ["切换专注模式", "Focus mode changed"],
      story_validation_blocked: ["故事校验未通过", "Story validation blocked"],
      story_back_clicked: ["返回上一步", "Story back clicked"],
      story_autosaved: ["自动保存故事", "Story autosaved"],
      ai_organize_clicked: ["点击 AI 整理", "AI organise clicked"],
      story_analysis_started: ["开始 AI 分析", "Story analysis started"],
      story_analysis_result: ["AI 分析结果", "Story analysis result"],
      story_analysis_retry_clicked: ["重试 AI 分析", "AI analysis retried"],
      moderation_routed: ["转入内容审核", "Moderation routed"],
      pending_review_lobby_entered: ["待审后进入星空", "Entered lobby while pending"],
      story_confirmation_viewed: ["进入故事确认", "Story confirmation viewed"],
      story_body_edited: ["修改故事正文", "Story body edited"],
      story_label_editor_opened: ["打开标签编辑", "Label editor opened"],
      ai_label_edited: ["修改 AI 标签", "AI label edited"],
      story_custom_theme_added: ["添加自定义主题", "Custom theme added"],
      image_style_selected: ["选择图片风格", "Image style selected"],
      image_generation_started: ["开始生成图片", "Image generation started"],
      image_generation_result: ["图片生成结果", "Image generation result"],
      image_downloaded: ["下载故事图片", "Image downloaded"],
      publish_clicked: ["点击发布", "Publish clicked"],
      story_submit_result: ["故事发布结果", "Story submit result"],
      resonance_page_viewed: ["进入共鸣设置", "Resonance page viewed"],
      resonance_dimension_clicked: ["选择共鸣维度", "Resonance dimension clicked"],
      resonance_confirm_clicked: ["确认初始共鸣", "Initial resonance confirmed"],
      recommendation_page_viewed: ["进入推荐页", "Recommendations viewed"],
      recommendation_card_exposed: ["推荐卡片曝光", "Recommendation exposed"],
      recommendation_card_clicked: ["点击推荐卡片", "Recommendation clicked"],
      recommendation_refresh_clicked: ["刷新推荐", "Recommendations refreshed"],
      recommendation_lobby_entered: ["从推荐进入星空", "Entered lobby from recommendations"],
      star_lobby_viewed: ["进入星空", "Lobby viewed"],
      star_exposed: ["星点曝光", "Star exposed"],
      star_clicked: ["点击星点", "Star clicked"],
      lobby_nav_clicked: ["点击星空导航", "Lobby navigation clicked"],
      lobby_search_opened: ["打开星空搜索", "Lobby search opened"],
      story_read_started: ["开始阅读", "Read started"],
      story_read_ended: ["结束阅读", "Read ended"],
      story_reaction_result: ["喜欢/不喜欢结果", "Reaction result"],
      story_reaction_clicked: ["点击喜欢/不喜欢", "Reaction clicked"],
      lobby_search_executed: ["执行搜索", "Lobby search"],
      lobby_search_cleared: ["清空星空搜索", "Lobby search cleared"],
      lobby_resonance_option_clicked: ["修改共鸣选项", "Resonance option changed"],
      lobby_resonance_confirm_clicked: ["确认共鸣设置", "Resonance settings confirmed"],
      lobby_resonance_refresh_result: ["共鸣重排结果", "Resonance refresh"],
      lobby_gesture_summary: ["星空操作汇总", "Lobby gesture summary"],
      story_panel_closed: ["关闭故事面板", "Story panel closed"],
      report_started: ["开始举报", "Report started"],
      report_result: ["举报结果", "Report result"],
      account_opened: ["打开账号面板", "Account panel opened"],
      profile_update_result: ["账号资料修改结果", "Profile update result"],
      feedback_submitted: ["提交用户反馈", "Feedback submitted"],
      notifications_opened: ["打开通知", "Notifications opened"],
      logout_clicked: ["退出登录", "Logout clicked"],
      tour_started: ["开始引导", "Tour started"],
      tour_step_viewed: ["引导步骤曝光", "Tour step viewed"],
      tour_next_clicked: ["引导下一步", "Tour next clicked"],
      tour_back_clicked: ["引导上一步", "Tour back clicked"],
      tour_skipped: ["跳过引导", "Tour skipped"],
      tour_completed: ["完成引导", "Tour completed"],
    };
    return labels[String(name)]?.[zh ? 0 : 1] ?? String(name);
  };
  const percentage = (value: unknown) => `${(Number(value ?? 0) * 100).toFixed(1)}%`;
  const seconds = (value: unknown) => `${Math.round(Number(value ?? 0) / 1000)}s`;
  const accountOptions = useMemo(() => {
    const unique = new Map<string, Record<string, unknown>>();
    [...activeAccounts, ...accounts].forEach((account) => {
      const username = String(account.username ?? "");
      if (username) unique.set(username, account);
    });
    return [...unique.values()].sort((a, b) => String(a.username).localeCompare(String(b.username)));
  }, [activeAccounts, accounts]);

  const loadReport = async (next: AnalyticsFilters) => {
    setReportLoading(true);
    setReportError("");
    try {
      const result = await dataService.adminAction<{ analytics: Record<string, unknown> }>("analytics-query", {
        start: `${next.start}T00:00:00+08:00`,
        end: `${next.end}T23:59:59.999+08:00`,
        account: next.account.trim(),
        priority: next.priority,
        module: next.module,
      });
      setReport(result.analytics);
      setAppliedFilters(next);
    } catch (error) {
      setReportError(
        localizedError(error, zh ? "zh" : "en", {
          zh: "无法读取这组实验数据，请检查筛选条件。",
          en: "Could not load this experiment slice. Check the filters.",
        }),
      );
    } finally {
      setReportLoading(false);
    }
  };
  const applyQuickRange = (days: number) => {
    const next = { ...filters, start: analyticsDateInput(new Date(Date.now() - (days - 1) * 86_400_000)), end: today };
    setFilters(next);
    void loadReport(next);
  };
  const drillIntoAccount = (username: string) => {
    const next = { ...filters, account: username };
    setFilters(next);
    void loadReport(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const reset = () => {
    setFilters(defaults);
    void loadReport(defaults);
  };

  const metrics = selectedAccount.id
    ? [
        { label: zh ? "行为事件" : "Behaviour events", value: Number(overview.events ?? 0), icon: MousePointerClick },
        { label: zh ? "访问会话" : "Sessions", value: Number(overview.sessions ?? 0), icon: Clock3 },
        { label: zh ? "公开故事" : "Published stories", value: Number(accountStories.published ?? 0), icon: BookOpen },
        { label: zh ? "有效阅读" : "Meaningful reads", value: Number(reading.meaningful_reads ?? 0), icon: Sparkles },
      ]
    : [
        { label: zh ? "活跃参与者" : "Active participants", value: Number(overview.participants ?? 0), icon: Users },
        { label: zh ? "完成故事输入" : "Story creators", value: Number(overview.creators ?? 0), icon: FileText },
        { label: zh ? "进入星空" : "Lobby visitors", value: Number(overview.lobby_users ?? 0), icon: BarChart3 },
        {
          label: zh ? "有效阅读用户" : "Meaningful readers",
          value: Number(overview.meaningful_readers ?? 0),
          icon: Sparkles,
        },
      ];
  const maximumDailyEvents = Math.max(1, ...daily.map((row) => Number(row.events ?? 0)));
  const maximumFunnel = Math.max(1, ...funnel.map((row) => Number(row.participants ?? 0)));

  return (
    <div className="admin-analytics analytics-research-console">
      <section className="analytics-research-hero">
        <div>
          <span className="admin-eyebrow">STORYVERSE · RESEARCH EXPLORER</span>
          <h2>
            {selectedAccount.id
              ? `@${String(selectedAccount.username)}`
              : zh
                ? "从用户旅程理解实验"
                : "Understand the experiment through user journeys"}
          </h2>
          <p>
            {selectedAccount.id
              ? `${String(selectedAccount.display_name || selectedAccount.username)} · ${displayStatus(selectedAccount.status, zh)}`
              : zh
                ? "按时间、账号与行为类型切片；所有指标和时间线使用同一组筛选条件。"
                : "Slice by time, account and behaviour. Every metric and timeline uses the same filters."}
          </p>
        </div>
        {selectedAccount.id ? <UserRound size={54} aria-hidden="true" /> : <BarChart3 size={54} aria-hidden="true" />}
      </section>

      <form
        className="analytics-filter-panel"
        onSubmit={(event) => {
          event.preventDefault();
          void loadReport(filters);
        }}
      >
        <div className="analytics-filter-heading">
          <Filter size={18} />
          <div>
            <b>{zh ? "筛选实验数据" : "Filter experiment data"}</b>
            <span>{zh ? "时间按北京时间计算" : "Times use Asia/Shanghai"}</span>
          </div>
        </div>
        <label>
          <span>{zh ? "开始日期" : "Start"}</span>
          <input
            type="date"
            value={filters.start}
            max={filters.end}
            onChange={(event) => setFilters({ ...filters, start: event.target.value })}
          />
        </label>
        <label>
          <span>{zh ? "结束日期" : "End"}</span>
          <input
            type="date"
            value={filters.end}
            min={filters.start}
            max={today}
            onChange={(event) => setFilters({ ...filters, end: event.target.value })}
          />
        </label>
        <label className="analytics-account-filter">
          <span>{zh ? "登录账号" : "Account"}</span>
          <input
            list="analytics-account-options"
            value={filters.account}
            onChange={(event) => setFilters({ ...filters, account: event.target.value })}
            placeholder={zh ? "全部账号或输入完整账号" : "All or exact username"}
          />
          <datalist id="analytics-account-options">
            {accountOptions.map((account) => (
              <option key={String(account.id)} value={String(account.username)}>
                {String(account.display_name || account.username)}
              </option>
            ))}
          </datalist>
        </label>
        <label>
          <span>{zh ? "优先级" : "Priority"}</span>
          <select
            value={filters.priority}
            onChange={(event) => setFilters({ ...filters, priority: event.target.value })}
          >
            <option value="">{zh ? "全部" : "All"}</option>
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
          </select>
        </label>
        <label>
          <span>{zh ? "行为模块" : "Module"}</span>
          <select value={filters.module} onChange={(event) => setFilters({ ...filters, module: event.target.value })}>
            <option value="">{zh ? "全部行为" : "All behaviours"}</option>
            {analyticsModules.map((module) => (
              <option key={module} value={module}>
                {moduleLabel(module)}
              </option>
            ))}
          </select>
        </label>
        <div className="analytics-filter-actions">
          <button type="button" className="admin-button is-secondary" onClick={reset}>
            {zh ? "重置" : "Reset"}
          </button>
          <button type="submit" className="admin-button is-primary" disabled={reportLoading}>
            {reportLoading ? (zh ? "查询中…" : "Loading…") : zh ? "应用筛选" : "Apply"}
          </button>
        </div>
        <div className="analytics-quick-ranges">
          <span>{zh ? "快捷范围" : "Quick range"}</span>
          {[7, 28, 90].map((days) => (
            <button type="button" key={days} onClick={() => applyQuickRange(days)}>
              {days}
              {zh ? "天" : "d"}
            </button>
          ))}
        </div>
      </form>
      {reportError && <p className="admin-inline-error analytics-report-error">{reportError}</p>}

      <div className="analytics-applied-scope">
        <span>
          {appliedFilters.start} — {appliedFilters.end}
        </span>
        {appliedFilters.account && <span>@{appliedFilters.account}</span>}
        {appliedFilters.priority && <span>{appliedFilters.priority}</span>}
        {appliedFilters.module && <span>{moduleLabel(appliedFilters.module)}</span>}
        <em>
          {Number(overview.events ?? 0)} {zh ? "条行为" : "events"}
        </em>
      </div>

      <section className="admin-metric-grid analytics-metric-grid">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <article className={`admin-metric tone-${["teal", "blue", "amber", "rose"][index]}`} key={metric.label}>
              <span className="admin-metric-icon">
                <Icon size={19} />
              </span>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </article>
          );
        })}
      </section>

      {Boolean(selectedAccount.id) && (
        <section className="analytics-account-summary">
          <button type="button" onClick={() => drillIntoAccount("")}>
            <ChevronRight size={16} />
            {zh ? "返回全部用户" : "Back to all users"}
          </button>
          <dl>
            <div>
              <dt>{zh ? "登录账号" : "Username"}</dt>
              <dd>@{String(selectedAccount.username)}</dd>
            </div>
            <div>
              <dt>{zh ? "昵称" : "Display name"}</dt>
              <dd>{String(selectedAccount.display_name)}</dd>
            </div>
            <div>
              <dt>{zh ? "账号状态" : "Status"}</dt>
              <dd>{displayStatus(selectedAccount.status, zh)}</dd>
            </div>
            <div>
              <dt>{zh ? "故事总数" : "Stories"}</dt>
              <dd>{Number(accountStories.total ?? 0)}</dd>
            </div>
            <div>
              <dt>{zh ? "待审核" : "Pending"}</dt>
              <dd>{Number(accountStories.pending_review ?? 0)}</dd>
            </div>
            <div>
              <dt>{zh ? "私密故事" : "Private"}</dt>
              <dd>{Number(accountStories.private ?? 0)}</dd>
            </div>
          </dl>
        </section>
      )}

      <section className="analytics-behaviour-grid">
        <article className="analytics-behaviour-card">
          <span>01 · {zh ? "创作" : "Creation"}</span>
          <h3>{Number(creation.input_snapshots ?? 0)}</h3>
          <p>{zh ? "完成输入的故事" : "completed story inputs"}</p>
          <dl>
            <div>
              <dt>{zh ? "粘贴率" : "Paste rate"}</dt>
              <dd>{percentage(creation.paste_rate)}</dd>
            </div>
            <div>
              <dt>{zh ? "平均有效输入" : "Average input"}</dt>
              <dd>{seconds(creation.average_input_ms)}</dd>
            </div>
            <div>
              <dt>{zh ? "AI 整理成功" : "AI success"}</dt>
              <dd>{Number(creation.analysis_succeeded ?? 0)}</dd>
            </div>
            <div>
              <dt>{zh ? "标签修改" : "Label edits"}</dt>
              <dd>{Number(creation.label_edits ?? 0)}</dd>
            </div>
          </dl>
        </article>
        <article className="analytics-behaviour-card">
          <span>02 · {zh ? "发现" : "Discovery"}</span>
          <h3>{percentage(overview.star_ctr)}</h3>
          <p>{zh ? "星点点击率" : "star click-through rate"}</p>
          <dl>
            <div>
              <dt>{zh ? "星点曝光" : "Exposures"}</dt>
              <dd>{Number(discovery.star_exposures ?? 0)}</dd>
            </div>
            <div>
              <dt>{zh ? "星点点击" : "Clicks"}</dt>
              <dd>{Number(discovery.star_clicks ?? 0)}</dd>
            </div>
            <div>
              <dt>{zh ? "搜索" : "Searches"}</dt>
              <dd>{Number(discovery.searches ?? 0)}</dd>
            </div>
            <div>
              <dt>{zh ? "共鸣重排" : "Resonance refresh"}</dt>
              <dd>{Number(discovery.preference_refreshes ?? 0)}</dd>
            </div>
          </dl>
        </article>
        <article className="analytics-behaviour-card">
          <span>03 · {zh ? "阅读" : "Reading"}</span>
          <h3>{Number(reading.meaningful_reads ?? 0)}</h3>
          <p>{zh ? "有效阅读" : "meaningful reads"}</p>
          <dl>
            <div>
              <dt>{zh ? "打开故事" : "Opened"}</dt>
              <dd>{Number(reading.reads_started ?? 0)}</dd>
            </div>
            <div>
              <dt>{zh ? "有效阅读率" : "Meaningful rate"}</dt>
              <dd>{percentage(overview.meaningful_read_rate)}</dd>
            </div>
            <div>
              <dt>{zh ? "平均阅读" : "Average read"}</dt>
              <dd>{seconds(reading.average_read_ms)}</dd>
            </div>
            <div>
              <dt>{zh ? "喜欢 / 不喜欢" : "Likes / dislikes"}</dt>
              <dd>
                {Number(reading.likes ?? 0)} / {Number(reading.dislikes ?? 0)}
              </dd>
            </div>
          </dl>
        </article>
        <article className="analytics-behaviour-card">
          <span>04 · {zh ? "引导" : "Guidance"}</span>
          <h3>{Number(guidance.tour_completed ?? 0)}</h3>
          <p>{zh ? "完成引导" : "completed tours"}</p>
          <dl>
            <div>
              <dt>{zh ? "开始引导" : "Started"}</dt>
              <dd>{Number(guidance.tour_started ?? 0)}</dd>
            </div>
            <div>
              <dt>{zh ? "跳过引导" : "Skipped"}</dt>
              <dd>{Number(guidance.tour_skipped ?? 0)}</dd>
            </div>
            <div>
              <dt>Icebreaker</dt>
              <dd>{Number(guidance.icebreaker_views ?? 0)}</dd>
            </div>
            <div>
              <dt>{zh ? "共鸣页" : "Resonance page"}</dt>
              <dd>{Number(guidance.resonance_views ?? 0)}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="admin-analytics-grid analytics-primary-grid">
        <article className="admin-panel analytics-journey-panel">
          <div className="admin-panel-heading">
            <div>
              <span className="admin-eyebrow">JOURNEY</span>
              <h2>{zh ? "用户旅程漏斗" : "User journey funnel"}</h2>
              <p>{zh ? "人数按参与者去重" : "Deduplicated participants"}</p>
            </div>
          </div>
          <div className="analytics-funnel">
            {funnel.map((row) => (
              <div key={String(row.stage)}>
                <span>{funnelLabel(row.stage)}</span>
                <i style={{ width: `${(Number(row.participants ?? 0) / maximumFunnel) * 100}%` }} />
                <b>{Number(row.participants ?? 0)}</b>
              </div>
            ))}
          </div>
        </article>
        <article className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <span className="admin-eyebrow">BEHAVIOUR MIX</span>
              <h2>{zh ? "行为模块分布" : "Behaviour mix"}</h2>
            </div>
          </div>
          <div className="analytics-module-list">
            {modules.map((row) => (
              <button
                type="button"
                key={String(row.module)}
                className={appliedFilters.module === row.module ? "is-active" : ""}
                onClick={() => {
                  const next = { ...filters, module: String(row.module) };
                  setFilters(next);
                  void loadReport(next);
                }}
              >
                <span>{moduleLabel(row.module)}</span>
                <b>{Number(row.events ?? 0)}</b>
                <small>
                  {Number(row.participants ?? 0)} {zh ? "人" : "people"}
                </small>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="admin-panel analytics-daily-panel">
        <div className="admin-panel-heading">
          <div>
            <span className="admin-eyebrow">ACTIVITY</span>
            <h2>{zh ? "每日实验活动" : "Daily experiment activity"}</h2>
          </div>
        </div>
        {daily.length ? (
          <div className="analytics-daily-chart">
            {daily.map((row) => (
              <div key={String(row.day)}>
                <time>{String(row.day).slice(5)}</time>
                <span>
                  <i style={{ width: `${(Number(row.events ?? 0) / maximumDailyEvents) * 100}%` }} />
                </span>
                <b>
                  {Number(row.participants ?? 0)} {zh ? "人" : "people"}
                </b>
                <em>
                  {Number(row.meaningful_readers ?? 0)} {zh ? "有效阅读" : "meaningful"}
                </em>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            icon={BarChart3}
            title={zh ? "该范围暂无行为" : "No activity in this range"}
            body={zh ? "尝试扩大时间范围或清除筛选条件。" : "Expand the date range or clear a filter."}
          />
        )}
      </section>

      {!selectedAccount.id && (
        <section className="admin-panel analytics-accounts-panel">
          <div className="admin-panel-heading">
            <div>
              <span className="admin-eyebrow">ACCOUNT DRILL-DOWN</span>
              <h2>{zh ? "按账号查看" : "Explore by account"}</h2>
              <p>
                {zh ? "点击账号后，整页会切换为该用户的行为数据。" : "Select an account to filter the entire page."}
              </p>
            </div>
          </div>
          <div className="analytics-account-list">
            {activeAccounts.map((account) => (
              <button type="button" key={String(account.id)} onClick={() => drillIntoAccount(String(account.username))}>
                <span className="analytics-account-avatar">
                  {String(account.display_name || account.username)
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <span>
                  <b>@{String(account.username)}</b>
                  <small>{String(account.display_name || "—")}</small>
                </span>
                <em>
                  <b>{Number(account.events ?? 0)}</b>
                  <small>{zh ? "条行为" : "events"}</small>
                </em>
                <em>
                  <b>{Number(account.sessions ?? 0)}</b>
                  <small>{zh ? "次会话" : "sessions"}</small>
                </em>
                <em>
                  <b>{Number(account.meaningful_reads ?? 0)}</b>
                  <small>{zh ? "有效阅读" : "meaningful"}</small>
                </em>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
          {!activeAccounts.length && (
            <Empty
              icon={Users}
              title={zh ? "没有匹配账号" : "No matching accounts"}
              body={zh ? "当前筛选范围内没有登录用户行为。" : "No signed-in activity matches this slice."}
            />
          )}
        </section>
      )}

      <section className="admin-analytics-grid analytics-secondary-grid">
        <article className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <span className="admin-eyebrow">SEARCH</span>
              <h2>{zh ? "大厅搜索内容" : "Lobby searches"}</h2>
            </div>
          </div>
          <div className="analytics-table is-scrollable">
            {searches.map((row, index) => (
              <div key={`${String(row.query)}-${index}`}>
                <span>{String(row.query || "—")}</span>
                <b>{Number(row.searches ?? 0)}×</b>
                <em>
                  {Number(row.zero_results ?? 0)} {zh ? "次无结果" : "zero"}
                </em>
              </div>
            ))}
          </div>
        </article>
        <article className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <span className="admin-eyebrow">LOBBY NAVIGATION</span>
              <h2>{zh ? "星空底部导航" : "Lobby navigation"}</h2>
            </div>
          </div>
          <div className="analytics-table is-scrollable">
            {navigation.map((row) => (
              <div key={String(row.view)}>
                <span>{String(row.view || "unknown")}</span>
                <b>{Number(row.clicks ?? 0)}×</b>
                <em>
                  {Number(row.participants ?? 0)} {zh ? "人" : "people"}
                </em>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="admin-panel analytics-events-panel">
        <div className="admin-panel-heading">
          <div>
            <span className="admin-eyebrow">EVENT BREAKDOWN</span>
            <h2>{zh ? "事件明细分布" : "Event breakdown"}</h2>
          </div>
        </div>
        <div className="analytics-event-grid">
          {eventCounts.map((row) => (
            <div key={`${String(row.event_name)}-${String(row.priority)}`}>
              <span>
                <b>{eventLabel(row.event_name)}</b>
                <small>{String(row.event_name)}</small>
              </span>
              <i>{moduleLabel(row.module)}</i>
              <strong>{String(row.priority)}</strong>
              <em>
                {Number(row.participants ?? 0)} {zh ? "人" : "people"}
              </em>
              <b>{Number(row.events ?? 0)}</b>
            </div>
          ))}
        </div>
      </section>

      {Boolean(selectedAccount.id) && (
        <section className="admin-panel analytics-timeline-panel">
          <div className="admin-panel-heading">
            <div>
              <span className="admin-eyebrow">ACCOUNT TIMELINE</span>
              <h2>
                {zh
                  ? `@${String(selectedAccount.username)} 的行为时间线`
                  : `@${String(selectedAccount.username)} timeline`}
              </h2>
              <p>{zh ? "最多展示当前筛选范围内最近 200 条行为。" : "Up to 200 recent events in the current filter."}</p>
            </div>
          </div>
          <div className="analytics-timeline">
            {recentEvents.map((event) => (
              <details key={String(event.event_id)}>
                <summary>
                  <time>{new Date(String(event.occurred_at)).toLocaleString(zh ? "zh-CN" : "en-US")}</time>
                  <span>
                    <b>{eventLabel(event.event_name)}</b>
                    <small>{String(event.event_name)}</small>
                  </span>
                  <i>{moduleLabel(event.module)}</i>
                  <strong>{String(event.priority)}</strong>
                </summary>
                <div className="analytics-event-context">
                  <span>{String(event.page_id || "—")}</span>
                  <span>{String(event.route || "—")}</span>
                </div>
                <pre>{JSON.stringify(event.properties, null, 2)}</pre>
              </details>
            ))}
          </div>
          {!recentEvents.length && (
            <Empty
              icon={UserRound}
              title={zh ? "没有匹配行为" : "No matching behaviour"}
              body={zh ? "这个账号在当前筛选范围内没有事件。" : "This account has no events in the current slice."}
            />
          )}
        </section>
      )}
    </div>
  );
}

function ImportsPanel({
  dashboard,
  zh,
  run,
  importCsv,
  downloadTemplate,
  setError,
}: {
  dashboard: AdminDashboard;
  zh: boolean;
  run: RunFunction;
  importCsv: (file: File) => Promise<void>;
  downloadTemplate: () => void;
  setError: (error: string) => void;
}) {
  return (
    <div className="admin-imports">
      <section className="admin-import-hero">
        <div>
          <span className="admin-eyebrow">{zh ? "冷启动说明" : "SEED STORY GUIDE"}</span>
          <h2>{zh ? "冷启动故事是什么？" : "What is a seed story?"}</h2>
          <p>
            {zh
              ? "在真实用户故事还不够多时，导入一批已取得授权的故事，让推荐页和星空不会是空的。它们会以 StoryVerse 系统账号发布，并走同一套字段校验、AI 类型/主题识别和向量生成流程。"
              : "Authorised stories populate recommendations and the lobby before enough user stories exist. They publish under the StoryVerse system account and use the same validation, labels and embeddings."}
          </p>
        </div>
        <div className="admin-import-steps">
          <div>
            <i>1</i>
            <span>
              <b>{zh ? "下载模板" : "Download"}</b>
              <small>{zh ? "不要修改表头" : "Keep headers unchanged"}</small>
            </span>
          </div>
          <div>
            <i>2</i>
            <span>
              <b>{zh ? "填写并检查" : "Complete"}</b>
              <small>{zh ? "一行一个故事" : "One story per row"}</small>
            </span>
          </div>
          <div>
            <i>3</i>
            <span>
              <b>{zh ? "上传处理" : "Upload"}</b>
              <small>{zh ? "查看失败行" : "Review failed rows"}</small>
            </span>
          </div>
        </div>
      </section>
      <section className="admin-panel admin-upload-panel">
        <div className="admin-panel-heading">
          <div>
            <span className="admin-eyebrow">CSV · UTF-8</span>
            <h2>{zh ? "上传故事文件" : "Upload story file"}</h2>
            <p>
              {zh
                ? "每次 1–500 条。模板只有表头，不含示例故事；请在 Excel 或表格软件中填写后另存为 CSV UTF-8。"
                : "Import 1–500 rows at a time. The template contains headers only; fill it in and save as UTF-8 CSV."}
            </p>
          </div>
          <button type="button" className="admin-button is-secondary" onClick={downloadTemplate}>
            <Download size={17} />
            {zh ? "下载 CSV 模板" : "Download template"}
          </button>
        </div>
        <label className="admin-dropzone">
          <UploadCloud size={30} />
          <b>{zh ? "选择填写好的 CSV 文件" : "Choose a completed CSV file"}</b>
          <span>{zh ? "选择后会立即校验表头和必填字段" : "Headers and required fields are checked immediately"}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void run(() => importCsv(file), zh ? "CSV 已进入处理队列。" : "CSV queued.");
              event.currentTarget.value = "";
            }}
          />
        </label>
        <div className="admin-import-note">
          <AlertTriangle size={17} />
          <span>
            {zh
              ? "除非内容已经由人工确认安全，否则请保持 skip_moderation=false。选择 true 时 source_note 必须说明授权与审核依据。"
              : "Keep skip_moderation=false unless content has already been manually verified. A source_note is required when true."}
          </span>
        </div>
      </section>
      <section className="admin-panel admin-field-panel">
        <div className="admin-panel-heading">
          <div>
            <span className="admin-eyebrow">13 COLUMNS</span>
            <h2>{zh ? "字段说明" : "Field guide"}</h2>
            <p>
              {zh
                ? "字段名必须保持英文原样；“条件必填”表示只有特定情况下才要求填写。"
                : "Keep field names exactly as shown. Conditional fields are required only in specific cases."}
            </p>
          </div>
        </div>
        <div className="admin-field-table" role="table" aria-label={zh ? "冷启动字段说明" : "Seed story field guide"}>
          <div className="admin-field-head" role="row">
            <span>{zh ? "字段" : "Field"}</span>
            <span>{zh ? "是否必填" : "Required"}</span>
            <span>{zh ? "填写说明" : "Description"}</span>
            <span>{zh ? "示例" : "Example"}</span>
          </div>
          {seedFields.map((field) => (
            <div className="admin-field-row" role="row" key={field.name}>
              <code>{field.name}</code>
              <span>
                <i className={`requirement-${field.required}`}>
                  {field.required === "yes"
                    ? zh
                      ? "必填"
                      : "Required"
                    : field.required === "conditional"
                      ? zh
                        ? "条件必填"
                        : "Conditional"
                      : zh
                        ? "选填"
                        : "Optional"}
                </i>
              </span>
              <p>{field.description[zh ? 0 : 1]}</p>
              <code>{field.example}</code>
            </div>
          ))}
        </div>
      </section>
      <section className="admin-panel admin-batch-panel">
        <div className="admin-panel-heading">
          <div>
            <span className="admin-eyebrow">{zh ? "处理记录" : "IMPORT HISTORY"}</span>
            <h2>{zh ? "最近导入批次" : "Recent batches"}</h2>
          </div>
        </div>
        {!dashboard.imports.length && (
          <Empty
            icon={Database}
            title={zh ? "还没有导入记录" : "No imports yet"}
            body={zh ? "第一次上传后，处理结果会显示在这里。" : "Results will appear here after your first upload."}
          />
        )}
        <div className="admin-batch-list">
          {dashboard.imports.map((row) => {
            const total = Number(row.total_rows || 0);
            const imported = Number(row.imported_rows || 0);
            const failed = Number(row.failed_rows || 0);
            const skipped = Math.max(0, total - imported - failed);
            const progress = total ? Math.min(100, Math.round(((imported + failed + skipped) / total) * 100)) : 0;
            return (
              <article className="admin-batch-row" key={String(row.id)}>
                <span className="admin-row-icon">
                  <FileText size={18} />
                </span>
                <div>
                  <b>{String(row.filename)}</b>
                  <span>
                    {zh
                      ? `成功 ${imported} · 跳过 ${skipped} · 失败 ${failed} · 共 ${total}`
                      : `${imported} imported · ${skipped} skipped · ${failed} failed · ${total} total`}
                  </span>
                  <div className="admin-progress">
                    <i style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <StatusPill value={row.status} zh={zh} />
              </article>
            );
          })}
        </div>
        {!!dashboard.failures.length && (
          <div className="admin-failure-heading">
            <h3>
              {zh ? `待修复的失败行（${dashboard.failures.length}）` : `Failed rows (${dashboard.failures.length})`}
            </h3>
            <p>
              {zh
                ? "修正原始字段后可以单独重试，不需要重新上传整份文件。"
                : "Fix and retry a single row without uploading the whole file again."}
            </p>
          </div>
        )}
        <div className="admin-failure-list">
          {dashboard.failures.map((row) => (
            <article className="admin-failure-row" key={String(row.id)}>
              <div>
                <b>
                  #{String(row.row_number)} · {String(row.external_id || (zh ? "无编号" : "No ID"))}
                </b>
                <span>{String(row.error)}</span>
                <code>{JSON.stringify(row.raw_data)}</code>
              </div>
              <button
                type="button"
                className="admin-button is-tertiary"
                onClick={() => {
                  const edited = window.prompt(
                    zh ? "修改这一行的 JSON 后重试" : "Edit this row JSON before retrying",
                    JSON.stringify(row.raw_data),
                  );
                  if (!edited) return;
                  try {
                    const repaired = JSON.parse(edited) as Record<string, unknown>;
                    void run(
                      () =>
                        dataService.adminAction("seed-import", {
                          filename: `retry-${String(row.external_id || row.id)}.csv`,
                          rows: [repaired],
                          failureId: row.id,
                        }),
                      zh ? "该行已重新入队。" : "Row retried.",
                    );
                  } catch {
                    setError(zh ? "JSON 格式不正确。" : "Invalid JSON.");
                  }
                }}
              >
                {zh ? "修复后重试" : "Edit & retry"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
