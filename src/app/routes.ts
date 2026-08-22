import type { AppState, ScreenId, Story, StoryEditorStep, StoryStatus } from "../types/domain";
import type { AuthMode, GatewaySection } from "../types/ui";

const routeMap = {
  intro: "/",
  pretest: "/PreTest",
  posttest: "/PostTest",
  storyStart: "/StoryStart",
  storyWrite: "/StoryWrite",
  storyAnalyzing: "/StoryAnalyzing",
  storyPage: "/StoryPage",
  resonance: "/Resonance",
  recommendations: "/Recommendations",
  starLobby: "/StarLobby",
  admin: "/Admin",
} as const;

const appBase = import.meta.env.BASE_URL.replace(/\/$/, "");

export function externalPath(path: string) {
  return appBase && appBase !== "/" ? `${appBase}${path === "/" ? "/" : path}` : path;
}

export function normalizedPath(pathname = window.location.pathname) {
  return pathname.replace(/\/+$/, "") || "/";
}

export function routePatchFromPath(pathname = window.location.pathname): Partial<AppState> & {
  gatewaySection?: GatewaySection;
  authMode?: AuthMode;
} {
  const path = normalizedPath(pathname);
  if (path === routeMap.pretest) return { screen: "pretest" };
  if (path === routeMap.posttest) return { screen: "posttest" };
  if (path === routeMap.storyStart) return { screen: "storyEditor", storyEditorStep: 0 };
  if (path === routeMap.storyWrite) return { screen: "storyEditor", storyEditorStep: 1 };
  if (path === routeMap.storyAnalyzing) return { screen: "storyEditor", storyEditorStep: 2 };
  if (path === routeMap.storyPage) return { screen: "storyEditor", storyEditorStep: 3 };
  if (path === routeMap.resonance) return { screen: "resonance" };
  if (path === routeMap.recommendations) return { screen: "recommendations" };
  if (path === routeMap.starLobby) return { screen: "starLobby" };
  if (path === routeMap.admin) return { screen: "admin" };
  return { screen: "intro", gatewaySection: "intro" };
}

export function isStoryEditorRoute(pathname = window.location.pathname) {
  const path = normalizedPath(pathname);
  return [routeMap.storyStart, routeMap.storyWrite, routeMap.storyAnalyzing, routeMap.storyPage].includes(
    path as (typeof routeMap)["storyStart" | "storyWrite" | "storyAnalyzing" | "storyPage"],
  );
}

/** 直接输入 URL 时，缺少上游数据的页面应回到可继续操作的步骤，不能自动发起 AI 请求。 */
export function safeDirectStoryEditorStep({
  requestedStep,
  hasDraftContent,
  hasAnalysis,
}: {
  requestedStep: StoryEditorStep;
  hasDraftContent: boolean;
  hasAnalysis: boolean;
}): StoryEditorStep {
  if (requestedStep <= 1 || hasAnalysis) return requestedStep;
  return hasDraftContent ? 1 : 0;
}

/**
 * 直接打开 StoryPage 时优先展示最近一篇已经离开草稿/分析阶段的故事。
 * listOwnedStories 已按发布时间、创建时间倒序排列，因此保留输入顺序即可。
 */
export function pickStoryForDirectStoryPage(stories: Story[]) {
  return stories.find((story) => story.status !== "draft" && story.status !== "analyzing") ?? stories[0] ?? null;
}

export function authenticatedEntryScreen({
  isSignup,
  hasSavedDraft,
  hasPublishedStory,
}: {
  isSignup: boolean;
  hasSavedDraft: boolean;
  hasPublishedStory: boolean;
}): ScreenId {
  return isSignup || hasSavedDraft || !hasPublishedStory ? "storyEditor" : "starLobby";
}

export function guardPostPublishScreenForFirstStory(screen: ScreenId, hasPublishedStory: boolean): ScreenId {
  const requiresPublishedStory: ScreenId[] = ["posttest", "resonance", "recommendations", "starLobby"];
  return requiresPublishedStory.includes(screen) && !hasPublishedStory ? "storyEditor" : screen;
}

/** 数据库中仍需用户查看的故事状态，对应应该恢复到的编辑器步骤。 */
export function storyEditorStepForProgress(status: StoryStatus): StoryEditorStep | null {
  if (status === "analyzing") return 2;
  if (status === "pending_review" || status === "needs_confirmation") return 3;
  return null;
}

/** 已提交过故事的用户不应因为旧链接或空的浏览器状态重新掉进空白写作页。 */
export function guardBlankEditorAfterSubmission({
  screen,
  hasSubmittedStory,
  hasDraftContent,
  hasStoryProgress,
  allowDirectStoryRoute = false,
}: {
  screen: ScreenId;
  hasSubmittedStory: boolean;
  hasDraftContent: boolean;
  hasStoryProgress: boolean;
  allowDirectStoryRoute?: boolean;
}): ScreenId {
  return screen === "storyEditor" &&
    hasSubmittedStory &&
    !hasDraftContent &&
    !hasStoryProgress &&
    !allowDirectStoryRoute
    ? "starLobby"
    : screen;
}

export function shouldAutosaveDraft(screen: ScreenId, storyEditorStep: number): boolean {
  return screen === "storyEditor" && storyEditorStep <= 1;
}

export function pathFromState(state: AppState) {
  if (state.screen === "pretest") return routeMap.pretest;
  if (state.screen === "posttest") return routeMap.posttest;
  if (state.screen === "storyEditor") {
    return (
      [routeMap.storyStart, routeMap.storyWrite, routeMap.storyAnalyzing, routeMap.storyPage][state.storyEditorStep] ??
      routeMap.storyStart
    );
  }
  if (state.screen === "resonance") return routeMap.resonance;
  if (state.screen === "recommendations") return routeMap.recommendations;
  if (state.screen === "starLobby") return routeMap.starLobby;
  if (state.screen === "admin") return routeMap.admin;
  return routeMap.intro;
}
