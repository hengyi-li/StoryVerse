import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RefreshCw } from "lucide-react";
import { AppLogo, LanguageSelect, ThemeToggle } from "../../components/AppControls";
import { AuthenticatedGreeting } from "../../components/AuthenticatedGreeting";
import { track } from "../../lib/analytics";
import type { Language, PosttestAnswers, PosttestProgress, PosttestScore, PosttestStep } from "../../types/domain";
import type { ThemeMode } from "../../types/ui";
import { missingPosttestItems, posttestScale, posttestSections } from "./posttest-content";
import "./posttest.css";

type Props = {
  progress: PosttestProgress | null;
  loadError?: string;
  displayName: string;
  language: Language;
  themeMode: ThemeMode;
  onLanguageChange: (language: Language) => void;
  onThemeModeChange: (theme: ThemeMode) => void;
  onRetry: () => Promise<void>;
  onSave: (step: PosttestStep, answers: PosttestAnswers) => Promise<PosttestProgress>;
  onSubmit: (answers: PosttestAnswers) => Promise<void>;
  onBack: () => void;
};

function StateCard({
  themeMode,
  loadError,
  busy,
  onRetry,
  onBack,
}: {
  themeMode: ThemeMode;
  loadError?: string;
  busy: boolean;
  onRetry: () => Promise<void>;
  onBack: () => void;
}) {
  return (
    <main className={`posttest-page theme-${themeMode}`}>
      <section className="posttest-state-card" role="alert">
        <span aria-hidden="true">✦</span>
        <h1>暂时无法打开后测问卷</h1>
        <h2>The post-study questionnaire is temporarily unavailable</h2>
        <p>{loadError || "请检查网络后重试。 / Check your connection and try again."}</p>
        <div>
          <button type="button" className="is-secondary" onClick={onBack}>
            <ArrowLeft size={17} /> 返回星空大厅 / Back to StarLobby
          </button>
          <button type="button" onClick={() => void onRetry()} disabled={busy}>
            <RefreshCw size={17} /> {busy ? "正在重试… / Retrying…" : "重新尝试 / Retry"}
          </button>
        </div>
      </section>
    </main>
  );
}

