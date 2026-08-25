import { FormEvent, MutableRefObject, useEffect, useId, useMemo, useRef, useState } from "react";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls, Points, PointMaterial } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import gsap from "gsap";
import * as THREE from "three";
import { Tour } from "../tour/Tour";
import { BrandLogo } from "../../components/BrandLogo";
import { AuthenticatedGreeting } from "../../components/AuthenticatedGreeting";
import { localizedError } from "../../lib/localized-error";
import { applyStoryTranslation, dataService } from "../../services/data-service";
import { storyPosition } from "./star-position";
import { recommendationScorePresentation, scorePercentage } from "./recommendation-score";
import {
  hasReachedStarExposureThreshold,
  isMeaningfulStoryRead,
  normalizeLobbySearchQuery,
  starExposureKey,
} from "./analytics-rules";
import {
  analyticsContext,
  createLobbyView,
  track,
  trackBeforeNavigation,
  updateAnalyticsContext,
} from "../../lib/analytics";
import { createActiveTimer, pageCanAccumulateTime } from "../../lib/analytics-timing";
import { reactionFeedbackCopy } from "../../lib/reaction-feedback";
import { detectStoryLanguage, storyTranslationTarget } from "../../lib/story-language";
import { preloadStoryImage, storyImageThumbnailUrl } from "../../services/story-image";
import { storyPanelIdentity, storyPanelTags } from "./story-panel-content";
import type {
  InboxMessage,
  Language,
  PosttestStatus,
  RecommendationScores,
  ResonancePreferences,
  StoryReaction,
  Story,
  StoryTranslation,
} from "../../types/domain";
import type { ThemeMode } from "../../types/ui";
import "./star-lobby.css";

type IconName =
  | "compass"
  | "book"
  | "tune"
  | "heart"
  | "thumbsDown"
  | "flag"
  | "search"
  | "x"
  | "user"
  | "logout"
  | "sun"
  | "moon"
  | "bell"
  | "clipboard";
type ViewMode = "explore" | "owned" | "resonance" | "liked";
type NavigationItemId = ViewMode;
type GalaxyCategory = string;

type StoryNodeData = {
  id: string;
  words: number;
  category: GalaxyCategory;
  categoryLabelZh?: string;
  categoryLabelEn?: string;
  cityScore: number;
  isCenterStory: boolean;
  sourceLanguage: Language;
  label: string;
  desc: string;
  tags?: string[];
  gender?: string;
  age?: number;
  city: string;
  cityNameEn?: string;
  ownedByCurrentUser: boolean;
  liked: boolean;
  angle: number;
  lift: number;
  color?: string;
  imageUrl?: string;
  originalImageUrl?: string;
  status: NonNullable<Story["status"]>;
  recommendationBatchId?: string;
  recommendationRank?: number;
  recommendationScores?: RecommendationScores;
  recommendationReason?: string;
};

const navItems = [
  { id: "explore" as NavigationItemId, zh: "探索故事", en: "Explore", icon: "compass" as IconName },
  { id: "owned" as NavigationItemId, zh: "我的故事", en: "My stories", icon: "book" as IconName },
  { id: "resonance" as NavigationItemId, zh: "共鸣偏好", en: "Preferences", icon: "tune" as IconName },
  { id: "liked" as NavigationItemId, zh: "喜欢记录", en: "Liked", icon: "heart" as IconName },
];

const starLobbyCopy = {
  zh: {
    language: "语言切换",
    theme: "切换白天 / 深夜模式",
    searchOpen: "展开搜索",
    searchClose: "关闭搜索",
    searchPlaceholder: "搜索故事、心境、关键词...",
    closePanel: "关闭故事说明",
    imageReady: "故事图片",
    imageLoading: "正在加载故事图片",
    imageFailed: "图片暂时未能显示",
    imageMissing: "未生成图片",
    translating: "正在翻译这篇故事…",
    translationPending: "正在准备忠实的中文译文，作者原文不会被修改。",
    translationFailed: "中文翻译暂时不可用，正在显示作者原文。",
    wordCount: (words: number) => `文本长度 ${words}`,
    resonanceMatch: (score: number) => `共鸣匹配度 ${score}%`,
    referenceStory: "你的参照故事",
    ownedStoryMetric: "你的故事",
    curatedStory: "精选故事",
    scoreDetailsAria: "查看共鸣匹配度详情",
    referenceDetailsAria: "查看参照故事说明",
    scoreDetailsTitle: "综合参考了你的共鸣选择",
    cityPreference: (mode: "similar" | "different") => `城市偏好（${mode === "similar" ? "相近" : "相异"}）`,
    lifePreference: (mode: "similar" | "different") => `人生背景偏好（${mode === "similar" ? "相近" : "相异"}）`,
    themePreference: (mode: "similar" | "different") => `主题偏好（${mode === "similar" ? "相近" : "相异"}）`,
    semanticSimilarity: "故事内容相似度",
    scoreFormulaNote: "综合分按当前推荐公式加权计算",
    referenceStoryNote: "其他故事会以这篇故事作为推荐比较基准。",
    legend:
      "每个星点是一段故事：大小来自文本长度，颜色来自类型，位置距离只表示地理远近；故事卡片中的共鸣匹配度综合考虑城市、人生背景、主题与故事内容。",
    account: "个人账户",
    logout: "退出",
    profileTitle: "个人中心",
    profileLead: "管理你在 StoryVerse 中的昵称、密码和反馈。修改会安全保存到账号。",
    nickname: "修改昵称",
    password: "修改密码",
    passwordConfirmation: "确认新密码",
    accountIdentifier: "登录账号",
    feedback: "用户反馈",
    feedbackPlaceholder: "告诉我们你遇到的问题、想要的功能，或任何真实感受……",
    saveProfile: "保存修改",
    profileSaved: "账号资料已保存。",
    like: "喜欢",
    liked: "已喜欢",
    dislike: "不喜欢",
    disliked: "已不喜欢",
    report: "举报",
    reportTitle: "举报这段故事",
    reportLead: "请选择最符合的原因。举报说明仅供审核人员查看。",
    reportReasons: ["隐私泄露", "仇恨或骚扰", "危险内容", "垃圾内容", "其他"],
    reportNote: "补充说明（选填）",
    reportPlaceholder: "请提供有助于审核的上下文……",
    reportContinue: "继续",
    reportConfirmTitle: "确认提交这次举报？",
    reportSubmit: "确认提交举报",
    reportBack: "返回修改",
    reportDoneTitle: "已收到你的举报",
    reportDoneBody: "谢谢你帮助守护故事社区。我们不会向故事作者公开你的身份。",
    backToStory: "返回故事",
    ownStory: "我的故事",
    ownStoryStatus: {
      published: "已公开",
      pending_review: "等待内容确认，仅自己可见",
      private: "私密故事，仅自己可见",
      needs_edit: "需要修改，仅自己可见",
    },
    resonanceGroups: [
      ["城市", "相近", "不同"],
      ["人生背景", "相近", "不同"],
      ["主题", "相近", "不同"],
    ],
    confirm: "确认",
    rearranging: "正在重新排列…",
    rearrangeFailed: "暂时无法重新排列，请稍后再试。",
    questionnaire: "问卷",
    questionnairePending: "后测问卷待填写",
    questionnaireCompleted: "后测问卷已完成",
    questionnaireCompletedNotice: "你已经填写过后测问卷，感谢参与！",
  },
  en: {
    language: "Switch language",
    theme: "Switch day / night mode",
    searchOpen: "Open search",
    searchClose: "Close search",
    searchPlaceholder: "Search stories, moods, keywords...",
    closePanel: "Close story panel",
    imageReady: "Story image",
    imageLoading: "Loading story image",
    imageFailed: "Image temporarily unavailable",
    imageMissing: "No image generated",
    translating: "Translating this story…",
    translationPending: "Preparing a faithful English version while keeping the author's original text unchanged.",
    translationFailed: "English translation is temporarily unavailable. The author's original text is shown.",
    wordCount: (words: number) => `${words} words`,
    resonanceMatch: (score: number) => `Resonance match ${score}%`,
    referenceStory: "Your reference story",
    ownedStoryMetric: "Your story",
    curatedStory: "Featured story",
    scoreDetailsAria: "View resonance match details",
    referenceDetailsAria: "View reference story details",
    scoreDetailsTitle: "Based on your resonance preferences",
    cityPreference: (mode: "similar" | "different") =>
      `City preference (${mode === "similar" ? "Similar" : "Different"})`,
    lifePreference: (mode: "similar" | "different") =>
      `Life background preference (${mode === "similar" ? "Similar" : "Different"})`,
    themePreference: (mode: "similar" | "different") =>
      `Theme preference (${mode === "similar" ? "Similar" : "Different"})`,
    semanticSimilarity: "Story content similarity",
    scoreFormulaNote: "The overall score uses the current weighted recommendation formula",
    referenceStoryNote: "Other stories are compared with this story for recommendations.",
    legend:
      "Each star is a story: size comes from length, color from type, and position only shows geographic distance. The resonance match in each story card combines city, life background, theme and story content.",
    account: "Account",
    logout: "Log out",
    profileTitle: "Account center",
    profileLead: "Manage your StoryVerse nickname, password and feedback.",
    nickname: "Nickname",
    password: "Password",
    passwordConfirmation: "Confirm new password",
    accountIdentifier: "Username",
    feedback: "Feedback",
    feedbackPlaceholder: "Tell us what happened, what you need, or what felt off…",
    saveProfile: "Save changes",
    profileSaved: "Account details saved.",
    like: "Like",
    liked: "Liked",
    dislike: "Dislike",
    disliked: "Disliked",
    report: "Report",
    reportTitle: "Report this story",
    reportLead: "Choose the most fitting reason. Notes are only visible to reviewers.",
    reportReasons: ["Privacy leak", "Hate or harassment", "Dangerous content", "Spam", "Other"],
    reportNote: "Additional note (optional)",
    reportPlaceholder: "Share context that may help reviewers…",
    reportContinue: "Continue",
    reportConfirmTitle: "Submit this report?",
    reportSubmit: "Submit report",
    reportBack: "Back to edit",
    reportDoneTitle: "Report received",
    reportDoneBody: "Thank you for helping protect the community. We will not show your identity to the author.",
    backToStory: "Back to story",
    ownStory: "My story",
    ownStoryStatus: {
      published: "Published",
      pending_review: "Awaiting content review · only visible to you",
      private: "Private · only visible to you",
      needs_edit: "Needs changes · only visible to you",
    },
    resonanceGroups: [
      ["City", "Similar", "Different"],
      ["Life background", "Similar", "Different"],
      ["Theme", "Similar", "Different"],
    ],
    confirm: "Confirm",
    rearranging: "Rearranging…",
    rearrangeFailed: "Stories could not be rearranged. Try again shortly.",
    questionnaire: "Survey",
    questionnairePending: "Post-study questionnaire pending",
    questionnaireCompleted: "Post-study questionnaire completed",
    questionnaireCompletedNotice: "You have already completed the post-study questionnaire. Thank you!",
  },
} as const;

