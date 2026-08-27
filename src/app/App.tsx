import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { dataService } from "../services/data-service";
import { initialState, loadState, saveState } from "../lib/app-state-storage";
import { clearRecoveryDraft, loadRecoveryDraft, saveRecoveryDraft } from "../lib/draft-recovery";
import { setAnalyticsCollectionMode, setAnalyticsPage, track, updateAnalyticsContext } from "../lib/analytics";
import {
  authenticatedEntryScreen,
  externalPath,
  guardBlankEditorAfterSubmission,
  guardPostPublishScreenForFirstStory,
  guardResonanceScreenForExperiment,
  isStoryEditorRoute,
  normalizedPath,
  pathFromState,
  pickStoryForDirectStoryPage,
  routePatchFromPath,
  safeDirectStoryEditorStep,
  screenAfterPublishedStory,
  shouldAutosaveDraft,
  storyEditorStepForProgress,
} from "./routes";
import { Gateway } from "../features/gateway/Gateway";
import type {
  AppState,
  PosttestProgress,
  PosttestStep,
  PretestProgress,
  StoryDraft,
  Story,
  TourSceneId,
  UserProfile,
} from "../types/domain";
import type { AppUpdate, AuthMode, GatewayAuthInput, GatewaySection, ThemeMode } from "../types/ui";
import "../features/tour/tour.css";

const StoryEditor = lazy(() =>
  import("../features/story-editor/StoryEditor").then((module) => ({ default: module.StoryEditor })),
);
const ResonancePage = lazy(() =>
  import("../features/resonance/ResonancePage").then((module) => ({ default: module.ResonancePage })),
);
const RecommendationsPage = lazy(() =>
  import("../features/recommendations/RecommendationsPage").then((module) => ({
    default: module.RecommendationsPage,
  })),
);
const StarLobby = lazy(() =>
  import("../features/star-lobby/StarLobby").then((module) => ({ default: module.StarLobby })),
);
const AdminConsole = lazy(() =>
  import("../features/admin/AdminConsole").then((module) => ({ default: module.AdminConsole })),
);
const AdminGate = lazy(() => import("../features/admin/AdminGate").then((module) => ({ default: module.AdminGate })));
const PreTestPage = lazy(() =>
  import("../features/pretest/PreTestPage").then((module) => ({ default: module.PreTestPage })),
);
const PostTestPage = lazy(() =>
  import("../features/posttest/PostTestPage").then((module) => ({ default: module.PostTestPage })),
);

function PageLoadingFallback({ themeMode, language }: { themeMode: ThemeMode; language: AppState["language"] }) {
  return (
    <main className={`page-loading-fallback theme-${themeMode}`} role="status" aria-live="polite">
      <span aria-hidden="true">✦</span>
      <p>StoryVerse</p>
      <small>{language === "zh" ? "正在打开页面…" : "Opening page…"}</small>
    </main>
  );
}

async function loadRecoverableStory(userId: string, storedScopeId: string, storedStoryId: string | undefined) {
  const activeProgress = await dataService.getStoryProgress();
  if (activeProgress) return activeProgress;
  if (!storedStoryId || storedScopeId !== userId) return null;
  return dataService.getStoryProgress(storedStoryId);
}