export function PostTestPage({
  progress,
  loadError,
  displayName,
  language,
  themeMode,
  onLanguageChange,
  onThemeModeChange,
  onRetry,
  onSave,
  onSubmit,
  onBack,
}: Props) {
  const [step, setStep] = useState<PosttestStep>(progress?.currentStep ?? 1);
  const [answers, setAnswers] = useState<PosttestAnswers>(progress?.answers ?? {});
  const [invalidIds, setInvalidIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState("");
  const viewedStep = useRef<PosttestStep | null>(null);
  const stepStartedAt = useRef(performance.now());

  useEffect(() => {
    if (!progress) return;
    setStep(progress.currentStep);
    setAnswers(progress.answers ?? {});
  }, [progress?.currentStep, progress?.status]);

  useEffect(() => {
    if (viewedStep.current === step) return;
    viewedStep.current = step;
    stepStartedAt.current = performance.now();
    track("posttest_step_viewed", {
      questionnaire_version: "posttest_v1",
      step,
      status: progress?.status ?? "not_started",
      answered_count: Object.keys(answers).length,
    });
  }, [step]);

  const section = posttestSections[step - 1];

  const selectScore = (itemId: string, score: PosttestScore) => {
    setAnswers((current) => ({ ...current, [itemId]: score }));
    setInvalidIds((current) => current.filter((id) => id !== itemId));
    setRequestError("");
  };

  const showMissing = (missing: string[]) => {
    setInvalidIds(missing);
    track("posttest_validation_blocked", {
      questionnaire_version: "posttest_v1",
      step,
      missing_count: missing.length,
      answered_count: section.items.length - missing.length,
    });
    window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-posttest-item="${missing[0]}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.querySelector<HTMLElement>("input")?.focus();
    });
  };

  const continueStep = async () => {
    const missing = missingPosttestItems(step, answers);
    if (missing.length) {
      showMissing(missing);
      return;
    }
    setBusy(true);
    setRequestError("");
    try {
      if (step === 5) {
        await onSubmit(answers);
        track("posttest_submitted", {
          questionnaire_version: "posttest_v1",
          step,
          answer_count: Object.keys(answers).length,
          step_duration_ms: Math.round(performance.now() - stepStartedAt.current),
        });
        return;
      }
      await onSave(step, answers);
      track("posttest_step_saved", {
        questionnaire_version: "posttest_v1",
        step,
        answer_count: Object.keys(answers).length,
        step_duration_ms: Math.round(performance.now() - stepStartedAt.current),
      });
      setStep((step + 1) as PosttestStep);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "暂时无法保存，请稍后重试。 / Your responses could not be saved. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };

  if (loadError || !progress) {
    return <StateCard themeMode={themeMode} loadError={loadError} busy={busy} onRetry={retry} onBack={onBack} />;
  }

  return (
    <main className={`posttest-page theme-${themeMode}`}>
      <header className="posttest-header">
        <AppLogo compact inverted={themeMode === "night"} />
        <div className="posttest-header-tools">
          <ThemeToggle language={language} themeMode={themeMode} onChange={onThemeModeChange} />
          <LanguageSelect language={language} onChange={onLanguageChange} />
          <AuthenticatedGreeting displayName={displayName} language={language} />
        </div>
      </header>

      <div className="posttest-layout">
        <aside className="posttest-sidebar" aria-label="问卷进度 / Questionnaire progress">
          <p>POST-STUDY · 后测问卷</p>
          <h1>感谢体验 StoryVerse</h1>
          <h2>Thank you for trying StoryVerse</h2>
          <p className="posttest-intro">
            请根据刚才的实际使用体验完成问卷。问卷没有标准答案，请根据您的真实感受作答。
            <span>
              Please complete this questionnaire based on your experience. There are no right or wrong answers.
            </span>
          </p>
          <ol>
            {posttestSections.map((item) => (
              <li
                key={item.step}
                className={item.step === step ? "current" : item.step < step ? "done" : ""}
                aria-label={`${item.titleZh} / ${item.titleEn}`}
              >
                <span>{item.step < step ? <Check size={15} /> : item.step}</span>
              </li>
            ))}
          </ol>
          <p className="posttest-sidebar-note">约 8 分钟 · Approximately 8 minutes</p>
        </aside>

        <section className="posttest-form-card" aria-labelledby="posttest-step-title">
          <div className="posttest-progress" aria-hidden="true">
            <span style={{ width: `${step * 20}%` }} />
          </div>
          <header className="posttest-step-heading">
            <span>
              第 {step}/5 部分 · Part {step} of 5
            </span>
            <h2 id="posttest-step-title" className="posttest-visually-hidden">
              {section.titleZh} / {section.titleEn}
            </h2>
            <div className="posttest-scale-explanation">
              <p>请根据您在系统中的实际体验，如实回答以下问题。每道题均为必答。</p>
              <p>Please answer every item based on your actual experience with the system.</p>
              <small>1 = 非常不同意 / Strongly Disagree · 5 = 非常同意 / Strongly Agree</small>
            </div>
          </header>

          <div className="posttest-matrix">
            {section.items.map((item, index) => {
              const invalid = invalidIds.includes(item.id);
              return (
                <fieldset
                  key={item.id}
                  className={`posttest-item ${invalid ? "has-error" : ""}`}
                  data-posttest-item={item.id}
                >
                  <legend>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <span lang="zh-CN">{item.zh}</span>
                    <small lang="en">{item.en}</small>
                  </legend>
                  <div className="posttest-score-options">
                    {posttestScale.map((option) => (
                      <label key={option.value} className={answers[item.id] === option.value ? "selected" : ""}>
                        <input
                          type="radio"
                          name={item.id}
                          value={option.value}
                          checked={answers[item.id] === option.value}
                          onChange={() => selectScore(item.id, option.value)}
                        />
                        <b>{option.value}</b>
                        {(option.value === 1 || option.value === 5) && (
                          <small>
                            {option.zh}
                            <i>{option.en}</i>
                          </small>
                        )}
                      </label>
                    ))}
                  </div>
                  {invalid && <p role="alert">请选择一个分值。 / Please select a score.</p>}
                </fieldset>
              );
            })}
          </div>

          {requestError && (
            <p className="posttest-request-error" role="alert">
              {requestError}
            </p>
          )}
          <footer className="posttest-form-actions">
            <div>
              <button type="button" className="posttest-exit-button" onClick={onBack} disabled={busy}>
                返回星空大厅 / Back to StarLobby
              </button>
              {step > 1 && (
                <button
                  type="button"
                  className="posttest-back-button"
                  onClick={() => setStep((step - 1) as PosttestStep)}
                  disabled={busy}
                >
                  <ArrowLeft size={18} /> 上一步 / Previous
                </button>
              )}
            </div>
            <button type="button" className="posttest-next-button" onClick={() => void continueStep()} disabled={busy}>
              {busy ? "正在保存… / Saving…" : step === 5 ? "提交问卷 / Submit" : "下一步 / Next"}
              {!busy && <ArrowRight size={18} />}
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}