type StoryTranslationCache = Record<Language, Record<string, StoryTranslation>>;

function cachedTranslationsFromStories(stories: Story[]): StoryTranslationCache {
  const cached: StoryTranslationCache = { zh: {}, en: {} };
  for (const story of stories) {
    if (story.translations?.zh) cached.zh[story.id] = story.translations.zh;
    if (story.translations?.en) cached.en[story.id] = story.translations.en;
  }
  return cached;
}

const resonanceKeys = ["city", "stage", "theme"] as const;
const defaultResonance: ResonancePreferences = { city: "similar", stage: "different", theme: "similar" };

function applyResonanceToNode(node: StoryNodeData, resonance: ResonancePreferences) {
  void resonance;
  return node;
}

const categoryColors: Record<string, string> = {
  interpersonal_conflict: "#FF6B8A",
  break_up: "#C77DFF",
  parenthood: "#FF9FBD",
  relationship_building: "#F472D0",
  other_relationship: "#9B8AFB",
  death: "#8F9CFF",
  serious_illness: "#56B4E9",
  accident_or_injury: "#FF8A5B",
  addiction: "#B66DFF",
  other_life_threatening: "#FFBD69",
  career_setback: "#D99B00",
  career_achievement: "#F2C94C",
  mentorship: "#4CC9F0",
  formal_education: "#48CAE4",
  self_directed_learning: "#2EC4B6",
  school_transgression: "#4361EE",
  other_learning: "#72D6C9",
  recreation_or_travel: "#36D399",
  relocation_or_immigration: "#74C365",
  religious_or_spiritual: "#BFA2DB",
  other_or_unclassifiable: "#C7CEDB",
};

function nodePosition(node: StoryNodeData) {
  return new THREE.Vector3(
    ...storyPosition({
      cityScore: node.cityScore,
      isCenterStory: node.isCenterStory,
      angle: node.angle,
      lift: node.lift,
    }),
  );
}

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  const paths: Record<IconName, JSX.Element> = {
    compass: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m15.4 8.6-2.1 5.1-5.1 2.1 2.1-5.1 5.1-2.1Z" />
      </>
    ),
    book: (
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H7a3 3 0 0 0-3 3V5.5Z" />
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      </>
    ),
    tune: (
      <>
        <path d="M4 7h10" />
        <path d="M18 7h2" />
        <circle cx="16" cy="7" r="2" />
        <path d="M4 17h2" />
        <path d="M10 17h10" />
        <circle cx="8" cy="17" r="2" />
      </>
    ),
    heart: <path d="M20.8 8.6c0 5.2-8.8 10.4-8.8 10.4S3.2 13.8 3.2 8.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8.8 1.9Z" />,
    bell: (
      <>
        <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2 7.5-2 7.5h16s-2-1.5-2-7.5Z" />
        <path d="M13.7 20a2 2 0 0 1-3.4 0" />
      </>
    ),
    clipboard: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4.5V3h6v1.5" />
        <path d="M8.5 9h7" />
        <path d="M8.5 13h7" />
        <path d="M8.5 17h4.5" />
      </>
    ),
    thumbsDown: (
      <>
        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V3H5.7A2 2 0 0 0 3.8 4.4L2.4 9.4A2 2 0 0 0 4.3 12H10" />
        <path d="M17 3h2.5A2.5 2.5 0 0 1 22 5.5v5A2.5 2.5 0 0 1 19.5 13H17" />
      </>
    ),
    flag: (
      <>
        <path d="M5 21V4" />
        <path d="M5 4c4-2 6 2 10 0v10c-4 2-6-2-10 0" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.6-3.6" />
      </>
    ),
    x: (
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17 15 12 10 7" />
        <path d="M15 12H3" />
        <path d="M14 4h5v16h-5" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </>
    ),
    moon: <path d="M20.4 14.2A8.2 8.2 0 0 1 9.8 3.6 8.8 8.8 0 1 0 20.4 14.2Z" />,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function buildBackgroundParticles(count: number, radius: number, seed = 7) {
  const positions = new Float32Array(count * 3);
  let value = seed;
  const rand = () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
  for (let i = 0; i < count; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = (rand() - 0.5) * 1.8;
    positions[i * 3 + 2] = Math.sin(a) * r * 0.7;
  }
  return positions;
}

function StarField({ zoom, themeMode }: { zoom: number; themeMode: ThemeMode }) {
  const base = useMemo(() => buildBackgroundParticles(972, 15), []);
  const dense = useMemo(() => buildBackgroundParticles(756, 8, 21), []);
  const isDay = themeMode === "day";
  return (
    <>
      {/* 白天的星点同样偏淡，稍微放大并提高不透明度；夜间数值不动。 */}
      <Points positions={base} stride={3} frustumCulled>
        <PointMaterial
          transparent
          color={isDay ? "#1f1a16" : "#ffffff"}
          size={isDay ? 0.016 : 0.012}
          sizeAttenuation
          depthWrite={false}
          opacity={isDay ? 0.42 : 0.38}
        />
      </Points>
      <Points positions={dense} stride={3} frustumCulled>
        <PointMaterial
          transparent
          color={isDay ? "#3b2b22" : "#ffacd8"}
          size={(isDay ? 0.009 : 0.007) + zoom * 0.012}
          sizeAttenuation
          depthWrite={false}
          opacity={(isDay ? 0.26 : 0.16) + zoom * 0.18}
        />
      </Points>
    </>
  );
}

function OrbitalMap({ zoom, themeMode }: { zoom: number; themeMode: ThemeMode }) {
  const rings = useMemo(() => Array.from({ length: 22 }, (_, i) => 1.25 + i * 0.46), []);
  const spokes = useMemo(() => Array.from({ length: 20 }, (_, i) => (i / 20) * Math.PI * 2), []);
  const isDay = themeMode === "day";
  const lineColor = isDay ? "#241b14" : "#ffffff";
  const lineBoost = isDay ? 0.26 : 0;
  /**
   * 白天主题下线条几乎看不见，是两个原因叠加的：
   * 1) lineWidth 只有 0.25–0.6，而 drei 的 <Line> 以「像素」为单位，不足 1px 的线
   *    会被光栅化成半透明，等于又打了一次折扣；
   * 2) 深色线画在米白背景上，本身对比度就不如夜间的白线画在纯黑上。
   * 所以白天单独加粗到 1px 以上并提高不透明度；夜间保持原值不变。
   */
  const widthScale = isDay ? 2.8 : 1;
  return (
    <group rotation-x={-Math.PI / 2}>
      {rings.map((r, index) => {
        const points = Array.from({ length: 96 }, (_, i) => {
          const a = (i / 95) * Math.PI * 2;
          return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.62, 0);
        });
        return (
          <Line
            key={r}
            points={points}
            color={lineColor}
            transparent
            opacity={(index % 3 === 0 ? 0.1 : 0.052) + zoom * 0.035 + lineBoost}
            lineWidth={(index % 5 === 0 ? 0.6 : 0.35) * widthScale}
            dashed={index % 4 === 0}
            dashSize={0.08}
            gapSize={0.12}
          />
        );
      })}
      {spokes.map((a) => (
        <Line
          key={a}
          points={[
            new THREE.Vector3(Math.cos(a) * 0.8, Math.sin(a) * 0.5, 0),
            new THREE.Vector3(Math.cos(a) * 12, Math.sin(a) * 7.4, 0),
          ]}
          color={lineColor}
          transparent
          opacity={0.055 + zoom * 0.025 + lineBoost}
          lineWidth={0.25 * widthScale}
        />
      ))}
    </group>
  );
}

