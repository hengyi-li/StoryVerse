import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RefreshCw } from "lucide-react";
import { AppLogo, LanguageSelect, ThemeToggle } from "../../components/AppControls";
import { AuthenticatedGreeting } from "../../components/AuthenticatedGreeting";
import { track } from "../../lib/analytics";
import type { Language, PretestAnswers, PretestProgress, PretestStep } from "../../types/domain";
import type { ThemeMode } from "../../types/ui";
import previewOne960 from "../../assets/storyverse1-960.webp";
import previewOne1600 from "../../assets/storyverse1-1600.webp";
import previewTwo960 from "../../assets/storyverse2-960.webp";
import previewTwo1600 from "../../assets/storyverse2-1600.webp";
import {
  communityOptions,
  educationOptions,
  emptyPretestAnswers,
  employmentOptions,
  genderOptions,
  needsIndustry,
  needsMajor,
  residenceOptions,
} from "./pretest-content";
import {
  chinaRegions,
  disciplineOptions,
  ethnicityOptions,
  industryOptions,
  type BilingualOption,
} from "./pretest-options.generated";
import "./pretest.css";

type FieldErrors = Partial<Record<keyof PretestAnswers | "form", string>>;

type Props = {
  progress: PretestProgress | null;
  loadError?: string;
  displayName: string;
  language: Language;
  themeMode: ThemeMode;
  onLanguageChange: (language: Language) => void;
  onThemeModeChange: (theme: ThemeMode) => void;
  onRetry: () => Promise<void>;
  onSave: (step: PretestStep, answers: PretestAnswers) => Promise<PretestProgress>;
  onSubmit: (answers: PretestAnswers) => Promise<void>;
  onDecline: () => Promise<void>;
};

function BilingualLabel({ zh, en, required = true }: { zh: string; en: string; required?: boolean }) {
  return (
    <span className="pretest-label-copy">
      <span>{zh}</span>
      <span>{en}</span>
      {required && <i aria-hidden="true">*</i>}
    </span>
  );
}

