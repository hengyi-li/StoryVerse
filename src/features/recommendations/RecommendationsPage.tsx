import { useEffect, useRef, useState } from "react";
import { Check, Flag, Heart, RefreshCw, Sparkles, ThumbsDown, X } from "lucide-react";
import { LanguageSelect, AppLogo, Pill, PrimaryButton, ThemeToggle } from "../../components/AppControls";
import { AuthenticatedGreeting } from "../../components/AuthenticatedGreeting";
import { uiCopy as copy } from "../../data/interface-content";
import { applyStoryTranslation, dataService } from "../../services/data-service";
import type { StoryRecommendation } from "../../services/data-service";
import type { AppState, Language, StoryReaction, Story } from "../../types/domain";
import type { AppUpdate, ThemeMode } from "../../types/ui";
import { track } from "../../lib/analytics";
import { reactionFeedbackCopy } from "../../lib/reaction-feedback";
import { storyNeedsTranslation } from "../../lib/story-language";

type RecommendedStory = Story & { recommendationReason: string };

function recommendationReason(item: StoryRecommendation, language: Language) {
  const scores = item.scores;
  if (scores) {
    const city = Math.round(Number(scores.city_score ?? 0) * 100);
    const life = Math.round(Number(scores.life_score ?? 0) * 100);
    const theme = Math.round(Number(scores.theme_score ?? 0) * 100);
    return language === "zh"
      ? `城市 ${city}% · 人生阶段 ${life}% · 主题 ${theme}%`
      : `City ${city}% · Life stage ${life}% · Theme ${theme}%`;
  }
  return language === "zh" ? item.reason : "StoryVerse selected story";
}

const getVisualStatusLabel = (status: Story["visualStatus"], language: Language) => {
  const zh = {
    none: "未生成故事图片",
    ready: "故事意象",
    generating: "意象正在生成",
    failed: "意象暂时迷路了",
    blocked: "暂不展示故事图片",
  };
  const en = {
    none: "No story image",
    ready: "Story image",
    generating: "Generating the image",
    failed: "The image got lost for now",
    blocked: "Story image unavailable",
  };
  return (language === "zh" ? zh : en)[status];
};

function StoryDetail({
  story,
  reaction,
  onReactionChange,
  onClose,
  onReport,
  language,
}: {
  story: RecommendedStory;
  reaction: StoryReaction | null;
  onReactionChange: (reaction: StoryReaction | null) => Promise<void> | void;
  onClose: () => void;
  onReport: () => void;
  language: Language;
}) {
  const [reactionPending, setReactionPending] = useState(false);
  const [reactionNotice, setReactionNotice] = useState("");
  const changeReaction = async (nextReaction: StoryReaction | null) => {
    if (reactionPending) return;
    setReactionPending(true);
    setReactionNotice(reactionFeedbackCopy(language, nextReaction, "saving"));
    try {
      await onReactionChange(nextReaction);
      setReactionNotice(reactionFeedbackCopy(language, nextReaction, "saved"));
    } catch {
      setReactionNotice(reactionFeedbackCopy(language, nextReaction, "failed"));
    } finally {
      setReactionPending(false);
    }
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <article className="story-modal">
        <button className="modal-close" aria-label={language === "zh" ? "关闭故事" : "Close story"} onClick={onClose}>
          <X size={20} />
        </button>
        <div className={`visual visual-${story.visualStatus}`}>
          {story.imageUrl ? <img src={story.imageUrl} alt="" /> : <span>✦</span>}
          <div>{getVisualStatusLabel(story.visualStatus, language)}</div>
        </div>
        <div className="story-content">
          <div className="story-meta">
            <Pill tone="lime">{story.theme}</Pill>
            <span>{story.city}</span>
            <span>{story.stage}</span>
            <span>
              {story.readMinutes} {language === "zh" ? "分钟阅读" : "min read"}
            </span>
          </div>
          <h1>{story.title}</h1>
          <p className="author">
            @{story.author} · {language === "zh" ? "以昵称分享" : "Shared under a nickname"}
          </p>
          {story.recommendationReason && (
            <div className="reason">
              <Sparkles size={16} />
              <span>
                <b>{language === "zh" ? "为什么推荐给你" : "Why this story"}</b>
                {story.recommendationReason}
              </span>
            </div>
          )}
          <p className="story-body">{story.body}</p>
          <div className="tag-row">
            <Pill>{story.emotion}</Pill>
            <Pill>{story.meaning}</Pill>
            <Pill>{story.perspective}</Pill>
          </div>
        </div>
        {!story.ownedByCurrentUser && (
          <footer className="story-actions">
            <div>
              <button
                className={reaction === "like" ? "active like" : ""}
                aria-pressed={reaction === "like"}
                disabled={reactionPending}
                onClick={() => void changeReaction(reaction === "like" ? null : "like")}
              >
                <Heart size={19} />
                {reaction === "like" ? (language === "zh" ? "已喜欢" : "Liked") : language === "zh" ? "喜欢" : "Like"}
              </button>
              <button
                className={reaction === "dislike" ? "active dislike" : ""}
                aria-pressed={reaction === "dislike"}
                disabled={reactionPending}
                onClick={() => void changeReaction(reaction === "dislike" ? null : "dislike")}
              >
                <ThumbsDown size={19} />
                {reaction === "dislike"
                  ? language === "zh"
                    ? "已不喜欢"
                    : "Disliked"
                  : language === "zh"
                    ? "不喜欢"
                    : "Dislike"}
              </button>
            </div>
            <button onClick={onReport}>
              <Flag size={18} />
              {language === "zh" ? "举报" : "Report"}
            </button>
            {reactionNotice && (
              <p className="story-reaction-feedback" role="status" aria-live="polite">
                {reactionNotice}
              </p>
            )}
          </footer>
        )}
      </article>
    </div>
  );
}