function StoryNode({
  node,
  active,
  onSelect,
  zoom,
}: {
  node: StoryNodeData;
  active: boolean;
  onSelect: (node: StoryNodeData) => void;
  zoom: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const pos = useMemo(() => nodePosition(node), [node]);
  const color = node.color ?? categoryColors[node.category] ?? categoryColors.other_or_unclassifiable;
  const size = Math.min(0.28, 0.045 + Math.sqrt(Math.max(node.words, 1)) * 0.006) + zoom * 0.025;

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pulse = Math.sin(clock.elapsedTime * 2.4 + node.angle * 3) * 0.08;
    ref.current.scale.setScalar((active ? 2.25 : 1) + pulse);
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(node);
  };

  return (
    <group position={pos}>
      <mesh ref={ref} onClick={handleClick}>
        <sphereGeometry args={[size, 18, 18]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {active && (
        <mesh>
          <sphereGeometry args={[size * 5.8, 24, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.1} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function CameraController({
  selected,
  galaxyRef,
  controlsRef,
  zoom,
}: {
  selected: StoryNodeData | null;
  galaxyRef: MutableRefObject<THREE.Group | null>;
  controlsRef: MutableRefObject<any>;
  zoom: number;
}) {
  const { camera } = useThree();

  useEffect(() => {
    const target =
      selected && galaxyRef.current
        ? galaxyRef.current.localToWorld(nodePosition(selected).clone())
        : new THREE.Vector3(0.25, -0.08, -1.65);
    /*
     * 选中星点时的机位。原来偏移量只有 (1.12, 0.7, 2.15)、距离约 2.5 个单位，
     * 再加上 fov 从 53 收到 34，两个效果叠在一起就贴到星点脸上了 ——
     * 周围一颗星都看不见，失去了「它在星图里的位置」这个信息。
     * 这里把距离拉到约 4.9，fov 也只收到 46。
     */
    const cameraTarget = selected
      ? new THREE.Vector3(target.x - 2.15, target.y + 1.34, target.z + 4.1 - zoom * 0.65)
      : new THREE.Vector3(0, 0.62 - zoom * 0.22, 10.25 - zoom * 1.42);
    const targetProxy = {
      x: controlsRef.current?.target?.x ?? 0,
      y: controlsRef.current?.target?.y ?? 0,
      z: controlsRef.current?.target?.z ?? 0,
    };
    const tl = gsap.timeline({ defaults: { ease: "power3.inOut", overwrite: "auto" } });

    gsap.to(camera.position, {
      x: cameraTarget.x,
      y: cameraTarget.y,
      z: cameraTarget.z,
      duration: selected ? 0.88 : 0.72,
      ease: "power3.inOut",
      overwrite: "auto",
      onUpdate: () => camera.lookAt(targetProxy.x, targetProxy.y, targetProxy.z),
    });

    tl.to(
      targetProxy,
      {
        x: target.x,
        y: target.y,
        z: target.z,
        duration: selected ? 0.88 : 0.72,
        onUpdate: () => {
          camera.lookAt(targetProxy.x, targetProxy.y, targetProxy.z);
          if (controlsRef.current) {
            controlsRef.current.target.set(targetProxy.x, targetProxy.y, targetProxy.z);
            controlsRef.current.update();
          }
        },
      },
      0,
    ).to(
      camera,
      {
        fov: selected ? 46 : 53,
        duration: selected ? 0.88 : 0.72,
        onUpdate: () => camera.updateProjectionMatrix(),
      },
      0,
    );

    return () => {
      tl.kill();
    };
  }, [camera, controlsRef, galaxyRef, selected, zoom]);

  useEffect(() => {
    if (!galaxyRef.current) return;
    if (!selected) {
      gsap.to(galaxyRef.current.rotation, {
        x: -0.11,
        y: 0.004,
        duration: 0.8,
        ease: "power3.inOut",
        overwrite: "auto",
      });
      gsap.to(galaxyRef.current.position, { x: 0, y: 0, z: 0, duration: 0.8, ease: "power3.inOut", overwrite: "auto" });
      gsap.to(galaxyRef.current.scale, { x: 1, y: 1, z: 1, duration: 0.8, ease: "power3.inOut", overwrite: "auto" });
      return;
    }
    const tl = gsap.timeline({ defaults: { ease: "power3.inOut" } });
    tl.to(galaxyRef.current.scale, { x: 1.04, y: 1.04, z: 1.04, duration: 0.14, ease: "power2.out" })
      .to(galaxyRef.current.scale, { x: 1, y: 1, z: 1, duration: 0.22, ease: "power2.inOut" })
      .to(galaxyRef.current.rotation, { y: "-=0.12", duration: 0.42, ease: "power3.inOut" }, "<0.02");
    return () => {
      tl.kill();
    };
  }, [galaxyRef, selected]);

  return null;
}

function AnimationTimeline({
  galaxyRef,
  disabled,
}: {
  galaxyRef: MutableRefObject<THREE.Group | null>;
  disabled: boolean;
}) {
  useEffect(() => {
    if (!galaxyRef.current) return;
    const tl = gsap.timeline({ repeat: -1, defaults: { ease: "none" } });
    tl.to(galaxyRef.current.rotation, { y: "-=6.28318", duration: 300 });
    if (disabled) tl.pause();
    return () => {
      tl.kill();
    };
  }, [disabled, galaxyRef]);
  return null;
}

function StarExposureTracker({
  nodes,
  galaxyRef,
  activeView,
  lobbyViewId,
  onExpose,
}: {
  nodes: StoryNodeData[];
  galaxyRef: MutableRefObject<THREE.Group | null>;
  activeView: ViewMode;
  lobbyViewId: string;
  onExpose: (node: StoryNodeData, visibleMs: number) => void;
}) {
  const { camera } = useThree();
  const lastSampleAt = useRef(0);
  const visibleSince = useRef(new Map<string, number>());
  const emitted = useRef(new Set<string>());
  const world = useMemo(() => new THREE.Vector3(), []);
  const projected = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    visibleSince.current.clear();
  }, [activeView, lobbyViewId]);

  useFrame(() => {
    const now = performance.now();
    if (now - lastSampleAt.current < 250) return;
    lastSampleAt.current = now;
    const group = galaxyRef.current;
    if (!group || !pageCanAccumulateTime()) {
      visibleSince.current.clear();
      return;
    }
    group.updateWorldMatrix(true, false);
    const visibleIds = new Set<string>();
    nodes.forEach((node) => {
      const dedupeKey = starExposureKey(lobbyViewId, activeView, node.id);
      if (emitted.current.has(dedupeKey)) return;
      world.copy(nodePosition(node)).applyMatrix4(group.matrixWorld);
      projected.copy(world).project(camera);
      const visible =
        projected.z >= -1 &&
        projected.z <= 1 &&
        projected.x >= -1 &&
        projected.x <= 1 &&
        projected.y >= -1 &&
        projected.y <= 1;
      if (!visible) return;
      visibleIds.add(node.id);
      const since = visibleSince.current.get(node.id) ?? now;
      visibleSince.current.set(node.id, since);
      if (hasReachedStarExposureThreshold(since, now)) {
        emitted.current.add(dedupeKey);
        visibleSince.current.delete(node.id);
        onExpose(node, Math.round(now - since));
      }
    });
    [...visibleSince.current.keys()].forEach((storyId) => {
      if (!visibleIds.has(storyId)) visibleSince.current.delete(storyId);
    });
  });
  return null;
}

function GalaxyScene({
  activeView,
  selected,
  onSelect,
  zoom,
  themeMode,
  resonance,
  nodes,
  removedIds,
  lobbyViewId,
  onExpose,
}: {
  activeView: ViewMode;
  selected: StoryNodeData | null;
  onSelect: (node: StoryNodeData | null) => void;
  zoom: number;
  themeMode: ThemeMode;
  resonance: ResonancePreferences;
  nodes: StoryNodeData[];
  removedIds: string[];
  lobbyViewId: string;
  onExpose: (node: StoryNodeData, visibleMs: number) => void;
}) {
  const galaxyRef = useRef<THREE.Group | null>(null);
  const controlsRef = useRef<any>(null);
  const visibleNodes = useMemo(() => {
    // 被管理员下架的故事，那颗星直接从星图上消失
    const live = nodes.filter((node) => !removedIds.includes(node.id));
    const resonantNodes = live.map((node) => applyResonanceToNode(node, resonance));
    if (activeView === "owned") return resonantNodes.filter((node) => node.ownedByCurrentUser);
    if (activeView === "liked") return resonantNodes.filter((node) => node.liked);
    return resonantNodes;
  }, [activeView, resonance, nodes, removedIds]);

  return (
    <Canvas camera={{ position: [0, 0.62, 10.25], fov: 53 }} dpr={[1, 1.6]} gl={{ antialias: true, alpha: false }}>
      <color attach="background" args={[themeMode === "day" ? "#f4f1e8" : "#000000"]} />
      <fog attach="fog" args={[themeMode === "day" ? "#f4f1e8" : "#000000", 8, 19]} />
      <ambientLight intensity={themeMode === "day" ? 0.42 : 0.16} />
      <group ref={galaxyRef} rotation={[-0.11, 0.004, -0.08]} onClick={() => onSelect(null)}>
        <StarField zoom={zoom} themeMode={themeMode} />
        <OrbitalMap zoom={zoom} themeMode={themeMode} />
        {!visibleNodes.some((node) => node.isCenterStory) && (
          <mesh rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.16, 36]} />
            <meshBasicMaterial
              color={themeMode === "day" ? "#4b3525" : "#fff0fa"}
              transparent
              opacity={themeMode === "day" ? 0.42 : 0.9}
            />
          </mesh>
        )}
        {visibleNodes.map((node) => (
          <StoryNode key={node.id} node={node} active={selected?.id === node.id} onSelect={onSelect} zoom={zoom} />
        ))}
      </group>
      <CameraController selected={selected} galaxyRef={galaxyRef} controlsRef={controlsRef} zoom={zoom} />
      <StarExposureTracker
        nodes={visibleNodes}
        galaxyRef={galaxyRef}
        activeView={activeView}
        lobbyViewId={lobbyViewId}
        onExpose={onExpose}
      />
      <AnimationTimeline galaxyRef={galaxyRef} disabled={Boolean(selected)} />
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={3.2}
        maxDistance={13}
        rotateSpeed={0.32}
        zoomSpeed={0.45}
        target={[0.25, -0.08, -1.65]}
      />
      <EffectComposer>
        <Bloom
          luminanceThreshold={themeMode === "day" ? 0.82 : 0.5}
          intensity={themeMode === "day" ? 0.18 : 0.45}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.18} darkness={themeMode === "day" ? 0.28 : 0.86} />
      </EffectComposer>
    </Canvas>
  );
}

function StoryPanel({
  node,
  language,
  resonance,
  reaction,
  onClose,
  onReactionChange,
  onReportStory,
  onScoreBreakdownView,
  translationPending = false,
  translationFailed = false,
}: {
  node: StoryNodeData;
  language: Language;
  resonance: ResonancePreferences;
  reaction: StoryReaction | null;
  onClose: () => void;
  onReactionChange?: (storyId: string, reaction: StoryReaction | null) => Promise<void> | void;
  onReportStory?: (storyId: string, reason: string, note: string) => Promise<void>;
  onScoreBreakdownView?: (trigger: "hover" | "focus" | "tap") => void;
  translationPending?: boolean;
  translationFailed?: boolean;
}) {
  const text = starLobbyCopy[language];
  const [reportOpen, setReportOpen] = useState(false);
  const [reactionPending, setReactionPending] = useState(false);
  const [reactionNotice, setReactionNotice] = useState("");
  const [displayImageUrl, setDisplayImageUrl] = useState(node.imageUrl);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [scoreDetailsOpen, setScoreDetailsOpen] = useState(false);
  const scoreDetailsId = useId();
  const scoreDetailsRef = useRef<HTMLDivElement>(null);
  const ownStatus = node.status as keyof typeof text.ownStoryStatus;
  const scorePresentation = recommendationScorePresentation({
    scores: node.recommendationScores,
    rawCityScore: node.cityScore,
    resonance,
    ownedByCurrentUser: node.ownedByCurrentUser,
    isCenterStory: node.isCenterStory,
  });
  const overallPercentage = scorePercentage(scorePresentation.overall);
  const scoreRows = [
    { label: text.cityPreference(resonance.city), value: scorePresentation.city },
    { label: text.lifePreference(resonance.stage), value: scorePresentation.life },
    { label: text.themePreference(resonance.theme), value: scorePresentation.theme },
    { label: text.semanticSimilarity, value: scorePresentation.semantic },
  ].filter((row): row is { label: string; value: number } => row.value !== null);
  const scoreMetricLabel =
    scorePresentation.kind === "match" && overallPercentage !== null
      ? text.resonanceMatch(overallPercentage)
      : scorePresentation.kind === "reference"
        ? text.referenceStory
        : scorePresentation.kind === "owned"
          ? text.ownedStoryMetric
          : text.curatedStory;
  const scoreDetailsAvailable = scorePresentation.kind === "match" || scorePresentation.kind === "reference";

  const openScoreDetails = (trigger: "hover" | "focus" | "tap") => {
    setScoreDetailsOpen(true);
    if (scorePresentation.kind === "match") onScoreBreakdownView?.(trigger);
  };

  useEffect(() => {
    setDisplayImageUrl(node.imageUrl);
    setImageLoaded(false);
    setImageFailed(false);
    setScoreDetailsOpen(false);
  }, [node.id, node.imageUrl]);

  useEffect(() => {
    if (!scoreDetailsOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!scoreDetailsRef.current?.contains(event.target as Node)) setScoreDetailsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setScoreDetailsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [scoreDetailsOpen]);

  const changeReaction = async (nextReaction: StoryReaction | null) => {
    if (reactionPending || !onReactionChange) return;
    setReactionPending(true);
    setReactionNotice(reactionFeedbackCopy(language, nextReaction, "saving"));
    try {
      await onReactionChange(node.id, nextReaction);
      setReactionNotice(reactionFeedbackCopy(language, nextReaction, "saved"));
    } catch {
      setReactionNotice(reactionFeedbackCopy(language, nextReaction, "failed"));
    } finally {
      setReactionPending(false);
    }
  };
  return (
    <>
      <aside
        className="story-panel"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="story-panel-close-zone"
          aria-label={text.closePanel}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => {
            event.stopPropagation();
            onClose();
          }}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        />
        <button
          className="neon-control story-panel-close"
          tabIndex={-1}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          aria-label={text.closePanel}
        >
          <Icon name="x" size={20} />
        </button>
        <div className={`story-image-slot${imageLoaded ? " is-loaded" : ""}`}>
          {displayImageUrl && !imageFailed && (
            <img
              src={displayImageUrl}
              alt=""
              decoding="async"
              fetchPriority="high"
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                if (node.originalImageUrl && displayImageUrl !== node.originalImageUrl) {
                  setDisplayImageUrl(node.originalImageUrl);
                  setImageLoaded(false);
                  return;
                }
                setImageFailed(true);
              }}
            />
          )}
          {(!displayImageUrl || imageFailed || !imageLoaded) && (
            <i className={displayImageUrl && !imageFailed ? "is-loading" : undefined}>✦</i>
          )}
          <span role="status">
            {imageFailed
              ? text.imageFailed
              : displayImageUrl
                ? imageLoaded
                  ? text.imageReady
                  : text.imageLoading
                : text.imageMissing}
          </span>
        </div>
        <div className="story-panel-meta">
          <span className="story-panel-category">
            {(language === "en" ? node.categoryLabelEn : node.categoryLabelZh) ?? node.category.replaceAll("_", " ")}
          </span>
          <span className="story-panel-identity">{storyPanelIdentity(node, language)}</span>
        </div>
        <h2>{translationPending ? text.translating : node.label}</h2>
        {node.ownedByCurrentUser && (
          <p className={`story-panel-own-status is-${node.status}`}>
            <b>{text.ownStory}</b>
            <span>{text.ownStoryStatus[ownStatus] ?? node.status}</span>
          </p>
        )}
        <div className="story-panel-stats">
          <b
            style={{
              background: node.color ?? categoryColors[node.category] ?? categoryColors.other_or_unclassifiable,
            }}
          />
          <span>{text.wordCount(node.words)}</span>
          <span aria-hidden="true">/</span>
          {scoreDetailsAvailable ? (
            <div
              className="story-score-explainer"
              ref={scoreDetailsRef}
              onMouseEnter={() => openScoreDetails("hover")}
              onMouseLeave={() => setScoreDetailsOpen(false)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setScoreDetailsOpen(false);
              }}
            >
              <button
                type="button"
                className="story-score-trigger"
                aria-label={scorePresentation.kind === "match" ? text.scoreDetailsAria : text.referenceDetailsAria}
                aria-expanded={scoreDetailsOpen}
                aria-controls={scoreDetailsId}
                aria-describedby={scoreDetailsOpen ? scoreDetailsId : undefined}
                onFocus={() => {
                  if (window.matchMedia("(hover: hover)").matches) openScoreDetails("focus");
                }}
                onClick={() => {
                  if (window.matchMedia("(hover: none)").matches) {
                    if (scoreDetailsOpen) setScoreDetailsOpen(false);
                    else openScoreDetails("tap");
                    return;
                  }
                  openScoreDetails("focus");
                }}
              >
                <span>{scoreMetricLabel}</span>
                <i aria-hidden="true">ⓘ</i>
              </button>
              {scoreDetailsOpen && (
                <div className="story-score-popover" id={scoreDetailsId} role="tooltip">
                  {scorePresentation.kind === "match" ? (
                    <>
                      <strong>{text.scoreDetailsTitle}</strong>
                      <dl>
                        {scoreRows.map((row) => (
                          <div key={row.label}>
                            <dt>{row.label}</dt>
                            <dd>{scorePercentage(row.value)}%</dd>
                          </div>
                        ))}
                      </dl>
                      <small>{text.scoreFormulaNote}</small>
                    </>
                  ) : (
                    <strong>{text.referenceStoryNote}</strong>
                  )}
                </div>
              )}
            </div>
          ) : (
            <span>{scoreMetricLabel}</span>
          )}
        </div>
        {translationPending ? (
          <p role="status">{text.translationPending}</p>
        ) : (
          <>
            {translationFailed && <p role="status">{text.translationFailed}</p>}
            <p className="story-panel-body">{node.desc}</p>
          </>
        )}
        <div className="story-panel-divider" />
        {!translationPending && (
          <div className="story-panel-tags">
            {(node.tags ?? []).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        )}
        {!node.ownedByCurrentUser && (
          <div className="story-panel-actions">
            <button
              className={reaction === "like" ? "is-active like" : ""}
              aria-pressed={reaction === "like"}
              disabled={reactionPending || !onReactionChange}
              onClick={() => void changeReaction(reaction === "like" ? null : "like")}
            >
              <Icon name="heart" size={16} />
              {reaction === "like" ? text.liked : text.like}
            </button>
            <button
              className={reaction === "dislike" ? "is-active dislike" : ""}
              aria-pressed={reaction === "dislike"}
              disabled={reactionPending || !onReactionChange}
              onClick={() => void changeReaction(reaction === "dislike" ? null : "dislike")}
            >
              <Icon name="thumbsDown" size={16} />
              {reaction === "dislike" ? text.disliked : text.dislike}
            </button>
            <button
              onClick={() => {
                track("report_started", { story_id: node.id, source: "star_lobby" });
                setReportOpen(true);
              }}
            >
              <Icon name="flag" size={16} />
              {text.report}
            </button>
            {reactionNotice && (
              <p className="story-panel-reaction-feedback" role="status" aria-live="polite">
                {reactionNotice}
              </p>
            )}
          </div>
        )}
      </aside>
      {reportOpen && (
        <StoryReportDialog
          language={language}
          node={node}
          onClose={() => setReportOpen(false)}
          onSubmit={onReportStory}
        />
      )}
    </>
  );
}