function Field({
  name,
  zh,
  en,
  hintZh,
  hintEn,
  error,
  children,
}: {
  name: keyof PretestAnswers;
  zh: string;
  en: string;
  hintZh?: string;
  hintEn?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`pretest-field ${error ? "has-error" : ""}`} data-field={name}>
      <BilingualLabel zh={zh} en={en} />
      {(hintZh || hintEn) && (
        <span className="pretest-field-hint">
          {hintZh && <span>{hintZh}</span>}
          {hintEn && <span>{hintEn}</span>}
        </span>
      )}
      {children}
      {error && (
        <span className="pretest-field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

function Select({
  value,
  options,
  onChange,
  placeholder = "请选择 / Please select",
}: {
  value: string | number | null;
  options: BilingualOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = options.findIndex((option) => option.value === String(value ?? ""));
  const [activeIndex, setActiveIndex] = useState(Math.max(0, selectedIndex));
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeFromOutside);
    return () => document.removeEventListener("pointerdown", closeFromOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const openWithIndex = (index: number) => {
    setActiveIndex(Math.min(Math.max(index, 0), Math.max(options.length - 1, 0)));
    setOpen(true);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (!open) openWithIndex(selectedIndex >= 0 ? selectedIndex : direction > 0 ? 0 : options.length - 1);
      else setActiveIndex((index) => Math.min(Math.max(index + direction, 0), options.length - 1));
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      openWithIndex(event.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(activeIndex);
      else openWithIndex(selectedIndex >= 0 ? selectedIndex : 0);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
    if (event.key === "Tab") setOpen(false);
  };

  const renderOptionCopy = (option: BilingualOption | null) => {
    if (!option) {
      const [zh, en] = placeholder.split(" / ");
      return (
        <span className="pretest-select-placeholder">
          <span>{zh}</span>
          {en && <small>{en}</small>}
        </span>
      );
    }
    const singleLine = option.labelZh.trim() === option.labelEn.trim();
    return (
      <span className={`pretest-select-copy ${singleLine ? "single-line" : ""}`}>
        <span lang="zh-CN">{option.labelZh}</span>
        {!singleLine && <small lang="en">{option.labelEn}</small>}
      </span>
    );
  };

  return (
    <div className={`pretest-select ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="pretest-select-trigger"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-activedescendant={open && options[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openWithIndex(selectedIndex >= 0 ? selectedIndex : 0))}
        onKeyDown={handleKeyDown}
      >
        {renderOptionCopy(selectedOption)}
        <span className="pretest-select-chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul id={listboxId} className="pretest-select-menu" role="listbox" aria-label={placeholder}>
          {options.map((option, index) => (
            <li
              id={`${listboxId}-option-${index}`}
              key={option.value}
              role="option"
              aria-selected={selectedIndex === index}
              className={`${activeIndex === index ? "is-active" : ""} ${selectedIndex === index ? "is-selected" : ""}`}
              data-option-index={index}
              data-option-value={option.value}
              onPointerMove={() => setActiveIndex(index)}
              onPointerDown={(event) => {
                event.preventDefault();
                choose(index);
              }}
            >
              {renderOptionCopy(option)}
              {selectedIndex === index && <Check size={16} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function validatePretestStep(step: PretestStep, values: PretestAnswers): FieldErrors {
  const errors: FieldErrors = {};
  if (step === 1 && !values.consented) errors.form = "请选择同意或不同意。 / Please choose Agree or Disagree.";
  if (step === 2) {
    if (!values.birthYear || values.birthYear < 1900 || values.birthYear > 2026)
      errors.birthYear = "请选择 1900–2026 年。 / Select a year from 1900 to 2026.";
    if (!values.gender) errors.gender = "请选择性别。 / Select a gender.";
    if (!values.residenceRegion) errors.residenceRegion = "请选择常住地区。 / Select your primary place of residence.";
    if (values.residenceRegion === "china_mainland") {
      if (!values.province) errors.province = "请选择省级地区。 / Select a province-level region.";
      if (!values.city) errors.city = "请选择城市。 / Select a city.";
      if (!values.communityType) errors.communityType = "请选择社区类型。 / Select a community type.";
    }
    if (values.residenceRegion === "overseas" && !values.countryRegion.trim())
      errors.countryRegion = "请填写国家或地区。 / Enter your country or region.";
  }
  if (step === 3) {
    if (!values.ethnicity) errors.ethnicity = "请选择民族。 / Select an ethnicity.";
    if (!values.education) errors.education = "请选择最高学历。 / Select your highest completed education.";
    if (values.education === "other" && !values.educationOther.trim())
      errors.educationOther = "请填写其他学历。 / Describe the other education level.";
  }
  if (step === 4) {
    if (!values.employment) errors.employment = "请选择工作状态。 / Select your employment status.";
    if (needsIndustry(values.employment)) {
      if (!values.industryPrimary) errors.industryPrimary = "请选择一级行业。 / Select a primary industry.";
      if (!values.industrySecondary) errors.industrySecondary = "请选择二级行业。 / Select a secondary industry.";
    }
    if (needsMajor(values.education, values.employment)) {
      if (!values.discipline) errors.discipline = "请选择学科。 / Select a discipline.";
      if (!values.major) errors.major = "请选择专业。 / Select a major.";
    }
  }
  return errors;
}

export const birthYearOptions: BilingualOption[] = Array.from({ length: 127 }, (_, index) => {
  const year = 2026 - index;
  return { value: String(year), labelZh: String(year), labelEn: String(year) };
});

const stepLabels = [
  ["研究说明", "Study information"],
  ["基本信息", "Demographics"],
  ["教育背景", "Education"],
  ["工作与专业", "Work & field"],
] as const;

export function PreTestPage({
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
  onDecline,
}: Props) {
  const [step, setStep] = useState<PretestStep>(progress?.currentStep ?? 1);
  const [answers, setAnswers] = useState<PretestAnswers>({
    ...emptyPretestAnswers,
    ...(progress?.draft ?? {}),
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState(progress?.status === "declined");
  const [requestError, setRequestError] = useState("");
  const previousViewedStep = useRef<PretestStep | null>(null);

  useEffect(() => {
    if (!progress) return;
    setStep(progress.currentStep);
    setAnswers({ ...emptyPretestAnswers, ...(progress.draft ?? {}) });
    setDeclined(progress.status === "declined");
  }, [progress?.status, progress?.currentStep]);

  useEffect(() => {
    if (!answers.consented || previousViewedStep.current === step) return;
    previousViewedStep.current = step;
    track("pretest_step_viewed", { questionnaire_version: "pretest_v1", step });
  }, [step, answers.consented]);

  const selectedProvince = useMemo(
    () => chinaRegions.find((region) => region.value === answers.province),
    [answers.province],
  );
  const selectedIndustry = useMemo(
    () => industryOptions.find((option) => option.value === answers.industryPrimary),
    [answers.industryPrimary],
  );
  const selectedDiscipline = useMemo(
    () => disciplineOptions.find((option) => option.value === answers.discipline),
    [answers.discipline],
  );

  const patch = (values: Partial<PretestAnswers>) => {
    setAnswers((previous) => ({ ...previous, ...values }));
    setErrors((previous) => {
      const next = { ...previous };
      Object.keys(values).forEach((key) => delete next[key as keyof PretestAnswers]);
      delete next.form;
      return next;
    });
  };

  const showErrors = (nextErrors: FieldErrors) => {
    setErrors(nextErrors);
    const fields = Object.keys(nextErrors).filter((key) => key !== "form");
    track("pretest_validation_blocked", {
      questionnaire_version: "pretest_v1",
      step,
      fields,
      error_count: Object.keys(nextErrors).length,
    });
    window.requestAnimationFrame(() => {
      const first = fields[0];
      const target = first
        ? document.querySelector<HTMLElement>(
            `[data-field="${first}"] .pretest-select-trigger, [data-field="${first}"] input`,
          )
        : document.querySelector<HTMLElement>(".pretest-choice-button");
      target?.focus();
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const continueStep = async () => {
    const nextErrors = validatePretestStep(step, answers);
    if (Object.keys(nextErrors).length) {
      showErrors(nextErrors);
      return;
    }
    setBusy(true);
    setRequestError("");
    try {
      if (step === 4) {
        await onSubmit(answers);
        track("pretest_submitted", { questionnaire_version: "pretest_v1", step: 4 });
        return;
      }
      await onSave(step, answers);
      if (step === 1) track("pretest_consent_agreed", { questionnaire_version: "pretest_v1" });
      track("pretest_step_saved", { questionnaire_version: "pretest_v1", step });
      setStep((step + 1) as PretestStep);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "保存失败，请重试。 / Could not save. Please retry.");
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    setRequestError("");
    try {
      await onDecline();
      setDeclined(true);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "暂时无法保存选择。 / Could not save your choice.");
    } finally {
      setBusy(false);
    }
  };

  if (loadError || !progress) {
    return (
      <main className={`pretest-page theme-${themeMode}`}>
        <header className="pretest-header app-shell-header">
          <AppLogo language={language} />
          <div className="pretest-header-tools">
            <ThemeToggle language={language} themeMode={themeMode} onChange={onThemeModeChange} />
            <LanguageSelect language={language} onChange={onLanguageChange} />
            <AuthenticatedGreeting displayName={displayName} language={language} />
          </div>
        </header>
        <section className="pretest-state-card" role="alert">
          <span className="pretest-state-icon">↻</span>
          <h1>暂时无法载入前测问卷</h1>
          <h2>We couldn’t load the pre-study questionnaire</h2>
          <p>{loadError || "请检查网络后重试。 / Check your connection and try again."}</p>
          <button type="button" onClick={() => void onRetry()}>
            <RefreshCw size={18} /> 重试 / Retry
          </button>
        </section>
      </main>
    );
  }

  if (declined) {
    return (
      <main className={`pretest-page theme-${themeMode}`}>
        <header className="pretest-header app-shell-header">
          <AppLogo language={language} />
          <div className="pretest-header-tools">
            <ThemeToggle language={language} themeMode={themeMode} onChange={onThemeModeChange} />
            <LanguageSelect language={language} onChange={onLanguageChange} />
          </div>
        </header>
        <section className="pretest-state-card">
          <span className="pretest-state-icon">✦</span>
          <h1>感谢你阅读研究说明</h1>
          <h2>Thank you for reviewing the study information</h2>
          <p>你已选择不参与本次研究，问卷答案没有被保留，账号也已安全退出。</p>
          <p>You chose not to participate. No questionnaire answers were retained, and you have been signed out.</p>
        </section>
      </main>
    );
  }

  return (
    <main className={`pretest-page theme-${themeMode}`}>
      <header className="pretest-header app-shell-header">
        <AppLogo language={language} />
        <div className="pretest-header-tools">
          <ThemeToggle language={language} themeMode={themeMode} onChange={onThemeModeChange} />
          <LanguageSelect language={language} onChange={onLanguageChange} />
          <AuthenticatedGreeting displayName={displayName} language={language} />
        </div>
      </header>

      <div className="pretest-layout">
        <aside className="pretest-sidebar" aria-label="问卷进度 / Questionnaire progress">
          <p>PRE-STUDY · 前测问卷</p>
          <h1>开始 StoryVerse 之前</h1>
          <h2>Before you begin StoryVerse</h2>
          <ol>
            {stepLabels.map(([zh, en], index) => {
              const number = (index + 1) as PretestStep;
              return (
                <li key={number} className={number === step ? "current" : number < step ? "done" : ""}>
                  <span>{number < step ? <Check size={15} /> : number}</span>
                  <div>
                    <b>{zh}</b>
                    <small>{en}</small>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="pretest-sidebar-note">约 3–5 分钟 · Approximately 3–5 minutes</p>
        </aside>

        <section className="pretest-form-card" aria-labelledby="pretest-step-title">
          <div className="pretest-mobile-progress" aria-hidden="true">
            <span style={{ width: `${step * 25}%` }} />
          </div>
          <header className="pretest-step-heading">
            <span>0{step} / 04</span>
            <h2 id="pretest-step-title">{stepLabels[step - 1][0]}</h2>
            <p>{stepLabels[step - 1][1]}</p>
          </header>

          {step === 1 && (
            <div className="pretest-step pretest-consent-step">
              <div className="pretest-previews">
                <figure>
                  <picture>
                    <source srcSet={`${previewOne960} 960w, ${previewOne1600} 1600w`} type="image/webp" />
                    <img
                      src={previewOne960}
                      alt="StoryVerse 首页系统界面预览 / StoryVerse home interface preview"
                      width="2888"
                      height="1496"
                      loading="eager"
                      decoding="async"
                    />
                  </picture>
                </figure>
                <figure>
                  <picture>
                    <source srcSet={`${previewTwo960} 960w, ${previewTwo1600} 1600w`} type="image/webp" />
                    <img
                      src={previewTwo960}
                      alt="StoryVerse 星空大厅系统界面预览 / StoryVerse StarLobby interface preview"
                      width="2916"
                      height="1492"
                      loading="eager"
                      decoding="async"
                    />
                  </picture>
                </figure>
              </div>
              <p className="pretest-preview-caption">系统界面预览 / System Interface Preview</p>
              <div className="pretest-study-copy">
                <article lang="zh-CN">
                  <h3>您好！我们是来自北京大学的 AI &amp; Society 课题组，十分感谢您参与本次人机交互实验。</h3>
                  <p>
                    本实验主要围绕故事收集与展示系统 StoryVerse
                    展开，您将在实验过程中自主体验我们的故事系统，完成系统操作、故事阅读及简单的问卷作答等相关任务。整个实验大约需要
                    30 分钟完成。
                  </p>
                  <p>
                    您的所有实验数据仅用于学术研究分析，所有个人信息将会做匿名化处理，我们不会泄露您的身份信息，不会将其用于商业用途。参与本次实验完全出于自愿，在实验过程中，您拥有随时退出实验的权利，退出后不会对您造成任何不利影响。
                  </p>
                  <p>
                    在您阅读以上说明后，如果您同意参与本实验，请继续往下填写问卷；如不愿意，可选择“不同意”。感谢您对学术研究的支持！
                  </p>
                </article>
                <article lang="en">
                  <h3>
                    Hello! We are the AI &amp; Society Research Group at Peking University. Thank you very much for
                    participating in this human–computer interaction study.
                  </h3>
                  <p>
                    This study focuses on StoryVerse, a system designed for collecting and presenting personal stories.
                    During the study, you will be asked to explore the system independently and complete several tasks,
                    including interacting with the system, reading stories, and answering a short questionnaire. The
                    entire session will take approximately 30 minutes.
                  </p>
                  <p>
                    All data collected in this study will be used solely for academic research purposes. Any personal
                    information you provide will be anonymized. We will not disclose your identity or use your
                    information for any commercial purpose. Participation in this study is entirely voluntary, and you
                    may withdraw at any time without any penalty or negative consequences.
                  </p>
                  <p>
                    After reading the information above, if you agree to participate in the study, please continue with
                    the questionnaire below. If you do not wish to participate, choose “Disagree.” Thank you for
                    supporting our research!
                  </p>
                </article>
              </div>
              <div className="pretest-consent-box">
                <p>我同意授权该团队匿名保存、分析和使用我的实验过程数据及我填写的故事内容，用于学术研究与产品优化。</p>
                <p>
                  I agree to authorize the team to anonymously store, analyze and use my experimental process data and
                  the story content filled in by me for academic research and product optimization.
                </p>
                <div className="pretest-consent-actions">
                  <button
                    type="button"
                    className={`pretest-choice-button ${answers.consented ? "selected" : ""}`}
                    onClick={() => patch({ consented: true })}
                  >
                    <Check size={18} /> 同意 / Agree
                  </button>
                  <button
                    type="button"
                    className="pretest-choice-button"
                    onClick={() => void decline()}
                    disabled={busy}
                  >
                    不同意 / Disagree
                  </button>
                </div>
                {errors.form && <p className="pretest-field-error">{errors.form}</p>}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="pretest-step pretest-fields-grid">
              <Field
                name="birthYear"
                zh="请问您的出生年份是？"
                en="What is your year of birth?"
                error={errors.birthYear}
              >
                <Select
                  value={answers.birthYear}
                  options={birthYearOptions}
                  onChange={(value) => patch({ birthYear: value ? Number(value) : null })}
                />
              </Field>
              <Field name="gender" zh="您的性别是" en="Gender" error={errors.gender}>
                <Select value={answers.gender} options={genderOptions} onChange={(value) => patch({ gender: value })} />
              </Field>
              <Field
                name="residenceRegion"
                zh="您现在的常住地区（每年居住六个月以上）"
                en="Your primary place of residence (more than six months each year)"
                error={errors.residenceRegion}
              >
                <Select
                  value={answers.residenceRegion}
                  options={residenceOptions}
                  onChange={(value) =>
                    patch({
                      residenceRegion: value,
                      countryRegion: "",
                      province: ["hong_kong", "macau", "taiwan"].includes(value) ? value : "",
                      city: ["hong_kong", "macau", "taiwan"].includes(value) ? value : "",
                      communityType: "",
                    })
                  }
                />
              </Field>
              {answers.residenceRegion === "overseas" && (
                <Field
                  name="countryRegion"
                  zh="请填写所在国家或地区"
                  en="Country or region"
                  error={errors.countryRegion}
                >
                  <input
                    value={answers.countryRegion}
                    maxLength={120}
                    onChange={(event) => patch({ countryRegion: event.target.value })}
                    placeholder="例如：新加坡 / e.g. Singapore"
                  />
                </Field>
              )}
              {answers.residenceRegion === "china_mainland" && (
                <>
                  <Field name="province" zh="省级地区" en="Province-level region" error={errors.province}>
                    <Select
                      value={answers.province}
                      options={chinaRegions}
                      onChange={(value) => patch({ province: value, city: "" })}
                    />
                  </Field>
                  <Field name="city" zh="城市" en="City" error={errors.city}>
                    <Select
                      value={answers.city}
                      options={selectedProvince?.children ?? []}
                      onChange={(value) => patch({ city: value })}
                    />
                  </Field>
                  <Field
                    name="communityType"
                    zh="您家所在的社区是居委会还是村委会？"
                    en="Is your community administered by a residents’ or village committee?"
                    error={errors.communityType}
                  >
                    <Select
                      value={answers.communityType}
                      options={communityOptions}
                      onChange={(value) => patch({ communityType: value })}
                    />
                  </Field>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="pretest-step pretest-fields-grid">
              <Field
                name="ethnicity"
                zh="您的民族成分是"
                en="What is your ethnicity?"
                hintZh="如果您不是中国公民，请选择“我不是中国公民”。"
                hintEn="If you are not a Chinese citizen, select “I am not a Chinese citizen”."
                error={errors.ethnicity}
              >
                <Select
                  value={answers.ethnicity}
                  options={ethnicityOptions}
                  onChange={(value) => patch({ ethnicity: value })}
                />
              </Field>
              <Field
                name="education"
                zh="您已完成（毕业）的最高学历是"
                en="What is the highest level of education you have completed?"
                hintZh="指您在学校读书时最后读完了什么水平。例如初中毕业后未继续就读，请选择“初中”。"
                hintEn="Select the highest level you completed. For example, choose “Junior high school” if that was the last level you finished."
                error={errors.education}
              >
                <Select
                  value={answers.education}
                  options={educationOptions}
                  onChange={(value) =>
                    patch({
                      education: value,
                      educationOther: value === "other" ? answers.educationOther : "",
                      discipline: "",
                      major: "",
                    })
                  }
                />
              </Field>
              {answers.education === "other" && (
                <Field name="educationOther" zh="请说明其他学历" en="Please describe" error={errors.educationOther}>
                  <input
                    value={answers.educationOther}
                    maxLength={160}
                    onChange={(event) => patch({ educationOther: event.target.value })}
                    placeholder="学历 / Education level"
                  />
                </Field>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="pretest-step pretest-fields-grid">
              <Field
                name="employment"
                zh="您现在是否有工作？"
                en="Are you currently employed?"
                error={errors.employment}
              >
                <Select
                  value={answers.employment}
                  options={employmentOptions}
                  onChange={(value) =>
                    patch({
                      employment: value,
                      industryPrimary: needsIndustry(value) ? answers.industryPrimary : "",
                      industrySecondary: needsIndustry(value) ? answers.industrySecondary : "",
                      discipline: needsMajor(answers.education, value) ? answers.discipline : "",
                      major: needsMajor(answers.education, value) ? answers.major : "",
                    })
                  }
                />
              </Field>
              {needsIndustry(answers.employment) && (
                <>
                  <Field name="industryPrimary" zh="一级行业" en="Primary industry" error={errors.industryPrimary}>
                    <Select
                      value={answers.industryPrimary}
                      options={industryOptions}
                      onChange={(value) => patch({ industryPrimary: value, industrySecondary: "" })}
                    />
                  </Field>
                  <Field
                    name="industrySecondary"
                    zh="二级行业"
                    en="Secondary industry"
                    error={errors.industrySecondary}
                  >
                    <Select
                      value={answers.industrySecondary}
                      options={selectedIndustry?.children ?? []}
                      onChange={(value) => patch({ industrySecondary: value })}
                    />
                  </Field>
                </>
              )}
              {needsMajor(answers.education, answers.employment) && (
                <>
                  <Field name="discipline" zh="学科" en="Discipline" error={errors.discipline}>
                    <Select
                      value={answers.discipline}
                      options={disciplineOptions}
                      onChange={(value) => patch({ discipline: value, major: "" })}
                    />
                  </Field>
                  <Field name="major" zh="专业" en="Major" error={errors.major}>
                    <Select
                      value={answers.major}
                      options={selectedDiscipline?.children ?? []}
                      onChange={(value) => patch({ major: value })}
                    />
                  </Field>
                </>
              )}
            </div>
          )}

          {requestError && (
            <p className="pretest-request-error" role="alert">
              {requestError}
            </p>
          )}
          <footer className="pretest-form-actions">
            {step > 1 ? (
              <button
                type="button"
                className="pretest-back-button"
                onClick={() => setStep((step - 1) as PretestStep)}
                disabled={busy}
              >
                <ArrowLeft size={18} /> 返回 / Back
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="pretest-next-button" onClick={() => void continueStep()} disabled={busy}>
              {busy ? "正在保存… / Saving…" : step === 4 ? "提交并开始 / Submit & begin" : "继续 / Continue"}
              {!busy && <ArrowRight size={18} />}
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}