function ReportDialog({
  story,
  onClose,
  onSubmit,
  language,
}: {
  story: Story;
  onClose: () => void;
  onSubmit?: (reason: string, note: string) => Promise<void>;
  language: Language;
}) {
  const zh = language === "zh";
  const reasons = zh
    ? ["隐私泄露", "仇恨或骚扰", "危险内容", "垃圾内容", "其他"]
    : ["Privacy leak", "Hate or harassment", "Dangerous content", "Spam", "Other"];
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  if (done)
    return (
      <div className="modal-backdrop">
        <div className="report-dialog success-dialog">
          <span className="success-icon">
            <Check size={28} />
          </span>
          <h2>{zh ? "已收到你的举报" : "Report received"}</h2>
          <p>
            {zh
              ? "谢谢你帮助守护故事社区。我们不会向故事作者公开你的身份。"
              : "Thank you for helping protect the community. We will not show your identity to the author."}
          </p>
          <PrimaryButton onClick={onClose}>{zh ? "返回故事" : "Back to story"}</PrimaryButton>
        </div>
      </div>
    );
  return (
    <div className="modal-backdrop">
      <div className="report-dialog">
        <button className="modal-close" aria-label={zh ? "关闭举报" : "Close report"} onClick={onClose}>
          <X size={18} />
        </button>
        {!confirm ? (
          <>
            <Pill tone="orange">{zh ? "社区安全" : "Community safety"}</Pill>
            <h2>{zh ? `举报「${story.title}」` : `Report “${story.title}”`}</h2>
            <p>
              {zh
                ? "请选择最符合的原因。举报说明仅供审核人员查看。"
                : "Choose the most fitting reason. Notes are only visible to reviewers."}
            </p>
            <div className="report-reasons">
              {reasons.map((x) => (
                <button className={reason === x ? "selected" : ""} onClick={() => setReason(x)} key={x}>
                  {reason === x && <Check size={15} />}
                  {x}
                </button>
              ))}
            </div>
            <label>
              {zh ? "补充说明" : "Additional note"} <small>{zh ? "选填" : "Optional"}</small>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={zh ? "请提供有助于审核的上下文…" : "Share context that may help reviewers…"}
              />
            </label>
            <PrimaryButton disabled={!reason} onClick={() => setConfirm(true)}>
              {zh ? "继续" : "Continue"}
            </PrimaryButton>
          </>
        ) : (
          <>
            <Pill tone="orange">{zh ? "二次确认" : "Confirmation"}</Pill>
            <h2>{zh ? "确认提交这次举报？" : "Submit this report?"}</h2>
            <div className="confirm-report">
              <span>{zh ? "举报原因" : "Reason"}</span>
              <b>{reason}</b>
              {note && <p>{note}</p>}
            </div>
            <p>
              {zh
                ? "提交后会进入人工审核队列。请确认信息准确。"
                : "This will enter the human-review queue. Please confirm the details."}
            </p>
            <div className="dialog-actions">
              <button className="button button-ghost" onClick={() => setConfirm(false)}>
                {zh ? "返回修改" : "Back to edit"}
              </button>
              <button
                className="button button-danger"
                onClick={() => {
                  void (onSubmit ? onSubmit(reason, note) : Promise.resolve()).then(() => setDone(true));
                }}
              >
                {zh ? "确认提交举报" : "Submit report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function RecommendationsPage({
  state,
  displayName,
  update,
  onEnterStarLobby,
  onHome,
  themeMode,
  onThemeModeChange,
}: {
  state: AppState;
  displayName: string;
  update: AppUpdate;
  onEnterStarLobby: () => void;
  onHome: () => void;
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
}) {
  const [selectedStory, setSelectedStory] = useState<RecommendedStory | null>(null);
  const [reportStory, setReportStory] = useState<Story | null>(null);
  const [recommendations, setRecommendations] = useState<StoryRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [translationNotice, setTranslationNotice] = useState("");
  const exposedStoryIds = useRef(new Set<string>());
  const loadRecommendations = async (refresh = false) => {
    setIsLoading(true);
    setTranslationNotice("");
    try {
      let items = await (refresh ? dataService.refreshRecommendations() : dataService.listRecommendations());
      const translatedStoryIds = items
        .filter((item) => storyNeedsTranslation(item.story, state.language))
        .map((item) => item.story.id);
      if (translatedStoryIds.length) {
        try {
          const translations = await dataService.translateStories(translatedStoryIds, state.language);
          items = items.map((item) => ({
            ...item,
            story: storyNeedsTranslation(item.story, state.language)
              ? applyStoryTranslation(item.story, translations[item.story.id], state.language)
              : item.story,
          }));
        } catch (error) {
          console.info("[StoryVerse] Story translation is temporarily unavailable.", error);
          setTranslationNotice(
            state.language === "zh"
              ? "中文翻译暂时不可用，正在显示作者原文。"
              : "English translation is temporarily unavailable. Showing the author's original text.",
          );
        }
      }
      setRecommendations(items);
      setSelectedStory((current) => {
        if (!current) return null;
        const item = items.find((candidate) => candidate.story.id === current.id);
        return item ? { ...item.story, recommendationReason: recommendationReason(item, state.language) } : null;
      });
    } catch (error) {
      console.info("[StoryVerse] Recommendations are temporarily unavailable.", error);
      setRecommendations([]);
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    void loadRecommendations();
  }, [state.language]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;
          const storyId = (entry.target as HTMLElement).dataset.storyId;
          if (!storyId || exposedStoryIds.current.has(storyId)) return;
          exposedStoryIds.current.add(storyId);
          const item = recommendations.find((candidate) => candidate.story.id === storyId);
          track("recommendation_card_exposed", {
            story_id: storyId,
            rank: item?.story.recommendationRank ?? null,
            recommendation_batch_id: item?.story.recommendationBatchId ?? null,
            scores: item?.scores ?? null,
          });
        });
      },
      { threshold: 0.5 },
    );
    document
      .querySelectorAll<HTMLElement>("[data-recommendation-story-id]")
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [recommendations]);
  const recommendedStories: RecommendedStory[] = recommendations.map((item) => ({
    ...item.story,
    recommendationReason: recommendationReason(item, state.language),
  }));
  const openStory = (story: RecommendedStory) => {
    track("recommendation_card_clicked", {
      story_id: story.id,
      rank: story.recommendationRank ?? null,
      recommendation_batch_id: story.recommendationBatchId ?? null,
      scores: story.recommendationScores ?? null,
    });
    if (!state.openedRecommendationStoryIds.includes(story.id))
      update({ openedRecommendationStoryIds: [...state.openedRecommendationStoryIds, story.id] });
    setSelectedStory(story);
  };
  const updateStoryReaction = async (id: string, reaction: StoryReaction | null) => {
    const previous = state.reactions[id] ?? null;
    track("story_reaction_clicked", { story_id: id, previous_reaction: previous, reaction, source: "recommendations" });
    update((current) => ({ reactions: { ...current.reactions, [id]: reaction } }));
    try {
      await (reaction ? dataService.setReaction(id, reaction) : dataService.clearReaction(id));
      track("story_reaction_result", { story_id: id, reaction, success: true, source: "recommendations" });
    } catch (error) {
      update((current) => ({ reactions: { ...current.reactions, [id]: previous } }));
      track("story_reaction_result", {
        story_id: id,
        reaction,
        success: false,
        source: "recommendations",
        error_code: error instanceof Error && "code" in error ? String(error.code) : "UNKNOWN",
      });
      throw error;
    }
  };
  return (
    <main className={`recommendations-page ${themeMode === "night" ? "theme-night" : ""}`}>
      <header className="topbar app-shell-header">
        <AppLogo onClick={onHome} language={state.language} />
        <div className="topbar-actions">
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
      <section className="recommendations-heading">
        <div>
          <p className="eyebrow">FIRST CONSTELLATION</p>
          <h1>
            {state.language === "zh" ? (
              <>
                为你找到的<span className="serif">故事。</span>
              </>
            ) : (
              <>
                Stories <span className="serif">for you.</span>
              </>
            )}
          </h1>
          <p>
            {state.language === "zh"
              ? "至少打开一则，就可以进入完整轻量星图。你不需要读完固定数量。"
              : "Open at least one story to enter the full star map. You do not have to finish a fixed number."}
          </p>
        </div>
        <div className="recommendations-heading-actions">
          <button
            className="button button-ghost"
            disabled={isLoading}
            onClick={() => {
              track("recommendation_refresh_clicked");
              void loadRecommendations(true);
            }}
          >
            <RefreshCw size={16} />
            {state.language === "zh" ? "换一批" : "Refresh"}
          </button>
          <PrimaryButton
            disabled={state.openedRecommendationStoryIds.length < 1}
            onClick={() => {
              track("recommendation_lobby_entered", { opened_story_count: state.openedRecommendationStoryIds.length });
              onEnterStarLobby();
            }}
          >
            {state.language === "zh" ? "进入故事星图" : "Enter the story map"}
          </PrimaryButton>
        </div>
      </section>
      <section className="recommendations-grid">
        {translationNotice && <p role="status">{translationNotice}</p>}
        {isLoading && <p>{state.language === "zh" ? "正在为你寻找故事…" : "Finding stories for you…"}</p>}
        {!isLoading && recommendedStories.length === 0 && (
          <p>
            {state.language === "zh"
              ? "故事池里暂时还没有可推荐的公开故事，稍后再来看看。"
              : "There are no public stories to recommend yet. Check back a little later."}
          </p>
        )}
        {recommendedStories.map((story, i) => (
          <button
            className={`recommendations-card card-${i}`}
            data-recommendation-story-id
            data-story-id={story.id}
            onClick={() => openStory(story)}
            key={story.id}
          >
            <div className="recommendations-orbit">
              <span style={{ background: story.typeColor ?? "#C7CEDB" }} />
              <i />
            </div>
            <div className="recommendations-index">0{i + 1}</div>
            <div className="recommendations-meta">
              <Pill>{story.theme}</Pill>
              <span>{story.city}</span>
            </div>
            <h2>{story.title}</h2>
            <p>{story.excerpt}</p>
            <div className="recommendations-reason">
              <Sparkles size={15} />
              {story.recommendationReason}
            </div>
            <footer>
              <span>
                {story.readMinutes} {copy[state.language].minutes}
              </span>
              <span>
                {state.openedRecommendationStoryIds.includes(story.id)
                  ? state.language === "zh"
                    ? "已打开 ✓"
                    : "Opened ✓"
                  : state.language === "zh"
                    ? "阅读故事 →"
                    : "Read story →"}
              </span>
            </footer>
          </button>
        ))}
      </section>
      {selectedStory && (
        <StoryDetail
          story={selectedStory}
          reaction={state.reactions[selectedStory.id] ?? null}
          onReactionChange={(r) => updateStoryReaction(selectedStory.id, r)}
          onClose={() => setSelectedStory(null)}
          onReport={() => setReportStory(selectedStory)}
          language={state.language}
        />
      )}
      {reportStory && (
        <ReportDialog
          story={reportStory}
          onClose={() => setReportStory(null)}
          onSubmit={(reason, note) => dataService.createReport(reportStory.id, reason, note).then(() => undefined)}
          language={state.language}
        />
      )}
    </main>
  );
}