function ExpandingSearch({
  language,
  query,
  onQueryChange,
  onOpen,
  onClear,
}: {
  language: Language;
  query: string;
  onQueryChange: (query: string) => void;
  onOpen: () => void;
  onClear: (previousQuery: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const submit = (event: FormEvent) => event.preventDefault();
  const text = starLobbyCopy[language];

  if (!expanded) {
    return (
      <button
        aria-label={text.searchOpen}
        className="neon-control icon-button"
        onClick={() => {
          onOpen();
          setExpanded(true);
        }}
      >
        <Icon name="search" size={19} />
      </button>
    );
  }

  return (
    <form className="neon-control search-expanded" onSubmit={submit}>
      <Icon name="search" size={17} />
      <input
        autoFocus
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={text.searchPlaceholder}
      />
      <button
        aria-label={text.searchClose}
        type="button"
        onClick={() => {
          setExpanded(false);
          onClear(query);
          onQueryChange("");
        }}
      >
        <Icon name="x" size={15} />
      </button>
    </form>
  );
}

function FloatingMenu({
  activeView,
  language,
  onChange,
  resonanceLocked,
}: {
  activeView: ViewMode;
  language: Language;
  onChange: (view: NavigationItemId) => void;
  resonanceLocked: boolean;
}) {
  const visibleItems = resonanceLocked ? navItems.filter((item) => item.id !== "resonance") : navItems;
  return (
    <nav aria-label="StoryVerse star map navigation" className="floating-nav">
      {visibleItems.map((item) => (
        <button
          key={item.id}
          data-tour={`nav-${item.id}`}
          className={`neon-control dock-item ${activeView === item.id ? "is-active" : ""}`}
          aria-label={`${item.zh} / ${item.en}`}
          onClick={() => onChange(item.id)}
        >
          <span className="nav-icon">
            <Icon name={item.icon} />
          </span>
          <span className="nav-label">{language === "zh" ? item.zh : item.en}</span>
        </button>
      ))}
    </nav>
  );
}

function PosttestReminder({ onDismiss }: { onDismiss: () => void }) {
  return (
    <aside className="posttest-reminder" role="status" aria-label="后测问卷提醒 / Post-study reminder">
      <button
        type="button"
        className="posttest-reminder-close"
        aria-label="关闭提醒 / Dismiss reminder"
        onClick={onDismiss}
      >
        <Icon name="x" size={16} />
      </button>
      <span aria-hidden="true">FINAL STEP · 最后一步</span>
      <p>你可以在这个页面自由探索故事。当你觉得浏览得差不多了，请点击右下方「问卷」按钮，填写最后一份问卷。</p>
      <p>
        Feel free to explore the stories on this page. When you feel you have explored enough, click “Questionnaire” in
        the lower-right corner to complete the final questionnaire.
      </p>
    </aside>
  );
}

function PosttestDock({
  language,
  status,
  onOpen,
  onCompletedClick,
}: {
  language: Language;
  status: PosttestStatus;
  onOpen: () => void;
  onCompletedClick: () => void;
}) {
  const text = starLobbyCopy[language];
  const completed = status === "completed";
  return (
    <button
      type="button"
      className={`posttest-dock ${completed ? "is-completed" : "is-unread"}`}
      aria-label={completed ? text.questionnaireCompleted : text.questionnairePending}
      onClick={completed ? onCompletedClick : onOpen}
    >
      <Icon name="clipboard" size={19} />
      <span>{text.questionnaire}</span>
      {!completed && <i aria-hidden="true">!</i>}
      {completed && <b aria-hidden="true">✓</b>}
    </button>
  );
}

function ResonanceBar({
  language,
  value,
  onChange,
  onConfirm,
  pending,
  error,
}: {
  language: Language;
  value: ResonancePreferences;
  onChange: (value: ResonancePreferences) => void;
  onConfirm: () => Promise<void>;
  pending: boolean;
  error: string;
}) {
  const text = starLobbyCopy[language];
  const groups = text.resonanceGroups;
  return (
    <div className="resonance-bar">
      {groups.map(([title, a, b], index) => {
        const key = resonanceKeys[index];
        return (
          <div key={title}>
            <span>{title}</span>
            <button
              disabled={pending}
              className={value[key] === "similar" ? "is-selected" : ""}
              onClick={() => onChange({ ...value, [key]: "similar" })}
            >
              {a}
            </button>
            <button
              disabled={pending}
              className={value[key] === "different" ? "is-selected" : ""}
              onClick={() => onChange({ ...value, [key]: "different" })}
            >
              {b}
            </button>
          </div>
        );
      })}
      <button className="confirm-resonance" disabled={pending} onClick={() => void onConfirm()}>
        {pending ? text.rearranging : text.confirm}
      </button>
      {error && (
        <p className="resonance-status" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function localizedNotificationReason(reason: string, language: Language) {
  if (language === "zh") return reason;
  const systemReasons: Record<string, string> = {
    "StoryVerse 暂时无法自动确认这篇故事是否适合公开，因此已进入人工确认队列。这不代表故事存在问题；故事已经安全保存，确认完成前仅自己可见。":
      "StoryVerse could not automatically confirm whether this story is suitable for public sharing, so it has entered the human review queue. This does not mean there is a problem with your story; it is safely saved and visible only to you until review is complete.",
    "故事已保存，确认前仅自己可见。": "Your story is saved and visible only to you until review is complete.",
    "故事已经保存，并交给人工温和确认；确认前不会公开。":
      "Your story is saved and awaiting content review. It will stay private until review is complete.",
    "故事已经保存，正在等待内容确认；确认完成前不会公开。":
      "Your story is saved and awaiting content review. It will stay private until review is complete.",
    "我们注意到这段经历可能很艰难。可以先缓一缓，你的安全和感受更重要；故事已交给人工温和确认。":
      "This experience may be difficult to revisit. Take a pause if you need one—your safety and feelings matter. Your story is saved and awaiting content review.",
    "我们注意到这段经历可能很艰难。可以先缓一缓，你的安全和感受更重要。故事已经保存，正在等待内容确认。":
      "This experience may be difficult to revisit. Take a pause if you need one—your safety and feelings matter. Your story is saved and awaiting content review.",
    "故事已由管理员恢复。": "Your story has been restored.",
  };
  return systemReasons[reason] ?? reason;
}

const genericPendingReviewReasons = new Set([
  "StoryVerse 暂时无法自动确认这篇故事是否适合公开，因此已进入人工确认队列。这不代表故事存在问题；故事已经安全保存，确认完成前仅自己可见。",
  "故事已保存，确认前仅自己可见。",
  "故事已经保存，并交给人工温和确认；确认前不会公开。",
  "故事已经保存，正在等待内容确认；确认完成前不会公开。",
]);

function AccountDock({
  language,
  onLogout,
  inbox,
  onMarkInboxRead,
  onDisplayNameChange,
}: {
  language: Language;
  onLogout: () => void;
  inbox: InboxMessage[];
  onMarkInboxRead: () => void;
  onDisplayNameChange?: (displayName: string) => void;
}) {
  const text = starLobbyCopy[language];
  const [accountOpen, setAccountOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const unread = inbox.filter((message) => !message.read).length;
  const zh = language === "zh";
  return (
    <>
      <div className="account-dock" data-tour="account-dock">
        <button
          onClick={() => {
            track("account_opened", { source: "star_lobby" });
            setAccountOpen(true);
          }}
        >
          <Icon name="user" size={18} />
          <span>{text.account}</span>
        </button>
        <button
          className="inbox-button"
          aria-label={zh ? "消息" : "Inbox"}
          onClick={() => {
            track("notifications_opened", { unread_count: unread, notification_count: inbox.length });
            setInboxOpen(true);
            onMarkInboxRead();
          }}
        >
          <Icon name="bell" size={18} />
          {unread > 0 && <i className="inbox-dot">{unread}</i>}
        </button>
        <button
          aria-label={text.logout}
          disabled={loggingOut}
          onClick={() => {
            if (loggingOut) return;
            setLoggingOut(true);
            void trackBeforeNavigation("logout_clicked", { source: "star_lobby" }).finally(onLogout);
          }}
        >
          <Icon name="logout" size={18} />
        </button>
      </div>
      {accountOpen && (
        <AccountDialog
          language={language}
          onClose={() => setAccountOpen(false)}
          onDisplayNameChange={onDisplayNameChange}
        />
      )}
      {inboxOpen && (
        <div
          className="star-lobby-modal-backdrop"
          onMouseDown={(event) => event.target === event.currentTarget && setInboxOpen(false)}
        >
          <article className="star-lobby-dialog inbox-dialog">
            <button
              className="star-lobby-dialog-close"
              aria-label={zh ? "关闭消息" : "Close inbox"}
              onClick={() => setInboxOpen(false)}
            >
              <Icon name="x" size={18} />
            </button>
            <p className="star-lobby-dialog-eyebrow">Inbox</p>
            <h2>{zh ? "我的消息" : "My messages"}</h2>
            {inbox.length === 0 && (
              <p>
                {zh
                  ? "还没有消息。故事完成内容确认或状态发生变化时，结果会出现在这里。"
                  : "Nothing yet. Content-review and story-status updates will appear here."}
              </p>
            )}
            <div className="inbox-list">
              {inbox.map((message) => {
                const statusLabel =
                  message.status === "pending"
                    ? zh
                      ? "等待确认"
                      : "Awaiting review"
                    : message.status === "reviewing"
                      ? zh
                        ? "确认中"
                        : "Under review"
                      : zh
                        ? "已有结果"
                        : "Reviewed";
                const headline =
                  message.status === "pending"
                    ? zh
                      ? "故事正在等待人工确认"
                      : "Story awaiting human review"
                    : message.status === "reviewing"
                      ? zh
                        ? "故事正在人工确认中"
                        : "Your story is being reviewed"
                      : message.kind === "system"
                        ? zh
                          ? "故事状态已更新"
                          : "Story status updated"
                        : message.kind === "needs_edit"
                          ? zh
                            ? "故事需要修改"
                            : "Story needs changes"
                          : message.kind === "removed"
                            ? zh
                              ? "故事已下架"
                              : "Story removed"
                            : zh
                              ? "故事已保留"
                              : "Story kept";
                const hint =
                  message.status === "pending" || message.status === "reviewing"
                    ? zh
                      ? "StoryVerse 暂时无法自动确认这篇故事是否适合公开，因此已进入人工确认队列。这不代表故事存在问题；故事已经安全保存，确认完成前仅自己可见。"
                      : "StoryVerse could not automatically confirm whether this story is suitable for public sharing, so it has entered the human review queue. This does not mean there is a problem with your story; it is safely saved and visible only to you until review is complete."
                    : "";
                const showReason =
                  Boolean(message.reason) &&
                  (message.status === "resolved" || !genericPendingReviewReasons.has(message.reason));
                return (
                  <div
                    className={`inbox-item ${message.status === "resolved" ? message.kind : message.status}`}
                    key={message.id}
                  >
                    <span className={`inbox-status is-${message.status}`}>{statusLabel}</span>
                    <b>{headline}</b>
                    <span>{message.storyTitle}</span>
                    {hint && <p>{hint}</p>}
                    {showReason && (
                      <p>
                        {zh ? "说明：" : "Note: "}
                        {localizedNotificationReason(message.reason, language)}
                      </p>
                    )}
                    <small>{new Date(message.createdAt).toLocaleString(zh ? "zh-CN" : "en-US")}</small>
                  </div>
                );
              })}
            </div>
          </article>
        </div>
      )}
    </>
  );
}

function AccountDialog({
  language,
  onClose,
  onDisplayNameChange,
}: {
  language: Language;
  onClose: () => void;
  onDisplayNameChange?: (displayName: string) => void;
}) {
  const text = starLobbyCopy[language];
  const [saved, setSaved] = useState(false);
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [accountIdentifier, setAccountIdentifier] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    dataService
      .getCurrentUser()
      .then(({ user }) => {
        setNickname(user.displayName);
        setAccountIdentifier(user.accountIdentifier);
      })
      .catch(() => undefined);
  }, []);

  const save = () => {
    setError("");
    const normalizedNickname = nickname.trim();
    if (normalizedNickname.length < 1 || normalizedNickname.length > 40) {
      setError(language === "zh" ? "昵称需要在 1–40 字之间。" : "The nickname must be 1–40 characters.");
      return;
    }
    if (password && (password.length < 10 || password.length > 72)) {
      setError(language === "zh" ? "新密码需要 10–72 位。" : "The new password must be 10–72 characters.");
      return;
    }
    if (password !== passwordConfirmation) {
      setError(language === "zh" ? "两次输入的新密码不一致。" : "The new passwords do not match.");
      return;
    }
    if (feedback.trim().length > 2000) {
      setError(language === "zh" ? "反馈内容最多 2000 字。" : "Feedback must be at most 2000 characters.");
      return;
    }
    void dataService
      .updateProfile({
        displayName: normalizedNickname,
        accountIdentifier,
        password: password || undefined,
        feedback,
      })
      .then(() => {
        onDisplayNameChange?.(normalizedNickname);
        setSaved(true);
        setPassword("");
        setPasswordConfirmation("");
        setFeedback("");
        track("profile_update_result", {
          success: true,
          nickname_changed: true,
          credential_changed: Boolean(password),
          feedback_submitted: Boolean(feedback.trim()),
        });
        if (feedback.trim()) track("feedback_submitted", { character_count: feedback.trim().length });
      })
      .catch((reason) => {
        track("profile_update_result", {
          success: false,
          error_code: reason instanceof Error && "code" in reason ? String(reason.code) : "UNKNOWN",
        });
        setError(localizedError(reason, language, { zh: "暂时无法保存。", en: "Could not save." }));
      });
  };

  return (
    <div
      className="star-lobby-modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <article className="star-lobby-dialog account-dialog">
        <button
          className="star-lobby-dialog-close"
          aria-label={language === "zh" ? "关闭个人中心" : "Close account center"}
          onClick={onClose}
        >
          <Icon name="x" size={18} />
        </button>
        <p className="star-lobby-dialog-eyebrow">Account</p>
        <h2>{text.profileTitle}</h2>
        <p>{saved ? text.profileSaved : text.profileLead}</p>
        <div className="account-form">
          <label>
            {text.nickname}
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder={language === "zh" ? "StoryVerse 里的名字" : "Your StoryVerse name"}
            />
          </label>
          <label>
            {text.password}
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder={language === "zh" ? "输入新密码" : "Enter new password"}
            />
          </label>
          <label>
            {text.passwordConfirmation}
            <input
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              type="password"
              placeholder={language === "zh" ? "再次输入新密码" : "Enter the new password again"}
            />
          </label>
          <label>
            {text.accountIdentifier}
            <input value={accountIdentifier} readOnly type="text" />
          </label>
          <label className="wide">
            {text.feedback}
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder={text.feedbackPlaceholder}
            />
          </label>
        </div>
        {error && <p>{error}</p>}
        <button className="star-lobby-primary" onClick={save}>
          {text.saveProfile}
        </button>
      </article>
    </div>
  );
}

function StoryReportDialog({
  language,
  node,
  onClose,
  onSubmit,
}: {
  language: Language;
  node: StoryNodeData;
  onClose: () => void;
  onSubmit?: (storyId: string, reason: string, note: string) => Promise<void>;
}) {
  const text = starLobbyCopy[language];
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div
      className="star-lobby-modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <article className="star-lobby-dialog star-lobby-story-report">
        <button
          className="star-lobby-dialog-close"
          aria-label={language === "zh" ? "关闭举报" : "Close report"}
          onClick={onClose}
        >
          <Icon name="x" size={18} />
        </button>
        {done ? (
          <>
            <span className="star-lobby-success">✓</span>
            <h2>{text.reportDoneTitle}</h2>
            <p>{text.reportDoneBody}</p>
            <button className="star-lobby-primary" onClick={onClose}>
              {text.backToStory}
            </button>
          </>
        ) : !confirm ? (
          <>
            <p className="star-lobby-dialog-eyebrow">Community Safety</p>
            <h2>{text.reportTitle}</h2>
            <p>{text.reportLead}</p>
            <div className="star-lobby-report-reasons">
              {text.reportReasons.map((item) => (
                <button key={item} className={reason === item ? "is-selected" : ""} onClick={() => setReason(item)}>
                  {reason === item ? "✓" : "○"} {item}
                </button>
              ))}
            </div>
            <label className="star-lobby-note">
              {text.reportNote}
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={text.reportPlaceholder}
              />
            </label>
            <button className="star-lobby-primary" disabled={!reason} onClick={() => setConfirm(true)}>
              {text.reportContinue}
            </button>
          </>
        ) : (
          <>
            <p className="star-lobby-dialog-eyebrow">{language === "zh" ? "二次确认" : "Confirm"}</p>
            <h2>{text.reportConfirmTitle}</h2>
            <div className="star-lobby-confirm-card">
              <span>{node.label}</span>
              <b>{reason}</b>
              {note && <p>{note}</p>}
            </div>
            <div className="star-lobby-dialog-actions">
              <button onClick={() => setConfirm(false)}>{text.reportBack}</button>
              <button
                className="danger"
                onClick={() => {
                  void (onSubmit?.(node.id, reason, note) ?? Promise.resolve())
                    .then(() => {
                      setDone(true);
                      track("report_result", { story_id: node.id, reason, note_length: note.length, success: true });
                    })
                    .catch((error) =>
                      track("report_result", {
                        story_id: node.id,
                        reason,
                        note_length: note.length,
                        success: false,
                        error_code: error instanceof Error && "code" in error ? String(error.code) : "UNKNOWN",
                      }),
                    );
                }}
              >
                {text.reportSubmit}
              </button>
            </div>
          </>
        )}
      </article>
    </div>
  );
}

export function StarLobby({
  language,
  displayName,
  themeMode,
  onLanguageChange,
  onThemeModeChange,
  onHome,
  onLogout,
  resonance = defaultResonance,
  resonanceLocked = false,
  onResonanceChange,
  stories = [],
  ownedStoryIds = [],
  reactions = {},
  onReactionChange,
  onReportStory,
  showTour = false,
  onTourFinish,
  onTourSkip,
  posttestAvailable = false,
  posttestStatus = "not_required",
  showPosttestReminder = false,
  posttestNotice = "",
  onPosttestOpen,
  onPosttestReminderDismiss,
  onPosttestNoticeConsumed,
  removedStoryIds = [],
  inbox = [],
  onMarkInboxRead,
  onDisplayNameChange,
}: {
  language: Language;
  displayName: string;
  themeMode: ThemeMode;
  onLanguageChange: (language: Language) => void;
  onThemeModeChange: (themeMode: ThemeMode) => void;
  onHome: () => void;
  onLogout?: () => void;
  resonance?: ResonancePreferences;
  resonanceLocked?: boolean;
  onResonanceChange?: (
    resonance: ResonancePreferences,
  ) => Promise<{ batchId?: string; storyCount?: number } | void> | { batchId?: string; storyCount?: number } | void;
  stories?: Story[];
  ownedStoryIds?: string[];
  reactions?: Record<string, StoryReaction | null>;
  onReactionChange?: (storyId: string, reaction: StoryReaction | null) => Promise<void> | void;
  onReportStory?: (storyId: string, reason: string, note: string) => Promise<void>;
  showTour?: boolean;
  onTourFinish?: () => void;
  onTourSkip?: () => void;
  posttestAvailable?: boolean;
  posttestStatus?: PosttestStatus;
  showPosttestReminder?: boolean;
  posttestNotice?: string;
  onPosttestOpen?: () => void;
  onPosttestReminderDismiss?: () => void;
  onPosttestNoticeConsumed?: () => void;
  /** 被管理员下架的星点 id，星图上直接不画 */
  removedStoryIds?: string[];
  inbox?: InboxMessage[];
  onMarkInboxRead?: () => void;
  onDisplayNameChange?: (displayName: string) => void;
}) {
  const [activeView, setActiveView] = useState<ViewMode>("explore");
  const [selected, setSelected] = useState<StoryNodeData | null>(null);
  const [zoom, setZoom] = useState(0);
  const [query, setQuery] = useState("");
  const [confirmedResonance, setConfirmedResonance] = useState<ResonancePreferences>(resonance);
  const [draftResonance, setDraftResonance] = useState<ResonancePreferences>(resonance);
  const [resonancePending, setResonancePending] = useState(false);
  const [resonanceError, setResonanceError] = useState("");
  const [translations, setTranslations] = useState<StoryTranslationCache>(() => cachedTranslationsFromStories(stories));
  const translationInFlight = useRef(new Set<string>());
  const previousLanguage = useRef(language);
  const [translationPendingIds, setTranslationPendingIds] = useState<string[]>([]);
  const [translationFailedIds, setTranslationFailedIds] = useState<string[]>([]);
  const [posttestToast, setPosttestToast] = useState<{ id: number; message: string } | null>(null);
  const posttestToastId = useRef(0);
  const posttestReminderTracked = useRef(false);
  const scoreBreakdownViewed = useRef(new Set<string>());
  const initialBatchId = stories.find((story) => story.recommendationBatchId)?.recommendationBatchId ?? null;
  const [lobbyViewId, setLobbyViewId] = useState(() => createLobbyView(initialBatchId));
  const lobbyViewIdRef = useRef(lobbyViewId);
  const lobbyViewed = useRef(false);
  const exposedAt = useRef(new Map<string, number>());
  const lastSearchKey = useRef("");
  const gestureCounts = useRef({ wheel: 0, rotate: 0, zoom: 0 });
  const lobbyActiveTimer = useRef(createActiveTimer());
  const activeViewRef = useRef<ViewMode>("explore");
  const reactionsRef = useRef(reactions);
  const confirmedResonanceRef = useRef(confirmedResonance);
  const readSession = useRef<{
    id: string;
    node: StoryNodeData;
    timer: ReturnType<typeof createActiveTimer>;
    wallStartedAt: number;
    reactionAtStart: StoryReaction | null;
  } | null>(null);
  const text = starLobbyCopy[language];
  const nodes = useMemo<StoryNodeData[]>(() => {
    const normalizedQuery = normalizeLobbySearchQuery(query);
    const stableFraction = (value: string, salt: number) => {
      let hash = 2166136261 ^ salt;
      for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
      return (hash >>> 0) / 4294967295;
    };
    return stories
      .map((story) => {
        const sourceLanguage = detectStoryLanguage(story.body);
        return {
          sourceLanguage,
          story:
            sourceLanguage === language
              ? story
              : applyStoryTranslation(story, translations[language][story.id], language),
        };
      })
      .filter(
        ({ story }) =>
          !normalizedQuery ||
          [story.title, story.body, story.city, story.stage, story.theme, story.emotion, story.meaning].some((value) =>
            value.toLocaleLowerCase().includes(normalizedQuery),
          ),
      )
      .map(({ story, sourceLanguage }) => ({
        id: story.id,
        words:
          language === "en"
            ? story.body.trim().split(/\s+/).filter(Boolean).length
            : Array.from(story.body.trim()).length,
        category: story.typeId || "other_or_unclassifiable",
        categoryLabelZh: story.typeLabelZh,
        categoryLabelEn: story.typeLabelEn,
        cityScore: Math.max(0, Math.min(1, story.cityScore ?? 0.5)),
        isCenterStory: Boolean(story.isCenterStory),
        sourceLanguage,
        label: story.title,
        desc: story.body,
        tags: storyPanelTags(story),
        gender: story.gender,
        age: story.age,
        city: story.city,
        cityNameEn: story.cityNameEn,
        ownedByCurrentUser: ownedStoryIds.includes(story.id),
        liked: reactions[story.id] === "like",
        angle: stableFraction(story.id, 17) * Math.PI * 2,
        lift: (stableFraction(story.id, 31) - 0.5) * 0.8,
        color: story.typeColor,
        imageUrl: story.imageUrl ? storyImageThumbnailUrl(story.imageUrl) : undefined,
        originalImageUrl: story.imageUrl,
        status: story.status ?? "published",
        recommendationBatchId: story.recommendationBatchId,
        recommendationRank: story.recommendationRank,
        recommendationScores: story.recommendationScores,
        recommendationReason: story.recommendationReason,
      }));
  }, [stories, ownedStoryIds, reactions, query, language, translations]);

  useEffect(() => {
    const cached = cachedTranslationsFromStories(stories);
    if (!Object.keys(cached.zh).length && !Object.keys(cached.en).length) return;
    setTranslations((current) => ({
      zh: { ...current.zh, ...cached.zh },
      en: { ...current.en, ...cached.en },
    }));
  }, [stories]);

  useEffect(() => {
    // 切换语言是一次明确的重试机会，避免临时失败让用户一直看到原文。
    if (previousLanguage.current !== language) setTranslationFailedIds([]);
    previousLanguage.current = language;
  }, [language]);

  useEffect(() => {
    // 每篇故事只预取与原文相反的一个语言版本，使双向切换都优先命中数据库缓存。
    const missingByLanguage: Record<Language, string[]> = { zh: [], en: [] };
    for (const story of stories) {
      const targetLanguage = storyTranslationTarget(story);
      const requestKey = `${targetLanguage}:${story.id}`;
      if (
        !translations[targetLanguage][story.id] &&
        !translationInFlight.current.has(requestKey) &&
        !translationFailedIds.includes(story.id)
      ) {
        missingByLanguage[targetLanguage].push(story.id);
        translationInFlight.current.add(requestKey);
      }
    }
    const jobs = (["zh", "en"] as const).flatMap((targetLanguage) =>
      Array.from({ length: Math.ceil(missingByLanguage[targetLanguage].length / 5) }, (_, index) => ({
        targetLanguage,
        storyIds: missingByLanguage[targetLanguage].slice(index * 5, index * 5 + 5),
      })),
    );
    if (!jobs.length) return;
    const missingIds = jobs.flatMap((job) => job.storyIds);
    setTranslationPendingIds((current) => [...new Set([...current, ...missingIds])]);
    void Promise.allSettled(jobs.map((job) => dataService.translateStories(job.storyIds, job.targetLanguage))).then(
      (results) => {
        const completed: StoryTranslationCache = { zh: {}, en: {} };
        results.forEach((result, index) => {
          if (result.status === "fulfilled") Object.assign(completed[jobs[index].targetLanguage], result.value);
        });
        const failed = results.flatMap((result, index) => (result.status === "rejected" ? jobs[index].storyIds : []));
        if (Object.keys(completed.zh).length || Object.keys(completed.en).length) {
          setTranslations((current) => ({
            zh: { ...current.zh, ...completed.zh },
            en: { ...current.en, ...completed.en },
          }));
        }
        if (failed.length) {
          console.info("[StoryVerse] Some story translations are temporarily unavailable.");
          setTranslationFailedIds((current) => [...new Set([...current, ...failed])]);
        }
        jobs.forEach((job) =>
          job.storyIds.forEach((storyId) => translationInFlight.current.delete(`${job.targetLanguage}:${storyId}`)),
        );
        setTranslationPendingIds((current) => current.filter((storyId) => !missingIds.includes(storyId)));
      },
    );
  }, [language, stories, translations, translationFailedIds]);

  const selectedNode = selected ? (nodes.find((node) => node.id === selected.id) ?? selected) : null;
  const accessibleNodes = useMemo(
    () =>
      nodes.filter(
        (node) =>
          !removedStoryIds.includes(node.id) &&
          (activeView === "owned" ? node.ownedByCurrentUser : activeView === "liked" ? node.liked : true),
      ),
    [activeView, nodes, removedStoryIds],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      [...nodes]
        .filter((node) => node.imageUrl)
        .sort((a, b) => {
          if (a.isCenterStory !== b.isCenterStory) return a.isCenterStory ? -1 : 1;
          return (a.recommendationRank ?? Number.MAX_SAFE_INTEGER) - (b.recommendationRank ?? Number.MAX_SAFE_INTEGER);
        })
        .slice(0, 4)
        .forEach((node) => preloadStoryImage(node.imageUrl));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [nodes]);

  const nodeEventProperties = (node: StoryNodeData) => ({
    story_id: node.id,
    story_title: node.label,
    rank: node.recommendationRank ?? null,
    view_mode: activeViewRef.current,
    is_own_story: node.ownedByCurrentUser,
    story_status: node.status,
    type_id: node.category,
    has_image: Boolean(node.imageUrl),
    city_score: node.cityScore,
    scores: node.recommendationScores ?? null,
    recommendation_reason: node.recommendationReason ?? null,
    resonance_preferences: confirmedResonanceRef.current,
  });

  const trackScoreBreakdownView = (node: StoryNodeData, trigger: "hover" | "focus" | "tap") => {
    const eventKey = `${lobbyViewId}:${node.id}`;
    if (scoreBreakdownViewed.current.has(eventKey) || node.recommendationScores?.final_score == null) return;
    scoreBreakdownViewed.current.add(eventKey);
    track("recommendation_score_breakdown_viewed", {
      story_id: node.id,
      final_score: node.recommendationScores.final_score,
      rank: node.recommendationRank ?? null,
      trigger,
      resonance_preferences: confirmedResonanceRef.current,
    });
  };

  const finishRead = (endReason: string) => {
    const session = readSession.current;
    if (!session) return;
    session.timer.pause();
    const activeDurationMs = Math.round(session.timer.read());
    const wallDurationMs = Date.now() - session.wallStartedAt;
    const finalReaction = reactionsRef.current[session.node.id] ?? null;
    track("story_read_ended", {
      ...nodeEventProperties(session.node),
      read_id: session.id,
      active_duration_ms: activeDurationMs,
      wall_duration_ms: wallDurationMs,
      meaningful_read: isMeaningfulStoryRead(activeDurationMs, session.node.ownedByCurrentUser),
      end_reason: endReason,
      reaction_at_start: session.reactionAtStart,
      reaction_at_end: finalReaction,
    });
    readSession.current = null;
  };

  const selectNode = (node: StoryNodeData | null, closeReason = "panel_closed") => {
    if (!node) {
      finishRead(closeReason);
      setSelected(null);
      return;
    }
    if (readSession.current?.node.id === node.id) return;
    preloadStoryImage(node.imageUrl, "high");
    finishRead("story_switched");
    const readId = crypto.randomUUID();
    const timer = createActiveTimer();
    if (pageCanAccumulateTime()) timer.resume();
    readSession.current = {
      id: readId,
      node,
      timer,
      wallStartedAt: Date.now(),
      reactionAtStart: reactionsRef.current[node.id] ?? null,
    };
    const exposureKey = starExposureKey(lobbyViewIdRef.current, activeViewRef.current, node.id);
    track("star_clicked", {
      ...nodeEventProperties(node),
      read_id: readId,
      was_exposed: exposedAt.current.has(exposureKey),
      time_since_exposure_ms: exposedAt.current.has(exposureKey)
        ? Date.now() - Number(exposedAt.current.get(exposureKey))
        : null,
      previous_reaction: reactionsRef.current[node.id] ?? null,
    });
    track("story_read_started", { ...nodeEventProperties(node), read_id: readId });
    setSelected(node);
  };

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);
  useEffect(() => {
    lobbyViewIdRef.current = lobbyViewId;
  }, [lobbyViewId]);
  useEffect(() => {
    confirmedResonanceRef.current = confirmedResonance;
  }, [confirmedResonance]);
  useEffect(() => {
    reactionsRef.current = reactions;
  }, [reactions]);
  useEffect(() => {
    if (!showPosttestReminder || posttestReminderTracked.current) return;
    posttestReminderTracked.current = true;
    track("posttest_reminder_shown", {
      questionnaire_version: "posttest_v1",
      source: "star_lobby",
      status: posttestStatus,
    });
  }, [showPosttestReminder, posttestStatus]);
  useEffect(() => {
    if (!posttestNotice) return;
    setPosttestToast({ id: ++posttestToastId.current, message: posttestNotice });
    onPosttestNoticeConsumed?.();
  }, [posttestNotice, onPosttestNoticeConsumed]);
  useEffect(() => {
    if (!posttestToast) return;
    const timer = window.setTimeout(() => setPosttestToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [posttestToast]);
  useEffect(() => {
    updateAnalyticsContext({ lobbyViewId, recommendationBatchId: initialBatchId });
    if (!lobbyViewed.current) {
      lobbyViewed.current = true;
      track("star_lobby_viewed", {
        story_count: stories.length,
        owned_story_count: ownedStoryIds.length,
        recommendation_batch_id: initialBatchId,
      });
    }
  }, [lobbyViewId]);
  useEffect(() => {
    const sync = () => {
      if (pageCanAccumulateTime()) {
        lobbyActiveTimer.current.resume();
        readSession.current?.timer.resume();
      } else {
        lobbyActiveTimer.current.pause();
        readSession.current?.timer.pause();
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      finishRead("page_unmounted");
      lobbyActiveTimer.current.pause();
      track("lobby_gesture_summary", {
        ...gestureCounts.current,
        active_duration_ms: Math.round(lobbyActiveTimer.current.read()),
      });
    };
  }, []);

  useEffect(() => {
    const normalizedQuery = normalizeLobbySearchQuery(query);
    if (!normalizedQuery) return;
    const timer = window.setTimeout(() => {
      const key = `${activeView}:${normalizedQuery}`;
      if (key === lastSearchKey.current) return;
      lastSearchKey.current = key;
      track("lobby_search_executed", {
        raw_query: query,
        normalized_query: normalizedQuery,
        query_length: query.length,
        result_count: nodes.length,
        zero_results: nodes.length === 0,
        view_mode: activeView,
        language,
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [query, activeView, language, nodes.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && readSession.current) selectNode(null, "escape_key");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    setConfirmedResonance(resonance);
    setDraftResonance(resonance);
  }, [resonance]);

  useEffect(() => {
    if (resonanceLocked && activeView === "resonance") setActiveView("explore");
  }, [activeView, resonanceLocked]);

  const handleWheel = (event: React.WheelEvent<HTMLElement>) => {
    gestureCounts.current.wheel += 1;
    gestureCounts.current.zoom += 1;
    setZoom((current) => Math.max(0, Math.min(1, current + (event.deltaY < 0 ? 0.12 : -0.12))));
  };
  const handleViewChange = (view: NavigationItemId) => {
    if (resonanceLocked && view === "resonance") return;
    track("lobby_nav_clicked", { previous_view: activeView, view, changed: activeView !== view });
    selectNode(null, "view_changed");
    if (view === "resonance") {
      setDraftResonance(confirmedResonance);
      setResonanceError("");
    }
    setActiveView(view);
  };

  const confirmResonance = async () => {
    if (resonancePending) return;
    setResonancePending(true);
    setResonanceError("");
    const startedAt = performance.now();
    const previous = confirmedResonance;
    const changedDimensions = resonanceKeys.filter((key) => previous[key] !== draftResonance[key]);
    const oldBatchId = analyticsContext().recommendationBatchId;
    track("lobby_resonance_confirm_clicked", {
      source: "star_lobby",
      previous_preferences: previous,
      preferences: draftResonance,
      changed_dimensions: changedDimensions,
      old_recommendation_batch_id: oldBatchId,
    });
    try {
      const result = await onResonanceChange?.(draftResonance);
      const newBatchId = result?.batchId ?? null;
      const nextLobbyViewId = createLobbyView(newBatchId);
      setLobbyViewId(nextLobbyViewId);
      setConfirmedResonance(draftResonance);
      setActiveView("explore");
      track("lobby_resonance_refresh_result", {
        success: true,
        duration_ms: Math.round(performance.now() - startedAt),
        old_recommendation_batch_id: oldBatchId,
        new_recommendation_batch_id: newBatchId,
        story_count: result?.storyCount ?? null,
      });
    } catch (error) {
      console.info("[StoryVerse] Resonance update could not refresh recommendations.", error);
      setResonanceError(text.rearrangeFailed);
      track("lobby_resonance_refresh_result", {
        success: false,
        duration_ms: Math.round(performance.now() - startedAt),
        old_recommendation_batch_id: oldBatchId,
        error_code: error instanceof Error && "code" in error ? String(error.code) : "UNKNOWN",
      });
    } finally {
      setResonancePending(false);
    }
  };

  return (
    <main
      className="star-lobby-page"
      data-theme={themeMode}
      onWheel={handleWheel}
      onPointerDown={(event) => {
        if (event.button === 0 && event.target instanceof HTMLCanvasElement) gestureCounts.current.rotate += 1;
      }}
    >
      <GalaxyScene
        activeView={activeView}
        selected={selected}
        onSelect={selectNode}
        zoom={zoom}
        themeMode={themeMode}
        resonance={confirmedResonance}
        nodes={nodes}
        removedIds={removedStoryIds}
        lobbyViewId={lobbyViewId}
        onExpose={(node, visibleMs) => {
          preloadStoryImage(node.imageUrl);
          const key = starExposureKey(lobbyViewId, activeView, node.id);
          exposedAt.current.set(key, Date.now());
          track("star_exposed", { ...nodeEventProperties(node), visible_ms: visibleMs });
        }}
      />
      <div className="star-accessibility-list" aria-label={language === "zh" ? "星点故事列表" : "Story stars"}>
        {accessibleNodes.map((node) => (
          <button
            key={node.id}
            type="button"
            onClick={() => selectNode(node)}
            onPointerEnter={() => preloadStoryImage(node.imageUrl)}
            onFocus={() => preloadStoryImage(node.imageUrl)}
            aria-label={`${language === "zh" ? "打开星点故事" : "Open story star"}：${node.label}`}
          >
            {node.label}
          </button>
        ))}
      </div>
      <div className="meteor meteor-one" />
      <div className="meteor meteor-two" />
      <div className="meteor meteor-three" />
      <header className="top-overlay">
        <button
          className="brand brand-button"
          onClick={onHome}
          aria-label={language === "zh" ? "回到首页" : "Back home"}
        >
          <BrandLogo />
        </button>
        <div className="header-actions" data-tour="top-controls">
          <button
            className="neon-control theme-button"
            aria-label={text.theme}
            onClick={() => onThemeModeChange(themeMode === "night" ? "day" : "night")}
          >
            <Icon name={themeMode === "night" ? "sun" : "moon"} size={20} />
          </button>
          <button
            className="neon-control lang-button"
            data-tour="lang-button"
            aria-label={text.language}
            onClick={() => onLanguageChange(language === "zh" ? "en" : "zh")}
          >
            <span className={language === "zh" ? "lang-primary" : "lang-secondary"}>中文</span>
            <span className="lang-divider" />
            <span className={language === "en" ? "lang-primary" : "lang-secondary"}>ENG</span>
          </button>
          <AuthenticatedGreeting displayName={displayName} language={language} />
          <ExpandingSearch
            language={language}
            query={query}
            onQueryChange={setQuery}
            onOpen={() => track("lobby_search_opened", { view_mode: activeView })}
            onClear={(previousQuery) => {
              if (previousQuery) {
                track("lobby_search_cleared", {
                  previous_query: previousQuery,
                  result_count: nodes.length,
                  view_mode: activeView,
                });
              }
            }}
          />
        </div>
      </header>
      <p className="bottom-legend">{text.legend}</p>
      {selectedNode && (
        <StoryPanel
          key={selectedNode.id}
          node={selectedNode}
          language={language}
          resonance={confirmedResonance}
          reaction={reactions[selectedNode.id] ?? null}
          onClose={() => {
            track("story_panel_closed", { story_id: selectedNode.id, reason: "close_button" });
            selectNode(null, "close_button");
          }}
          onReactionChange={async (storyId, reaction) => {
            track("story_reaction_clicked", {
              story_id: storyId,
              previous_reaction: reactions[storyId] ?? null,
              reaction,
              source: "star_lobby",
            });
            await onReactionChange?.(storyId, reaction);
          }}
          onReportStory={onReportStory}
          onScoreBreakdownView={(trigger) => trackScoreBreakdownView(selectedNode, trigger)}
          translationPending={
            selectedNode.sourceLanguage !== language && translationPendingIds.includes(selectedNode.id)
          }
          translationFailed={selectedNode.sourceLanguage !== language && translationFailedIds.includes(selectedNode.id)}
        />
      )}
      {!resonanceLocked && activeView === "resonance" && (
        <ResonanceBar
          language={language}
          value={draftResonance}
          onChange={(next) => {
            const dimension = resonanceKeys.find((key) => next[key] !== draftResonance[key]);
            if (dimension) {
              track("lobby_resonance_option_clicked", {
                dimension,
                previous_mode: draftResonance[dimension],
                mode: next[dimension],
                changed: true,
                draft_preferences: next,
              });
            }
            setDraftResonance(next);
          }}
          onConfirm={confirmResonance}
          pending={resonancePending}
          error={resonanceError}
        />
      )}
      <AccountDock
        language={language}
        onLogout={onLogout ?? onHome}
        inbox={inbox}
        onMarkInboxRead={() => onMarkInboxRead?.()}
        onDisplayNameChange={onDisplayNameChange}
      />
      <FloatingMenu
        activeView={activeView}
        language={language}
        onChange={handleViewChange}
        resonanceLocked={resonanceLocked}
      />
      {showPosttestReminder && (
        <PosttestReminder
          onDismiss={() => {
            track("posttest_reminder_dismissed", {
              questionnaire_version: "posttest_v1",
              source: "star_lobby",
              status: posttestStatus,
            });
            onPosttestReminderDismiss?.();
          }}
        />
      )}
      {posttestAvailable && (
        <PosttestDock
          language={language}
          status={posttestStatus}
          onOpen={() => {
            if (showPosttestReminder) {
              track("posttest_reminder_dismissed", {
                questionnaire_version: "posttest_v1",
                source: "questionnaire_entry",
                status: posttestStatus,
              });
            }
            track("posttest_entry_clicked", {
              questionnaire_version: "posttest_v1",
              source: "star_lobby_button",
              status: posttestStatus,
            });
            onPosttestOpen?.();
          }}
          onCompletedClick={() => {
            track("posttest_completed_button_clicked", {
              questionnaire_version: "posttest_v1",
              source: "star_lobby_button",
              status: "completed",
            });
            setPosttestToast({
              id: ++posttestToastId.current,
              message:
                "你已经填写过后测问卷，感谢参与！ / You have already completed the post-study questionnaire. Thank you!",
            });
          }}
        />
      )}
      {posttestToast && (
        <div className="posttest-toast" role="status">
          <span aria-hidden="true">✓</span>
          {posttestToast.message}
        </div>
      )}
      {/*
        大厅是整条引导的终点：走完就停在大厅让用户自己逛，不要再跳去写故事。
        （这里以前会调 onStartStory()，那是大厅还排在流程最前面时的衔接方式。）
      */}
      {showTour && (
        <Tour scene="starLobby" language={language} onFinish={() => onTourFinish?.()} onSkip={() => onTourSkip?.()} />
      )}
    </main>
  );
}
