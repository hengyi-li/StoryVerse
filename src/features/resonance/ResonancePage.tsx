import { ArrowLeft } from "lucide-react";
import { LanguageSelect, AppLogo, PrimaryButton, ThemeToggle } from "../../components/AppControls";
import { AuthenticatedGreeting } from "../../components/AuthenticatedGreeting";
import { uiCopy as copy } from "../../data/interface-content";
import type { AppState, ResonanceMode } from "../../types/domain";
import type { AppUpdate, ThemeMode } from "../../types/ui";
import { Tour } from "../tour/Tour";
import type { TourCallbacks } from "../tour/tour-types";
import { track } from "../../lib/analytics";

export function ResonancePage({
  state,
  displayName,
  update,
  onBack,
  onContinue,
  onHome,
  themeMode,
  onThemeModeChange,
  tourActive,
  onTourFinish,
  onTourSkip,
}: {
  state: AppState;
  displayName: string;
  update: AppUpdate;
  onBack: () => void;
  onContinue: () => void;
  onHome: () => void;
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
} & TourCallbacks) {
  const text = copy[state.language];
  const dimensions = [
    {
      key: "city" as const,
      title: state.language === "zh" ? "城市" : "City",
      icon: "⌖",
      similar: state.language === "zh" ? "和你故事发生的城市相同或相近" : "Meet stories from the same or nearby city",
      different: state.language === "zh" ? "去看更远城市里的故事" : "See stories from farther cities",
    },
    {
      key: "stage" as const,
      title: state.language === "zh" ? "人生背景" : "Life background",
      icon: "◷",
      similar:
        state.language === "zh"
          ? "看看年龄、人生阶段和性别背景相近的人如何走过"
          : "See stories from people with a similar age, life stage, and gender background",
      different:
        state.language === "zh"
          ? "听见年龄、人生阶段或性别背景不同的声音"
          : "Hear voices from a different age, life stage, or gender background",
    },
    {
      key: "theme" as const,
      title: state.language === "zh" ? "主题" : "Theme",
      icon: "✦",
      similar: state.language === "zh" ? "从熟悉的话题继续深入" : "Go deeper from a familiar theme",
      different: state.language === "zh" ? "从新的主题打开另一扇门" : "Open a door through a new theme",
    },
  ];
  const setMode = (key: keyof AppState["resonance"], mode: ResonanceMode) => {
    track("resonance_dimension_clicked", {
      dimension: key,
      previous_mode: state.resonance[key],
      mode,
      changed: state.resonance[key] !== mode,
    });
    update({ resonance: { ...state.resonance, [key]: mode } });
  };
  return (
    <main className={`resonance-page ${themeMode === "night" ? "theme-night" : ""}`}>
      <header className="topbar app-shell-header">
        <AppLogo onClick={onHome} language={state.language} />
        <div className="topbar-actions">
          <button className="button button-ghost mini" onClick={onBack}>
            <ArrowLeft size={16} /> <span className="back-label">{text.backToTraits}</span>
          </button>
          <ThemeToggle language={state.language} themeMode={themeMode} onChange={onThemeModeChange} />
          <LanguageSelect
            language={state.language}
            onChange={(language) => {
              track("language_changed", { previous_language: state.language, language });
              update({ language });
            }}
          />
          <AuthenticatedGreeting displayName={displayName} language={state.language} />
        </div>
      </header>
      <section className="resonance-hero">
        <div>
          <p className="eyebrow">{state.language === "zh" ? "你的故事已经成为一颗星星" : "Your story is now a star"}</p>
          <h1>{text.resonanceTitle}</h1>
          {text.resonanceSub && <p>{text.resonanceSub}</p>}
        </div>
        <div className="new-star">
          <i />
          <span>{text.yourStar}</span>
          <small>
            {state.draft.city || text.unknownCity} · {state.draft.title || state.analysis?.suggestedTitle}
          </small>
        </div>
      </section>
      <section className="dimension-grid">
        {dimensions.map((dim) => (
          <article key={dim.key} className="dimension-card">
            <div className="dimension-title">
              <span>{dim.icon}</span>
              <div>
                <small>{text.dimension}</small>
                <h2>{dim.title}</h2>
              </div>
            </div>
            <div className="mode-picker">
              <button
                className={state.resonance[dim.key] === "similar" ? "selected" : ""}
                onClick={() => setMode(dim.key, "similar")}
              >
                <span>≈</span>
                <b>{text.similar}</b>
                <small>{dim.similar}</small>
              </button>
              <button
                className={state.resonance[dim.key] === "different" ? "selected" : ""}
                onClick={() => setMode(dim.key, "different")}
              >
                <span>↗</span>
                <b>{text.different}</b>
                <small>{dim.different}</small>
              </button>
            </div>
          </article>
        ))}
      </section>
      <div className="resonance-action">
        <PrimaryButton
          onClick={() => {
            track("resonance_confirm_clicked", {
              source: "onboarding",
              preferences: state.resonance,
              changed_dimensions: ["city", "stage", "theme"],
            });
            onContinue();
          }}
        >
          {text.findStories}
        </PrimaryButton>
        <small>
          {state.language === "zh" ? "随时可以在主页修改" : "You can adjust this anytime on the home page."}
        </small>
      </div>
      {/* 引导的最后一站：走完这里整条引导就结束（见 App 里的 finishTour） */}
      {tourActive("resonance") && (
        <Tour scene="resonance" language={state.language} onFinish={onTourFinish} onSkip={onTourSkip} />
      )}
    </main>
  );
}
