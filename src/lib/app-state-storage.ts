import { emptyDraft } from "../data/story-content";
import type { AppState, ScreenId, StoryAnalysis, StoryEditorStep, TourSceneId } from "../types/domain";

const APP_STATE_STORAGE_KEY = "storyverse.preferences.v2";

export const initialState: AppState = {
  language: "zh",
  accountScopeId: "",
  hasCompletedFirstStory: false,
  screen: "intro",
  storyEditorStep: 0,
  openedRecommendationStoryIds: [],
  resonance: { city: "similar", stage: "different", theme: "similar" },
  reactions: {},
  draft: emptyDraft,
  analysis: null,
  // 首次访问：localStorage 里没有记录，enabled 保持 true，引导就会自动播放
  tour: { enabled: true, seen: [] },
  inbox: [],
  isAdmin: false,
};

type StoredAppState = Partial<
  Omit<
    AppState,
    "screen" | "storyEditorStep" | "openedRecommendationStoryIds" | "tour" | "reactions" | "inbox" | "isAdmin"
  >
> & {
  screen?: string;
  storyEditorStep?: number;
  openedRecommendationStoryIds?: string[];
  tour?: { enabled?: boolean; seen?: string[] };
};

const validScreens: ScreenId[] = [
  "intro",
  "pretest",
  "posttest",
  "storyEditor",
  "resonance",
  "recommendations",
  "starLobby",
  "admin",
];
const validTourScenes: TourSceneId[] = ["starLobby", "guide", "collection", "confirm", "resonance"];

function normalizeScreen(screen: string | undefined): ScreenId {
  return validScreens.includes(screen as ScreenId) ? (screen as ScreenId) : "intro";
}

function normalizeStoryEditorStep(step: number | undefined): StoryEditorStep {
  return step === 1 || step === 2 || step === 3 ? step : 0;
}

function normalizeTourScenes(scenes: string[] | undefined): TourSceneId[] {
  return Array.from(
    new Set((scenes ?? []).filter((scene): scene is TourSceneId => validTourScenes.includes(scene as TourSceneId))),
  );
}

function normalizeStoryAnalysis(analysis: StoryAnalysis | null | undefined): StoryAnalysis | null {
  if (!analysis) return null;
  return {
    ...analysis,
    tags: {
      topics: analysis.tags.topics ?? [],
      emotions: analysis.tags.emotions ?? [],
      meanings: analysis.tags.meanings ?? [],
      perspectives: analysis.tags.perspectives ?? [],
    },
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(APP_STATE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as StoredAppState) : null;
    return parsed
      ? {
          language: parsed.language ?? initialState.language,
          accountScopeId: parsed.accountScopeId ?? initialState.accountScopeId,
          hasCompletedFirstStory: parsed.hasCompletedFirstStory ?? initialState.hasCompletedFirstStory,
          screen: normalizeScreen(parsed.screen),
          storyEditorStep: normalizeStoryEditorStep(parsed.storyEditorStep),
          openedRecommendationStoryIds: parsed.openedRecommendationStoryIds ?? [],
          draft: {
            ...initialState.draft,
            ...(parsed.draft ?? {}),
            cityNameEn: parsed.draft?.cityNameEn || "",
          },
          resonance: { ...initialState.resonance, ...(parsed.resonance ?? {}) },
          reactions: {},
          analysis: normalizeStoryAnalysis(parsed.analysis),
          tour: {
            enabled: parsed.tour?.enabled ?? initialState.tour.enabled,
            seen: normalizeTourScenes(parsed.tour?.seen),
          },
          inbox: [],
          isAdmin: false,
        }
      : initialState;
  } catch {
    return initialState;
  }
}

export function saveState(state: AppState) {
  try {
    const { reactions: _reactions, inbox: _inbox, isAdmin: _isAdmin, ...safeState } = state;
    localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(safeState));
  } catch {
    // Storage may be unavailable or full; the current page remains usable.
  }
}