export default function App() {
  const initialRoute = typeof window !== "undefined" ? routePatchFromPath() : {};
  const [state, setState] = useState<AppState>(() => {
    const loaded = { ...loadState(), ...initialRoute };
    /*
     * 加 ?tour=1 可以把新手引导重新打开一次，方便演示和回归验证。
     * 引导一旦看完或跳过就永久关闭，否则想再看一遍只能去清 localStorage。
     */
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("tour")) {
      return { ...loaded, tour: { enabled: true, seen: [] } };
    }
    return loaded;
  });
  const [gatewaySection, setGatewaySection] = useState<GatewaySection>(() => initialRoute.gatewaySection ?? "intro");
  const [authMode, setAuthMode] = useState<AuthMode>(() => initialRoute.authMode ?? "signup");
  const [themeMode, setThemeMode] = useState<ThemeMode>("day");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [pretestProgress, setPretestProgress] = useState<PretestProgress | null>(null);
  const [pretestLoadError, setPretestLoadError] = useState("");
  const [posttestProgress, setPosttestProgress] = useState<PosttestProgress | null>(null);
  const [posttestLoadError, setPosttestLoadError] = useState("");
  const [posttestNotice, setPosttestNotice] = useState("");
  const [localStories, setLocalStories] = useState<Story[]>([]);
  const [ownedStoryIds, setOwnedStoryIds] = useState<string[]>([]);
  const [directStoryRoute, setDirectStoryRoute] = useState(() =>
    typeof window !== "undefined" ? isStoryEditorRoute() : false,
  );
  const lastPathRef = useRef<string>(typeof window !== "undefined" ? normalizedPath() : "/");
  const poppingRef = useRef(false);
  const analyticsPageRef = useRef("");
  const update: AppUpdate = (patch) =>
    setState((previous) => ({ ...previous, ...(typeof patch === "function" ? patch(previous) : patch) }));
  const changeLanguage = (language: AppState["language"]) => {
    if (language === state.language) return;
    track("language_changed", { previous_language: state.language, language });
    updateAnalyticsContext({ language });
    update({ language });
  };
  const changeThemeMode = (nextTheme: ThemeMode) => {
    if (nextTheme === themeMode) return;
    track("theme_changed", { previous_theme: themeMode, theme: nextTheme });
    updateAnalyticsContext({ theme: nextTheme });
    setThemeMode(nextTheme);
  };
  const refreshPosttestProgress = async () => {
    try {
      const progress = await dataService.getPosttestProgress();
      setPosttestProgress(progress);
      setPosttestLoadError("");
      return progress;
    } catch (error) {
      setPosttestProgress(null);
      setPosttestLoadError(
        error instanceof Error ? error.message : "请检查网络后重试。 / Check your connection and try again.",
      );
      return null;
    }
  };
  useEffect(() => saveState(state), [state]);
  const analyticsPageId =
    state.screen === "intro"
      ? `home_${gatewaySection}`
      : state.screen === "storyEditor"
        ? (["icebreaker", "story_write", "story_analyzing", "story_confirmation"][state.storyEditorStep] ??
          "story_editor")
        : state.screen === "starLobby"
          ? "star_lobby"
          : state.screen;
  useEffect(() => {
    updateAnalyticsContext({ language: state.language, theme: themeMode, role: user?.role ?? null });
  }, [state.language, themeMode, user?.role]);
  useEffect(() => {
    if (!analyticsPageId.startsWith("home_") && (!sessionChecked || !user)) return;
    if (analyticsPageRef.current === analyticsPageId) return;
    analyticsPageRef.current = analyticsPageId;
    setAnalyticsPage(analyticsPageId, { language: state.language, theme: themeMode, role: user?.role ?? null });
    if (analyticsPageId === "home_intro") track("home_viewed", { gateway_section: gatewaySection });
    else if (analyticsPageId === "icebreaker") track("icebreaker_viewed");
    else if (analyticsPageId === "story_write") track("story_write_viewed", { draft_id: state.draft.id ?? null });
    else if (analyticsPageId === "story_confirmation")
      track("story_confirmation_viewed", { story_id: state.analysis?.id ?? null });
    else if (analyticsPageId === "resonance") track("resonance_page_viewed");
    else if (analyticsPageId === "recommendations") track("recommendation_page_viewed");
  }, [analyticsPageId, sessionChecked, user?.id]);
  useEffect(() => {
    let active = true;
    dataService
      .getCurrentUser()
      .then(async ({ user: currentUser }) => {
        if (!active) return;
        setUser(currentUser);
        let gate: PretestProgress;
        try {
          gate = await dataService.getPretestProgress();
        } catch (error) {
          if (!active) return;
          setAnalyticsCollectionMode("disabled");
          setPretestProgress(null);
          setPretestLoadError(error instanceof Error ? error.message : "请检查网络后重试。 / Please retry.");
          update({ screen: "pretest", accountScopeId: currentUser.id, isAdmin: currentUser.role === "admin" });
          setSessionChecked(true);
          return;
        }
        if (!active) return;
        setPretestProgress(gate);
        setPretestLoadError("");
        const gateBlocks = gate.required && gate.status !== "completed";
        if (gateBlocks) {
          setPosttestProgress(null);
          setPosttestLoadError("");
          setAnalyticsCollectionMode(gate.status === "in_progress" ? "authenticated" : "anonymous_only");
          update({ screen: "pretest", accountScopeId: currentUser.id, isAdmin: false });
          setSessionChecked(true);
          if (gate.status === "declined") {
            setAnalyticsCollectionMode("disabled");
            await dataService.logout().catch(() => undefined);
            if (active) setUser(null);
          }
          return;
        }
        setAnalyticsCollectionMode(currentUser.role === "admin" ? "disabled" : "authenticated");
        void refreshPosttestProgress();
        const [savedDraft, loadedStoryProgress, resonance, storyList, ownedStories, inbox, reactions] =
          await Promise.all([
            dataService.getCurrentDraft(),
            loadRecoverableStory(currentUser.id, state.accountScopeId, state.analysis?.id),
            dataService.getResonancePreferences(),
            dataService.listLobbyStories().then((items) => items.map((item) => item.story)),
            dataService.listOwnedStories(),
            dataService.listNotifications(),
            dataService.listReactions(),
          ]);
        if (!active) return;
        let storyProgress = loadedStoryProgress;
        if (directStoryRoute && state.storyEditorStep === 3 && !storyProgress) {
          const fallbackStory = pickStoryForDirectStoryPage(ownedStories);
          if (fallbackStory) storyProgress = await dataService.getStoryProgress(fallbackStory.id);
        }
        if (!active) return;
        setLocalStories(storyList);
        setOwnedStoryIds(ownedStories.map((story) => story.id));
        const hasSubmittedStory = ownedStories.some(
          (story) => story.status !== "draft" && story.status !== "analyzing" && story.status !== "needs_confirmation",
        );
        update((previous) => {
          const progressStep = storyProgress ? storyEditorStepForProgress(storyProgress.status) : null;
          const shouldOpenProgress =
            progressStep !== null && !(storyProgress?.status === "pending_review" && previous.screen === "starLobby");
          const requestedScreen =
            previous.screen === "pretest"
              ? authenticatedEntryScreen({
                  isSignup: false,
                  hasSavedDraft: Boolean(savedDraft),
                  hasPublishedStory: hasSubmittedStory,
                })
              : previous.screen;
          const firstStoryGuardedScreen = guardPostPublishScreenForFirstStory(requestedScreen, hasSubmittedStory);
          const experimentGuardedScreen = guardResonanceScreenForExperiment(
            firstStoryGuardedScreen,
            currentUser.resonanceExperimentCondition,
          );
          const screen = shouldOpenProgress
            ? "storyEditor"
            : guardBlankEditorAfterSubmission({
                screen: experimentGuardedScreen,
                hasSubmittedStory,
                hasDraftContent: Boolean(savedDraft?.title.trim() || savedDraft?.body.trim()),
                hasStoryProgress: Boolean(storyProgress),
                allowDirectStoryRoute: directStoryRoute,
              });
          const wasRedirectedToFirstStory = screen !== previous.screen && screen === "storyEditor";
          return {
            screen,
            accountScopeId: currentUser.id,
            hasCompletedFirstStory: hasSubmittedStory,
            ...(storyProgress
              ? {
                  draft: { ...initialState.draft, ...storyProgress.draft },
                  analysis: storyProgress.analysis,
                  ...(progressStep !== null
                    ? { storyEditorStep: progressStep }
                    : directStoryRoute
                      ? {
                          storyEditorStep: safeDirectStoryEditorStep({
                            requestedStep: previous.storyEditorStep,
                            hasDraftContent: Boolean(
                              storyProgress.draft.title.trim() || storyProgress.draft.body.trim(),
                            ),
                            hasAnalysis: true,
                          }),
                        }
                      : {}),
                }
              : savedDraft
                ? {
                    draft: { ...initialState.draft, ...savedDraft },
                    ...(directStoryRoute
                      ? {
                          storyEditorStep: safeDirectStoryEditorStep({
                            requestedStep: previous.storyEditorStep,
                            hasDraftContent: Boolean(savedDraft.title.trim() || savedDraft.body.trim()),
                            hasAnalysis: false,
                          }),
                        }
                      : {}),
                  }
                : {
                    draft: { ...initialState.draft, startedAt: Date.now() },
                    analysis: null,
                    ...(directStoryRoute
                      ? {
                          storyEditorStep: safeDirectStoryEditorStep({
                            requestedStep: previous.storyEditorStep,
                            hasDraftContent: false,
                            hasAnalysis: false,
                          }),
                        }
                      : wasRedirectedToFirstStory
                        ? { storyEditorStep: 0 as const }
                        : {}),
                  }),
            resonance,
            inbox,
            reactions,
            isAdmin: currentUser.role === "admin",
          };
        });
        setSessionChecked(true);
      })
      .catch(async () => {
        setAnalyticsCollectionMode("anonymous_only");
        const recovery = await loadRecoveryDraft().catch(() => undefined);
        if (!active) return;
        update((previous) => {
          const recoveredDraft = recovery?.body.trim() ? { ...initialState.draft, ...recovery } : previous.draft;
          return {
            ...(recovery?.body.trim() ? { draft: recoveredDraft } : {}),
            ...(directStoryRoute
              ? {
                  storyEditorStep: safeDirectStoryEditorStep({
                    requestedStep: previous.storyEditorStep,
                    hasDraftContent: Boolean(recoveredDraft.title.trim() || recoveredDraft.body.trim()),
                    hasAnalysis: Boolean(previous.analysis),
                  }),
                }
              : {}),
            ...(["pretest", "posttest", "resonance", "recommendations", "starLobby"].includes(previous.screen)
              ? { screen: "intro" as const }
              : {}),
          };
        });
        setSessionChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const draftContentKey = [
    state.draft.guide,
    state.draft.customGuide,
    state.draft.title,
    state.draft.body,
    state.draft.mood,
    state.draft.stage,
    state.draft.age,
    state.draft.gender,
    state.draft.city,
    state.draft.cityNameEn,
    state.draft.cityCountry,
    state.draft.cityLat,
    state.draft.cityLon,
    state.draft.people.join("|"),
  ].join("\u0000");
  useEffect(() => {
    if (!shouldAutosaveDraft(state.screen, state.storyEditorStep)) return;
    if (!state.draft.title.trim() && !state.draft.body.trim()) return;
    void saveRecoveryDraft(state.draft);
    if (!user) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      dataService
        .saveDraft(state.draft)
        .then((saved) => {
          if (cancelled) return;
          update((previous) => ({
            draft: {
              ...previous.draft,
              id: saved.id,
              version: saved.version,
              savedAt: saved.savedAt,
              saves: saved.saves,
            },
          }));
          track("story_autosaved", {
            draft_id: saved.id,
            version: saved.version,
            save_count: saved.saves,
            success: true,
          });
          void clearRecoveryDraft();
        })
        .catch(() => track("story_autosaved", { draft_id: state.draft.id ?? null, success: false }));
    }, 2000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draftContentKey, user?.id, state.screen, state.storyEditorStep]);
  useEffect(() => {
    const onPop = () => {
      const route = routePatchFromPath();
      poppingRef.current = true;
      setDirectStoryRoute(isStoryEditorRoute());
      if (route.gatewaySection) setGatewaySection(route.gatewaySection);
      if (route.authMode) setAuthMode(route.authMode);
      const { gatewaySection: _gatewaySection, authMode: _authMode, ...statePatch } = route;
      update(statePatch);
      if (statePatch.screen === "starLobby" && user) {
        void dataService
          .listLobbyStories()
          .then((items) => setLocalStories(items.map((item) => item.story)))
          .catch((error) => console.info("[StoryVerse] StarLobby could not be refreshed after navigation.", error));
      }
      lastPathRef.current = normalizedPath();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [user?.id]);
  useEffect(() => {
    const path = pathFromState(state);
    if (path === lastPathRef.current) {
      poppingRef.current = false;
      return;
    }
    const method = poppingRef.current ? "replaceState" : "pushState";
    window.history[method]({}, "", externalPath(path));
    lastPathRef.current = path;
    poppingRef.current = false;
  }, [state.screen, state.storyEditorStep, gatewaySection, authMode]);
  const goHome = () => {
    setDirectStoryRoute(false);
    setGatewaySection("intro");
    update({ screen: "intro" });
  };
  useEffect(() => {
    if (!sessionChecked) return;
    if (!user) {
      const mayShowDeclined = state.screen === "pretest" && pretestProgress?.status === "declined";
      if (!mayShowDeclined && !["intro", "admin"].includes(state.screen)) update({ screen: "intro" });
      return;
    }
    const gateBlocks = Boolean(
      pretestLoadError || (pretestProgress?.required && pretestProgress.status !== "completed"),
    );
    if (gateBlocks) {
      if (state.screen !== "pretest") update({ screen: "pretest" });
      return;
    }
    if (state.screen === "posttest") {
      if (posttestLoadError || !posttestProgress) return;
      if (!posttestProgress.required || posttestProgress.status === "completed") {
        setPosttestNotice(
          posttestProgress.status === "completed"
            ? "你已经填写过后测问卷，感谢参与！ / You have already completed the post-study questionnaire. Thank you!"
            : "此账号不需要填写后测问卷。 / This account does not require the post-study questionnaire.",
        );
        update({ screen: state.hasCompletedFirstStory ? "starLobby" : "storyEditor" });
        return;
      }
    }
    const firstStoryGuardedScreen = guardPostPublishScreenForFirstStory(state.screen, state.hasCompletedFirstStory);
    const experimentGuardedScreen = guardResonanceScreenForExperiment(
      firstStoryGuardedScreen,
      user.resonanceExperimentCondition,
    );
    const guardedScreen = guardBlankEditorAfterSubmission({
      screen: experimentGuardedScreen,
      hasSubmittedStory: state.hasCompletedFirstStory,
      hasDraftContent: Boolean(state.draft.title.trim() || state.draft.body.trim()),
      hasStoryProgress: Boolean(state.analysis),
      allowDirectStoryRoute: directStoryRoute,
    });
    if (guardedScreen === state.screen) return;
    update({ screen: user ? guardedScreen : "intro" });
  }, [
    sessionChecked,
    state.screen,
    user?.id,
    state.hasCompletedFirstStory,
    state.draft.title,
    state.draft.body,
    state.analysis?.id,
    directStoryRoute,
    pretestProgress?.required,
    pretestProgress?.status,
    pretestLoadError,
    posttestProgress?.required,
    posttestProgress?.status,
    posttestLoadError,
    user?.resonanceExperimentCondition,
  ]);
  const refreshLobbyStories = async () => {
    const items = await dataService.listLobbyStories();
    setLocalStories(items.map((item) => item.story));
    return items;
  };
  const enterStarLobby = () => {
    setDirectStoryRoute(false);
    if (!user) {
      goHome();
      return;
    }
    if (!state.hasCompletedFirstStory) {
      update({ screen: "storyEditor" });
      return;
    }
    update({ screen: "starLobby" });
    void refreshLobbyStories().catch((error) =>
      console.info("[StoryVerse] Recommendations could not be refreshed.", error),
    );
  };
  const continueAfterPendingReview = async (storyId: string) => {
    setOwnedStoryIds((previous) => (previous.includes(storyId) ? previous : [storyId, ...previous]));
    const [inbox, lobbyStories] = await Promise.all([
      dataService.listNotifications().catch(() => state.inbox),
      dataService.listLobbyStories().catch(() => null),
    ]);
    if (lobbyStories) setLocalStories(lobbyStories.map((item) => item.story));
    await clearRecoveryDraft().catch(() => undefined);
    update({
      hasCompletedFirstStory: true,
      screen: "starLobby",
      inbox,
    });
    track("pending_review_lobby_entered", { story_id: storyId });
    track("story_submit_result", { story_id: storyId, success: true, status: "pending_review" });
  };
  const publishStory = async (draft: StoryDraft, analysis: NonNullable<AppState["analysis"]>) => {
    const result = await dataService.publishStory(draft, analysis);
    if (result.requiresConfirmation && result.analysis) {
      update({ analysis: result.analysis, storyEditorStep: 3 });
      track("story_submit_result", {
        story_id: result.analysis.id ?? analysis.id,
        success: true,
        status: "needs_confirmation",
      });
      return;
    }
    const story = result.story;
    if (result.status === "pending_review") {
      setOwnedStoryIds((previous) => (previous.includes(story.id) ? previous : [story.id, ...previous]));
      const inbox = await dataService.listNotifications().catch(() => state.inbox);
      await clearRecoveryDraft().catch(() => undefined);
      update({
        hasCompletedFirstStory: true,
        screen: "storyEditor",
        storyEditorStep: 3,
        analysis: {
          ...analysis,
          id: story.id,
          workflowStatus: "pending_review",
          moderationDecision: "human_review",
        },
        inbox,
      });
      track("story_submit_result", { story_id: story.id, success: true, status: result.status });
      return;
    }
    if (result.status === "published") setLocalStories((previous) => [story, ...previous]);
    setOwnedStoryIds((previous) => [story.id, ...previous]);
    const inbox = await dataService.listNotifications().catch(() => state.inbox);
    await clearRecoveryDraft().catch(() => undefined);
    const nextScreen = screenAfterPublishedStory(user?.resonanceExperimentCondition ?? null);
    update({
      hasCompletedFirstStory: true,
      screen: nextScreen,
      analysis: { ...analysis, id: story.id, workflowStatus: result.status },
      inbox,
    });
    if (nextScreen === "starLobby") {
      void refreshLobbyStories().catch((error) =>
        console.info("[StoryVerse] Fixed-condition recommendations could not be refreshed.", error),
      );
    }
    track("story_submit_result", { story_id: story.id, success: true, status: result.status });
  };
  const completeAuth = async (input: GatewayAuthInput) => {
    let result: { user: UserProfile };
    let savedDraft: Awaited<ReturnType<typeof dataService.getCurrentDraft>> = null;
    let storyProgress: Awaited<ReturnType<typeof dataService.getStoryProgress>> = null;
    let resonance: AppState["resonance"] = state.resonance;
    let storyList: Story[] = [];
    let ownedStories: Story[] = [];
    let inbox: AppState["inbox"] = [];
    let reactions: AppState["reactions"] = {};

    track("auth_attempted", { mode: input.mode, account_length: input.accountIdentifier.trim().length });
    try {
      result =
        input.mode === "signup"
          ? await dataService.register({
              accountIdentifier: input.accountIdentifier,
              password: input.password,
              passwordConfirmation: input.passwordConfirmation,
              displayName: input.displayName,
              securityQuestion: input.securityQuestion,
              securityAnswer: input.securityAnswer,
            })
          : await dataService.login({ accountIdentifier: input.accountIdentifier, password: input.password });
    } catch (error) {
      track("auth_result", {
        mode: input.mode,
        success: false,
        error_code: error instanceof Error && "code" in error ? String(error.code) : "UNKNOWN",
      });
      throw error;
    }
    const signup = input.mode === "signup";
    setUser(result.user);
    updateAnalyticsContext({ role: result.user.role });
    track("auth_result", { mode: input.mode, success: true });
    let gate: PretestProgress;
    try {
      gate = await dataService.getPretestProgress();
    } catch (error) {
      setAnalyticsCollectionMode("disabled");
      setPretestProgress(null);
      setPosttestProgress(null);
      setPosttestLoadError("");
      setPretestLoadError(error instanceof Error ? error.message : "请检查网络后重试。 / Please retry.");
      setSessionChecked(true);
      update({ screen: "pretest", accountScopeId: result.user.id, isAdmin: result.user.role === "admin" });
      return;
    }
    setPretestProgress(gate);
    setPretestLoadError("");
    if (gate.required && gate.status !== "completed") {
      setPosttestProgress(null);
      setPosttestLoadError("");
      setAnalyticsCollectionMode(gate.status === "in_progress" ? "authenticated" : "anonymous_only");
      setSessionChecked(true);
      update({
        screen: "pretest",
        accountScopeId: result.user.id,
        isAdmin: false,
        ...(signup ? { tour: { enabled: true, seen: [] }, analysis: null, storyEditorStep: 0 as const } : {}),
      });
      if (gate.status === "declined") {
        setAnalyticsCollectionMode("disabled");
        await dataService.logout().catch(() => undefined);
        setUser(null);
      }
      return;
    }
    setAnalyticsCollectionMode(result.user.role === "admin" ? "disabled" : "authenticated");
    void refreshPosttestProgress();
    [savedDraft, storyProgress, resonance, storyList, ownedStories, inbox, reactions] = await Promise.all([
      dataService.getCurrentDraft(),
      loadRecoverableStory(result.user.id, signup ? "" : state.accountScopeId, signup ? undefined : state.analysis?.id),
      dataService.getResonancePreferences(),
      dataService.listLobbyStories().then((items) => items.map((item) => item.story)),
      dataService.listOwnedStories(),
      dataService.listNotifications(),
      dataService.listReactions(),
    ]);
    setSessionChecked(true);
    setLocalStories(storyList);
    setOwnedStoryIds(ownedStories.map((story) => story.id));
    /*
     * 注册 ＝ 全新账号：重开新手引导，并强制回到第一步。
     * 不重置的话，浏览器里残留的 tour.enabled=false / hasCompletedFirstStory=true
     * 会让新注册的人看不到引导、或者直接掉进星空大厅 —— 而大厅按设计是最后一站。
     * 登录保持原逻辑（有本地草稿就续写）。
     */
    const hasSubmittedStory = ownedStories.some(
      (story) => story.status !== "draft" && story.status !== "analyzing" && story.status !== "needs_confirmation",
    );
    const progressStep = storyProgress ? storyEditorStepForProgress(storyProgress.status) : null;
    const screen =
      progressStep !== null
        ? "storyEditor"
        : authenticatedEntryScreen({
            isSignup: signup,
            hasSavedDraft: Boolean(savedDraft),
            hasPublishedStory: hasSubmittedStory,
          });
    const startsBlankFirstStory = screen === "storyEditor" && !savedDraft;
    update({
      screen,
      accountScopeId: result.user.id,
      hasCompletedFirstStory: hasSubmittedStory,
      ...(storyProgress
        ? {
            draft: { ...initialState.draft, ...storyProgress.draft },
            analysis: storyProgress.analysis,
            ...(progressStep !== null ? { storyEditorStep: progressStep } : {}),
          }
        : savedDraft
          ? { draft: { ...initialState.draft, ...savedDraft } }
          : {
              draft: { ...initialState.draft, startedAt: Date.now() },
              analysis: null,
              ...(startsBlankFirstStory ? { storyEditorStep: 0 as const } : {}),
            }),
      ...(signup ? { tour: { enabled: true, seen: [] }, analysis: null, storyEditorStep: 0 } : {}),
      resonance,
      inbox,
      reactions,
      isAdmin: result.user.role === "admin",
    });
  };

  const retryPretest = async () => {
    if (!user) return;
    setPretestLoadError("");
    try {
      const gate = await dataService.getPretestProgress();
      setPretestProgress(gate);
      if (!gate.required || gate.status === "completed") {
        setAnalyticsCollectionMode(user.role === "admin" ? "disabled" : "authenticated");
        window.location.reload();
        return;
      }
      if (gate.status === "declined") {
        setAnalyticsCollectionMode("disabled");
        await dataService.logout().catch(() => undefined);
        setUser(null);
        return;
      }
      setAnalyticsCollectionMode(gate.status === "in_progress" ? "authenticated" : "anonymous_only");
    } catch (error) {
      setAnalyticsCollectionMode("disabled");
      setPretestLoadError(error instanceof Error ? error.message : "请检查网络后重试。 / Please retry.");
    }
  };

  const savePretestStep = async (step: 1 | 2 | 3 | 4, answers: Parameters<typeof dataService.savePretestStep>[1]) => {
    const saved = await dataService.savePretestStep(step, answers);
    setPretestProgress(saved);
    setPretestLoadError("");
    if (step === 1) setAnalyticsCollectionMode("authenticated");
    return saved;
  };

  const finishPretest = async (answers: Parameters<typeof dataService.submitPretest>[0]) => {
    if (!user) throw new Error("登录状态已失效，请重新登录。 / Your session has expired.");
    const completed = await dataService.submitPretest(answers);
    setPretestProgress(completed);
    setPretestLoadError("");
    setAnalyticsCollectionMode("authenticated");
    void refreshPosttestProgress();
    const [savedDraft, storyProgress, resonance, storyList, ownedStories, inbox, reactions] = await Promise.all([
      dataService.getCurrentDraft(),
      loadRecoverableStory(user.id, state.accountScopeId, state.analysis?.id),
      dataService.getResonancePreferences(),
      dataService.listLobbyStories().then((items) => items.map((item) => item.story)),
      dataService.listOwnedStories(),
      dataService.listNotifications(),
      dataService.listReactions(),
    ]);
    setLocalStories(storyList);
    setOwnedStoryIds(ownedStories.map((story) => story.id));
    const hasSubmittedStory = ownedStories.some(
      (story) => story.status !== "draft" && story.status !== "analyzing" && story.status !== "needs_confirmation",
    );
    const progressStep = storyProgress ? storyEditorStepForProgress(storyProgress.status) : null;
    update({
      screen:
        progressStep !== null
          ? "storyEditor"
          : authenticatedEntryScreen({
              isSignup: !savedDraft && !hasSubmittedStory,
              hasSavedDraft: Boolean(savedDraft),
              hasPublishedStory: hasSubmittedStory,
            }),
      accountScopeId: user.id,
      hasCompletedFirstStory: hasSubmittedStory,
      storyEditorStep: progressStep ?? 0,
      draft: storyProgress
        ? { ...initialState.draft, ...storyProgress.draft }
        : savedDraft
          ? { ...initialState.draft, ...savedDraft }
          : { ...initialState.draft, startedAt: Date.now() },
      analysis: storyProgress?.analysis ?? null,
      resonance,
      inbox,
      reactions,
      isAdmin: false,
      tour: { enabled: true, seen: [] },
    });
  };

  const declinePretest = async () => {
    const declinedProgress = await dataService.declinePretest();
    setPretestProgress(declinedProgress);
    setAnalyticsCollectionMode("disabled");
    await dataService.logout();
    setUser(null);
    setPosttestProgress(null);
    setPosttestLoadError("");
    updateAnalyticsContext({ role: null });
  };

  const retryPosttest = async () => {
    await refreshPosttestProgress();
  };

  const savePosttestStep = async (step: PosttestStep, answers: Parameters<typeof dataService.savePosttestStep>[1]) => {
    const saved = await dataService.savePosttestStep(step, answers);
    setPosttestProgress(saved);
    setPosttestLoadError("");
    return saved;
  };

  const finishPosttest = async (answers: Parameters<typeof dataService.submitPosttest>[0]) => {
    const completed = await dataService.submitPosttest(answers);
    setPosttestProgress(completed);
    setPosttestLoadError("");
    setPosttestNotice("感谢你完成最后一份问卷！ / Thank you for completing the final questionnaire!");
    enterStarLobby();
  };

  const dismissPosttestReminder = async () => {
    const optimisticTime = new Date().toISOString();
    setPosttestProgress((current) =>
      current ? { ...current, reminderDismissedAt: current.reminderDismissedAt ?? optimisticTime } : current,
    );
    try {
      const progress = await dataService.dismissPosttestReminder();
      setPosttestProgress(progress);
      setPosttestLoadError("");
    } catch (error) {
      console.info("[StoryVerse] Post-study reminder dismissal could not be saved.", error);
    }
  };

  const openPosttest = () => {
    void dismissPosttestReminder();
    update({ screen: "posttest" });
  };

  /*
   * 新手引导的调度。每个场景只在「引导还开着」且「这个场景没播过」时出现，
   * 所以用户往回退一步不会被同一段引导再拦一次。
   *
   * 「跳过本页」只把当前场景标记成看过，后面的页面照常播 —— 在第一步嫌啰嗦
   * 而跳过，不该连带失去后面所有页面的引导。整条引导只在走完最后一站
   * （星空大厅）时才真正关闭。
   */
  const tourSeen = (scene: TourSceneId) => state.tour.seen.includes(scene);
  const tourActive = (scene: TourSceneId) => state.tour.enabled && !tourSeen(scene);
  const markSeen = (previous: AppState, scene: TourSceneId, done: boolean) => ({
    tour: {
      enabled: done ? false : previous.tour.enabled,
      seen: previous.tour.seen.includes(scene) ? previous.tour.seen : [...previous.tour.seen, scene],
    },
  });
  // 大厅是流程的最后一站，走完＝整条引导结束
  const finishTour = (scene: TourSceneId) => update((previous) => markSeen(previous, scene, scene === "starLobby"));
  const skipTour = (scene: TourSceneId) => update((previous) => markSeen(previous, scene, false));

  let content: ReactNode;
  if (!sessionChecked && state.screen !== "intro") {
    content = <PageLoadingFallback themeMode={themeMode} language={state.language} />;
  } else if (state.screen === "pretest") {
    content = (
      <PreTestPage
        progress={pretestProgress}
        loadError={pretestLoadError}
        displayName={user?.displayName ?? ""}
        language={state.language}
        themeMode={themeMode}
        onLanguageChange={changeLanguage}
        onThemeModeChange={changeThemeMode}
        onRetry={retryPretest}
        onSave={savePretestStep}
        onSubmit={finishPretest}
        onDecline={declinePretest}
      />
    );
  } else if (state.screen === "posttest") {
    content = (
      <PostTestPage
        progress={posttestProgress}
        loadError={posttestLoadError}
        displayName={user?.displayName ?? ""}
        language={state.language}
        themeMode={themeMode}
        onLanguageChange={changeLanguage}
        onThemeModeChange={changeThemeMode}
        onRetry={retryPosttest}
        onSave={savePosttestStep}
        onSubmit={finishPosttest}
        onBack={enterStarLobby}
      />
    );
  } else if (state.screen === "admin") {
    content =
      state.isAdmin && user?.role === "admin" ? (
        <AdminConsole
          language={state.language}
          themeMode={themeMode}
          displayName={user.displayName}
          onLogout={() => {
            void dataService.logout().finally(() => {
              setAnalyticsCollectionMode("anonymous_only");
              setUser(null);
              setPretestProgress(null);
              setPosttestProgress(null);
              setPosttestLoadError("");
              update({
                isAdmin: false,
                inbox: [],
                reactions: {},
                accountScopeId: "",
                draft: { ...initialState.draft, startedAt: Date.now() },
                analysis: null,
              });
            });
          }}
          onLanguageChange={changeLanguage}
          onThemeModeChange={changeThemeMode}
        />
      ) : (
        <AdminGate
          language={state.language}
          themeMode={themeMode}
          onBack={() => update({ screen: "intro" })}
          onSignedIn={() => {
            void dataService.getCurrentUser().then(({ user: adminUser }) => {
              setUser(adminUser);
              update({ isAdmin: adminUser.role === "admin" });
            });
          }}
          onThemeModeChange={setThemeMode}
        />
      );
  } else if (state.screen === "intro") {
    content = (
      <Gateway
        language={state.language}
        onLanguageChange={changeLanguage}
        onHome={goHome}
        onComplete={completeAuth}
        section={gatewaySection}
        authMode={authMode}
        onAuthModeChange={setAuthMode}
        onSectionChange={setGatewaySection}
        themeMode={themeMode}
        onThemeModeChange={changeThemeMode}
      />
    );
  } else if (state.screen === "storyEditor")
    content = (
      <StoryEditor
        state={state}
        displayName={user?.displayName ?? ""}
        update={update}
        onPublished={publishStory}
        onPendingReview={continueAfterPendingReview}
        onHome={goHome}
        themeMode={themeMode}
        onThemeModeChange={changeThemeMode}
        tourActive={tourActive}
        onTourFinish={finishTour}
        onTourSkip={skipTour}
      />
    );
  else if (state.screen === "resonance" && !user?.resonanceExperimentCondition)
    content = (
      <ResonancePage
        state={state}
        displayName={user?.displayName ?? ""}
        update={update}
        onBack={() => update({ screen: "storyEditor", storyEditorStep: 3 })}
        onContinue={async () => {
          await dataService
            .saveResonancePreferences(state.resonance)
            .catch((error) => console.info("[StoryVerse] Resonance could not be saved.", error));
          enterStarLobby();
        }}
        onHome={goHome}
        themeMode={themeMode}
        onThemeModeChange={changeThemeMode}
        tourActive={tourActive}
        onTourFinish={finishTour}
        onTourSkip={skipTour}
      />
    );
  else if (state.screen === "recommendations")
    content = (
      <RecommendationsPage
        state={state}
        displayName={user?.displayName ?? ""}
        update={update}
        onEnterStarLobby={enterStarLobby}
        onHome={goHome}
        themeMode={themeMode}
        onThemeModeChange={changeThemeMode}
      />
    );
  else
    content = (
      <StarLobby
        language={state.language}
        displayName={user?.displayName ?? ""}
        themeMode={themeMode}
        onLanguageChange={changeLanguage}
        onThemeModeChange={changeThemeMode}
        onHome={goHome}
        onLogout={() => {
          void dataService.logout().finally(() => {
            setAnalyticsCollectionMode("anonymous_only");
            setUser(null);
            setPretestProgress(null);
            setPosttestProgress(null);
            setPosttestLoadError("");
            setSessionChecked(true);
            setLocalStories([]);
            setOwnedStoryIds([]);
            setGatewaySection("intro");
            update({
              screen: "intro",
              inbox: [],
              reactions: {},
              isAdmin: false,
              accountScopeId: "",
              hasCompletedFirstStory: false,
              draft: { ...initialState.draft, startedAt: Date.now() },
              analysis: null,
            });
          });
        }}
        resonance={state.resonance}
        resonanceLocked={Boolean(user?.resonanceExperimentCondition)}
        onResonanceChange={
          user?.resonanceExperimentCondition
            ? undefined
            : async (resonance) => {
                await dataService.saveResonancePreferences(resonance);
                const items = await refreshLobbyStories();
                update({ resonance });
                return {
                  batchId: items.find((item) => item.story.recommendationBatchId)?.story.recommendationBatchId,
                  storyCount: items.length,
                };
              }
        }
        stories={localStories}
        ownedStoryIds={ownedStoryIds}
        reactions={state.reactions}
        onReactionChange={async (storyId, reaction) => {
          const previousReaction = state.reactions[storyId] ?? null;
          update((previous) => ({ reactions: { ...previous.reactions, [storyId]: reaction } }));
          try {
            await (reaction ? dataService.setReaction(storyId, reaction) : dataService.clearReaction(storyId));
            track("story_reaction_result", { story_id: storyId, reaction, success: true, source: "star_lobby" });
          } catch (error) {
            update((previous) => ({ reactions: { ...previous.reactions, [storyId]: previousReaction } }));
            track("story_reaction_result", {
              story_id: storyId,
              reaction,
              success: false,
              source: "star_lobby",
              error_code: error instanceof Error && "code" in error ? String(error.code) : "UNKNOWN",
            });
            throw error;
          }
        }}
        onReportStory={(storyId, reason, note) => {
          return dataService.createReport(storyId, reason, note).then(() => undefined);
        }}
        showTour={tourActive("starLobby")}
        onTourFinish={() => finishTour("starLobby")}
        onTourSkip={() => skipTour("starLobby")}
        posttestAvailable={Boolean(
          user?.role === "user" && pretestProgress?.required && pretestProgress.status === "completed",
        )}
        posttestStatus={posttestProgress?.status ?? "not_started"}
        showPosttestReminder={Boolean(
          user?.role === "user" &&
          pretestProgress?.required &&
          pretestProgress.status === "completed" &&
          posttestProgress?.status !== "completed" &&
          !posttestProgress?.reminderDismissedAt &&
          !tourActive("starLobby"),
        )}
        posttestNotice={posttestNotice}
        onPosttestOpen={openPosttest}
        onPosttestReminderDismiss={() => void dismissPosttestReminder()}
        onPosttestNoticeConsumed={() => setPosttestNotice("")}
        removedStoryIds={[]}
        inbox={state.inbox}
        onMarkInboxRead={() => {
          void dataService.markNotificationsRead();
          update((previous) => ({ inbox: previous.inbox.map((m) => ({ ...m, read: true })) }));
        }}
        onDisplayNameChange={(displayName) => {
          setUser((previous) => (previous ? { ...previous, displayName } : previous));
        }}
      />
    );

  return (
    <Suspense fallback={<PageLoadingFallback themeMode={themeMode} language={state.language} />}>{content}</Suspense>
  );
}
