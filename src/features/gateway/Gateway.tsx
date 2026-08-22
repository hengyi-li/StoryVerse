import { CSSProperties, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import generatedPortalBg from "../../assets/auragate-portal-bg-transparent.webp";
import nightWorldBg from "../../assets/storyverse-night-bg.webp";
import { BrandLogo } from "../../components/BrandLogo";
import { localizedError } from "../../lib/localized-error";
import { track } from "../../lib/analytics";
import { dataService, DataServiceError } from "../../services/data-service";
import type { Language } from "../../types/domain";
import type { AuthMode, GatewayAuthInput, GatewaySection, ThemeMode } from "../../types/ui";
import {
  WORLD_BG,
  clamp,
  easeInOut,
  gatewayCopy,
  introSlides,
  lerp,
  privacyUrl,
  quotes,
  termsUrl,
} from "./gateway-content";
import { styles } from "./gateway-styles";
import {
  getAccountIdentifierValidationIssue,
  getPasswordConfirmationState,
  type AccountIdentifierValidationIssue,
} from "./gateway-validation";

const PORTAL_BG = generatedPortalBg;

const securityQuestions = [
  { value: "first_school", zh: "你就读的第一所学校叫什么？", en: "What was the name of your first school?" },
  { value: "childhood_place", zh: "你童年最熟悉的地方叫什么？", en: "What place do you remember most from childhood?" },
  { value: "first_pet", zh: "你的第一个宠物叫什么？", en: "What was the name of your first pet?" },
] as const;

function getAccountIdentifierFeedback(
  issue: Exclude<AccountIdentifierValidationIssue, null>,
  copy: (typeof gatewayCopy)[Language],
) {
  if (issue === "required") return copy.accountRequired;
  if (issue === "too_short") return copy.accountTooShort;
  if (issue === "too_long") return copy.accountTooLong;
  return copy.accountInvalidCharacters;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

function Wordmark({
  isMobile,
  onClick,
  ariaLabel = "回到 StoryVerse 首页",
}: {
  isMobile: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const content = <BrandLogo inverted style={{ width: isMobile ? 100 : 180 }} />;
  if (onClick) {
    return (
      <button
        type="button"
        style={{ ...styles.wordmark, ...styles.wordmarkButton }}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {content}
      </button>
    );
  }
  return <div style={styles.wordmark}>{content}</div>;
}

function UnifiedLanguageButton({ language, onChange }: { language: Language; onChange: (language: Language) => void }) {
  return (
    <button
      type="button"
      className="neon-control lang-button"
      aria-label={language === "zh" ? "切换语言" : "Switch language"}
      onClick={() => onChange(language === "zh" ? "en" : "zh")}
    >
      <span className={language === "zh" ? "lang-primary" : "lang-secondary"}>中文</span>
      <span className="lang-divider" />
      <span className={language === "en" ? "lang-primary" : "lang-secondary"}>ENG</span>
    </button>
  );
}

function LoginWordmark({ isMobile }: { isMobile: boolean }) {
  return (
    <span style={styles.loginWordmarkLoose}>
      <BrandLogo inverted style={{ width: isMobile ? 154 : 238 }} />
    </span>
  );
}

function PortalIntro({
  isMobile,
  sceneOpacity,
  language,
}: {
  isMobile: boolean;
  sceneOpacity: number;
  language: Language;
}) {
  const [active, setActive] = useState(0);
  const slides = introSlides[language];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive((value) => (value + 1) % slides.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  return (
    <div
      aria-label="StoryVerse intro"
      style={{
        ...styles.portalIntro,
        opacity: Math.min(sceneOpacity, 1),
        transform: isMobile ? "translate(-50%, -51%) scale(0.86)" : "translate(-50%, -51%)",
      }}
    >
      {slides.map((slide, index) => (
        <div
          key={slide.join("")}
          style={{
            ...styles.portalIntroSlide,
            opacity: active === index ? 1 : 0,
            transform: active === index ? "translateY(0)" : "translateY(10px)",
          }}
        >
          {slide.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Chevron({ dir }: { dir: -1 | 1 }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d={dir === -1 ? "M11.25 4.5 6.75 9l4.5 4.5" : "M6.75 4.5 11.25 9l-4.5 4.5"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArcCardCarousel({ isMobile, language }: { isMobile: boolean; language: Language }) {
  const lines = quotes[language];
  const [active, setActive] = useState(Math.floor(lines.length / 2));
  const t = gatewayCopy[language];
  const total = lines.length;
  const half = Math.floor(total / 2);
  const cardW = isMobile ? 230 : 270;
  const cardH = isMobile ? 320 : 390;
  const stepX = isMobile ? 170 : 215;
  const dropY = isMobile ? 34 : 44;
  const tilt = isMobile ? 7 : 8;
  const containerH = isMobile ? 460 : 560;
  const centerBump = isMobile ? 22 : 30;

  const advance = (dir: -1 | 1) => setActive((value) => (value + dir + total) % total);

  return (
    <div style={{ ...styles.carousel, height: containerH }}>
      {lines.map((quote, index) => {
        let pos = index - active;
        if (pos > half) pos -= total;
        if (pos < -half) pos += total;

        const abs = Math.abs(pos);
        const isCenter = pos === 0;
        const quoteFontSize =
          language === "zh"
            ? isMobile
              ? quote.length > 160
                ? 12
                : 13
              : quote.length > 160
                ? 13
                : 14
            : isMobile
              ? quote.length > 500
                ? 11
                : 12
              : quote.length > 500
                ? 12
                : 13;
        const opacity = isCenter ? 1 : Math.max(0, 0.6 - (abs - 1) * 0.2);
        const transform = `translateX(${pos * stepX}px) translateY(${
          abs * dropY + (isCenter ? centerBump : 0)
        }px) rotate(${pos * tilt}deg)`;

        return (
          <button
            key={quote}
            style={{
              ...styles.arcCard,
              width: cardW,
              height: cardH,
              padding: isMobile ? 22 : 26,
              borderRadius: isMobile ? 22 : 28,
              opacity,
              zIndex: 100 - abs,
              pointerEvents: abs <= 2 ? "auto" : "none",
              transform,
              background: isCenter
                ? "rgb(247,251,255)"
                : "linear-gradient(135deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.24) 100%)",
              border: isCenter ? "1px solid rgba(255,255,255,0.6)" : "1px solid rgba(255,255,255,0.28)",
              boxShadow: isCenter
                ? "0 8px 24px rgba(0,0,0,0.08), 0 0 50px rgba(255,255,255,0.55), 0 0 90px rgba(255,255,255,0.35)"
                : "inset 0 1px 1px rgba(255,255,255,0.45)",
              backdropFilter: isCenter ? "none" : "blur(18px) saturate(140%)",
              WebkitBackdropFilter: isCenter ? "none" : "blur(18px) saturate(140%)",
              overflow: "hidden",
              cursor: isCenter ? "default" : "pointer",
            }}
            onClick={() => setActive(index)}
          >
            <p
              style={{
                ...styles.quote,
                color: isCenter ? "#2c2420" : "rgba(255,255,255,0.85)",
                width: "100%",
                maxHeight: "100%",
                overflowY: "auto",
                overscrollBehavior: "contain",
                scrollbarWidth: "thin",
                whiteSpace: "pre-line",
                fontSize: quoteFontSize,
              }}
            >
              “{quote}”
            </p>
          </button>
        );
      })}

      <div style={styles.carouselNav}>
        <button
          aria-label={t.previousStory}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            advance(-1);
          }}
          style={{
            ...styles.carouselButton,
            width: isMobile ? 42 : 46,
            height: isMobile ? 42 : 46,
            background: "rgba(255,255,255,0.2)",
            color: "#fff",
            filter: "drop-shadow(rgba(255,255,255,0.7) 0 0 6px) drop-shadow(rgba(255,255,255,0.4) 0 0 14px)",
          }}
        >
          <Chevron dir={-1} />
        </button>
        <button
          aria-label={t.nextStory}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            advance(1);
          }}
          style={{
            ...styles.carouselButton,
            width: isMobile ? 42 : 46,
            height: isMobile ? 42 : 46,
            background: "rgba(255,255,255,0.9)",
            color: "#2c2420",
            boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
          }}
        >
          <Chevron dir={1} />
        </button>
      </div>
    </div>
  );
}

export function Gateway({
  language = "zh",
  onLanguageChange = () => {},
  onHome,
  onComplete,
  section = "intro",
  authMode = "signup",
  onSectionChange,
  onAuthModeChange,
  themeMode = "day",
  onThemeModeChange = () => {},
}: {
  language?: Language;
  onLanguageChange?: (language: Language) => void;
  onHome?: () => void;
  onComplete: (input: GatewayAuthInput) => Promise<void> | void;
  section?: GatewaySection;
  authMode?: AuthMode;
  onSectionChange?: (section: GatewaySection) => void;
  onAuthModeChange?: (mode: AuthMode) => void;
  themeMode?: ThemeMode;
  onThemeModeChange?: (themeMode: ThemeMode) => void;
}) {
  const introRef = useRef<HTMLDivElement>(null);
  const loginRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const downHintRef = useRef<HTMLButtonElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const scrollProgress = useRef(0);
  const mouse = useRef({ rawX: 0, rawY: 0, x: 0, y: 0 });
  const isMobile = useIsMobile();
  const [uiVisible, setUiVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [portalLoaded, setPortalLoaded] = useState(true);
  const t = gatewayCopy[language];

  useEffect(() => {
    const timer = window.setTimeout(() => setUiVisible(true), 600);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const target =
      section === "intro" ? introRef.current : section === "preview" ? previewRef.current : loginRef.current;
    if (!target) return;
    const frame = window.requestAnimationFrame(() => target.scrollIntoView({ behavior: "auto", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [section]);

  const goToSection = useCallback(
    (nextSection: GatewaySection, behavior: ScrollBehavior = "smooth") => {
      if (nextSection === "preview") track("home_preview_opened", { source: "gateway" });
      else if (nextSection === "auth") track("home_cta_clicked", { target: "auth" });
      const target =
        nextSection === "intro" ? introRef.current : nextSection === "preview" ? previewRef.current : loginRef.current;
      onSectionChange?.(nextSection);
      window.requestAnimationFrame(() => {
        target?.scrollIntoView({ behavior, block: "start" });
      });
    },
    [onSectionChange],
  );

  useEffect(() => {
    const downHintButton = downHintRef.current;
    const goPreview = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      goToSection("preview");
    };
    downHintButton?.addEventListener("pointerdown", goPreview);
    downHintButton?.addEventListener("click", goPreview);
    return () => {
      downHintButton?.removeEventListener("pointerdown", goPreview);
      downHintButton?.removeEventListener("click", goPreview);
    };
  }, [goToSection]);

  useEffect(() => {
    const updateScroll = () => {
      if (!introRef.current) return;
      const distance = introRef.current.offsetHeight - window.innerHeight;
      const next = distance <= 0 ? 0 : clamp(window.scrollY / distance);
      scrollProgress.current = next;
      setProgress(next);
    };

    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("resize", updateScroll);
    return () => {
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("resize", updateScroll);
    };
  }, []);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      mouse.current.rawX = (event.clientX / window.innerWidth - 0.5) * 2;
      mouse.current.rawY = (event.clientY / window.innerHeight - 0.5) * 2;
    };

    let raf = 0;
    const tick = () => {
      const ep = easeInOut(scrollProgress.current);
      mouse.current.x = lerp(mouse.current.x, mouse.current.rawX, 0.07);
      mouse.current.y = lerp(mouse.current.y, mouse.current.rawY, 0.07);
      const rx = -mouse.current.x;
      const ry = -mouse.current.y;
      const worldScale = lerp(1, 1.18, ep);
      const portalScale = lerp(1, 7.5, ep);

      if (worldRef.current) {
        worldRef.current.style.transform = `scale(${worldScale}) translate(${rx * 6}px, ${ry * 6}px)`;
      }
      if (portalRef.current) {
        portalRef.current.style.transform = `scale(${portalScale}) translate(${rx * 7}px, ${ry * 7}px)`;
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMouseMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  const scene1Opacity = clamp(1 - progress / 0.22);
  const portalOpacity = progress <= 0.66 ? 1 : clamp(1 - (progress - 0.66) / 0.22);
  const isNight = themeMode === "night";

  const visibleMotion = useMemo<CSSProperties>(
    () => ({
      opacity: uiVisible ? scene1Opacity : 0,
      transform: uiVisible ? "translateY(0)" : "translateY(24px)",
      pointerEvents: scene1Opacity < 0.05 ? "none" : "auto",
    }),
    [scene1Opacity, uiVisible],
  );

  return (
    <main style={{ ...styles.root, background: isNight ? "#000" : styles.root.background }}>
      <div style={{ ...styles.worldLayer, background: isNight ? "#000" : undefined }}>
        <div ref={worldRef} style={styles.worldInner}>
          <img
            src={isNight ? nightWorldBg : WORLD_BG}
            alt=""
            style={{
              ...styles.worldImage,
              filter: isNight ? "contrast(1.08) saturate(0.9)" : styles.worldImage.filter,
            }}
          />
        </div>
      </div>

      <nav className="gateway-responsive-nav" style={{ ...styles.nav, padding: isMobile ? "14px 12px" : "26px 40px" }}>
        <Wordmark isMobile={isMobile} onClick={onHome} ariaLabel={t.homeAria} />
        <div className="gateway-responsive-nav-actions" style={{ ...styles.navActions, gap: isMobile ? 6 : 14 }}>
          <button
            type="button"
            className="neon-control theme-button"
            aria-label={language === "zh" ? "切换白天 / 深夜模式" : "Switch day / night mode"}
            onClick={() => onThemeModeChange(isNight ? "day" : "night")}
          >
            {isNight ? "☀" : "☾"}
          </button>
          {progress < 0.58 ? (
            <>
              <button
                ref={skipRef}
                type="button"
                className="neon-control gateway-skip-control"
                style={{ ...styles.watchDemo, padding: isMobile ? "8px 10px" : "11px 22px" }}
                onClick={() => goToSection("auth")}
              >
                {t.skip}
              </button>
              <UnifiedLanguageButton language={language} onChange={onLanguageChange} />
            </>
          ) : (
            <UnifiedLanguageButton language={language} onChange={onLanguageChange} />
          )}
        </div>
      </nav>

      <section ref={introRef} style={styles.introTrack}>
        <div style={styles.stickyStage}>
          <div
            ref={portalRef}
            style={{
              ...styles.portalLayer,
              opacity: portalOpacity,
            }}
          >
            <div style={{ ...styles.portalFallback, opacity: portalLoaded ? 0 : 1 }}>
              <div style={styles.fallbackWindowShadow} />
              <div style={styles.fallbackWindowOuter}>
                <div style={styles.fallbackTopVent} />
                <div style={styles.fallbackWindowRim}>
                  <div style={styles.fallbackSkyOpening} />
                </div>
              </div>
            </div>
            <img
              src={PORTAL_BG}
              alt=""
              onLoad={() => setPortalLoaded(true)}
              onError={() => setPortalLoaded(false)}
              style={{
                ...styles.portalImage,
                opacity: portalLoaded ? 1 : 0,
              }}
            />
            <PortalIntro isMobile={isMobile} sceneOpacity={scene1Opacity} language={language} />
            <button
              ref={downHintRef}
              type="button"
              onClick={() => goToSection("preview")}
              onPointerDown={() => goToSection("preview")}
              style={{ ...styles.portalDownHint, opacity: scene1Opacity }}
            >
              <span style={{ display: "inline-block", transform: "scaleX(1.45)" }}>↓</span> {t.scrollDown}
            </button>
          </div>

          <div
            className="absolute inset-x-0 bottom-0 flex flex-col md:flex-row md:items-end md:justify-between gap-12 md:gap-20"
            style={{
              ...styles.sceneOne,
              flexDirection: isMobile ? "column" : "row",
              alignItems: isMobile ? "flex-start" : "flex-end",
              gap: isMobile ? 48 : 80,
              padding: isMobile ? "0 22px 40px" : "0 44px 52px",
              ...visibleMotion,
            }}
          >
            <div style={styles.heroColumn}>
              <h1
                aria-label={`${t.heroPrefix} ${t.heroMain} ${t.heroBrand}`}
                style={{
                  ...styles.heroTitle,
                  fontSize: isMobile ? "clamp(30px,9vw,44px)" : "clamp(40px,4vw,58px)",
                }}
              >
                <span style={styles.discover}>{t.heroPrefix}</span>
                {t.heroMain}
                <br />
                {t.heroBrand}
              </h1>
              <p style={styles.heroBody}>{t.heroBody}</p>
            </div>

            {!isMobile && (
              <div style={styles.partner}>
                <span style={styles.partnerMark}>S.</span>
                <p style={styles.partnerCopy}>{t.partner}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section ref={previewRef} style={{ ...styles.sectionTwo, paddingTop: isMobile ? "12vh" : "14vh" }}>
        <div style={styles.sectionHeader}>
          <h2 style={{ ...styles.sectionTitle, fontSize: "clamp(34px,4vw,52px)" }}>
            {t.previewTitle[0]}
            <br />
            {t.previewTitle[1]}
          </h2>
          <p style={styles.sectionSubtitle}>{t.previewSubtitle}</p>
        </div>
        <ArcCardCarousel isMobile={isMobile} language={language} />
        <ImmersiveLogin
          isMobile={isMobile}
          onComplete={onComplete}
          authRef={loginRef}
          mode={authMode}
          language={language}
          onModeChange={(mode) => onAuthModeChange?.(mode)}
        />
        <Footer isMobile={isMobile} language={language} />
      </section>
    </main>
  );
}

function Footer({ isMobile, language }: { isMobile: boolean; language: Language }) {
  const t = gatewayCopy[language];
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <footer style={{ ...styles.footer, padding: isMobile ? "120px 22px 40px" : "160px 44px 52px" }}>
      <div
        style={{
          ...styles.footerGrid,
          gridTemplateColumns: isMobile ? "1fr 1fr" : "1.4fr 1fr 1fr 1fr",
          gap: isMobile ? "32px 20px" : 40,
        }}
      >
        <div style={{ gridColumn: isMobile ? "1 / -1" : "auto" }}>
          <Wordmark isMobile={false} />
          <p style={styles.copyright}>© 2026 StoryVerse</p>
        </div>
        <div>
          <h3 style={styles.footerTitle}>{language === "zh" ? "探索" : "Explore"}</h3>
          <div style={styles.footerLinks}>
            <button
              type="button"
              style={{ ...styles.footerLink, ...styles.footerButtonLink }}
              onClick={() => setGuideOpen(true)}
            >
              {t.footerHowItWorks}
            </button>
          </div>
        </div>
        <div>
          <h3 style={styles.footerTitle}>{t.footerContact}</h3>
          <div style={styles.footerLinks}>
            <a href="https://www.xiaohongshu.com/" target="_blank" rel="noreferrer" style={styles.footerLink}>
              {t.footerRed}
            </a>
            <a href={`mailto:${t.footerEmail}`} style={styles.footerLink}>
              {t.footerEmail}
            </a>
          </div>
        </div>
        <div>
          <h3 style={styles.footerTitle}>{t.footerLegal}</h3>
          <div style={styles.footerLinks}>
            <a href={privacyUrl} target="_blank" rel="noreferrer" style={styles.footerLink}>
              {t.footerPrivacy}
            </a>
            <a href={termsUrl} target="_blank" rel="noreferrer" style={styles.footerLink}>
              {t.footerTerms}
            </a>
          </div>
        </div>
      </div>
      {guideOpen && (
        <div
          className="gateway-modal-backdrop"
          style={styles.gatewayModalBackdrop}
          onMouseDown={(event) => event.target === event.currentTarget && setGuideOpen(false)}
        >
          <div className="gateway-modal" style={styles.gatewayModal}>
            <button type="button" style={styles.gatewayModalClose} onClick={() => setGuideOpen(false)}>
              ×
            </button>
            <p style={styles.gatewayModalEyebrow}>StoryVerse Guide</p>
            <h2 style={styles.gatewayModalTitle}>{t.footerHowItWorksTitle}</h2>
            <p style={styles.gatewayModalBody}>{t.footerHowItWorksBody}</p>
            <div style={styles.guideSteps}>
              {t.footerHowItWorksSteps.map((step, index) => (
                <div key={step} style={styles.guideStepItem}>
                  <span style={styles.guideStepIndex}>{index + 1}</span>
                  <p style={styles.guideStepText}>{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}

function ImmersiveLogin({
  isMobile,
  onComplete,
  authRef,
  mode,
  language,
  onModeChange,
}: {
  isMobile: boolean;
  onComplete: (input: GatewayAuthInput) => Promise<void> | void;
  authRef: RefObject<HTMLElement>;
  mode: AuthMode;
  language: Language;
  onModeChange: (mode: AuthMode) => void;
}) {
  const [nickname, setNickname] = useState("");
  const [accountIdentifier, setAccountIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [accountError, setAccountError] = useState("");
  const [accountTouched, setAccountTouched] = useState(false);
  const passwordConfirmationState = getPasswordConfirmationState(password, passwordConfirmation);
  const accountValidationIssue = getAccountIdentifierValidationIssue(accountIdentifier);
  const t = gatewayCopy[language];
  const accountFormatError =
    accountValidationIssue && (accountTouched || accountIdentifier.length > 0)
      ? getAccountIdentifierFeedback(accountValidationIssue, t)
      : "";
  const accountFeedback = accountError || accountFormatError;
  const valid =
    accountValidationIssue === null &&
    password.length >= 10 &&
    password.length <= 72 &&
    (mode === "login" ||
      (nickname.trim().length >= 1 &&
        passwordConfirmationState === "match" &&
        Boolean(securityQuestion) &&
        securityAnswer.trim().length >= 2));
  const changeMode = (nextMode: AuthMode) => {
    setAuthError("");
    setAccountError("");
    track("auth_mode_changed", { previous_mode: mode, mode: nextMode });
    onModeChange(nextMode);
  };
  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setAuthError("");
    setAccountError("");
    try {
      await onComplete({
        mode,
        displayName: nickname.trim(),
        accountIdentifier: accountIdentifier.trim(),
        password,
        passwordConfirmation,
        securityQuestion,
        securityAnswer: securityAnswer.trim(),
      });
    } catch (error) {
      if (mode === "signup" && error instanceof DataServiceError && error.code === "ACCOUNT_EXISTS") {
        setAccountError(t.accountExists);
      } else {
        setAuthError(
          localizedError(error, language, {
            zh: "暂时无法登录，请稍后重试。",
            en: "Unable to sign in. Please try again.",
          }),
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="storyverse-auth"
      className="gateway-login-section"
      ref={authRef}
      style={{ ...styles.loginSection, padding: isMobile ? "92px 22px 40px" : "132px 44px 36px" }}
    >
      <div
        style={{
          ...styles.loginPanel,
          gridTemplateColumns: isMobile ? "1fr" : "1fr 420px",
          minHeight: isMobile ? "auto" : "min(720px,78vh)",
        }}
      >
        <div
          className="gateway-login-copy"
          style={{
            ...styles.loginCopy,
            minHeight: isMobile ? 280 : styles.loginCopy.minHeight,
            padding: isMobile ? "30px 24px" : styles.loginCopy.padding,
            borderRadius: isMobile ? 26 : styles.loginCopy.borderRadius,
          }}
        >
          <p style={styles.loginEyebrow}>{t.loginEyebrow}</p>
          <h2 style={{ ...styles.loginTitle, fontSize: isMobile ? 44 : 72 }}>
            <span style={styles.welcomeLight}>{t.welcome}</span>
            <span style={styles.loginWordmarkLine}>
              <LoginWordmark isMobile={isMobile} />
            </span>
          </h2>
        </div>
        <div
          className="gateway-auth-card-responsive"
          style={{
            ...styles.authCard,
            padding: isMobile ? "22px 18px 24px" : styles.authCard.padding,
            borderRadius: isMobile ? 26 : styles.authCard.borderRadius,
          }}
        >
          <div style={styles.segmented}>
            <button
              style={{
                ...styles.segmentButton,
                background: mode === "signup" ? "#fff" : "transparent",
                color: mode === "signup" ? "#151515" : "#0b8fe8",
              }}
              onClick={() => changeMode("signup")}
            >
              {t.signup}
            </button>
            <button
              style={{
                ...styles.segmentButton,
                background: mode === "login" ? "#fff" : "transparent",
                color: mode === "login" ? "#151515" : "#0b8fe8",
              }}
              onClick={() => changeMode("login")}
            >
              {t.login}
            </button>
          </div>
          {mode === "signup" && (
            <label style={styles.fieldLabel}>
              {t.nickname}
              <input
                style={styles.inputShell}
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                type="text"
                placeholder={t.nicknamePlaceholder}
              />
            </label>
          )}
          <label style={styles.fieldLabel}>
            {t.accountIdentifier}
            <input
              style={{
                ...styles.inputShell,
                borderColor: accountFeedback ? "rgba(255, 118, 103, 0.95)" : styles.inputShell.borderColor,
              }}
              value={accountIdentifier}
              onChange={(event) => {
                setAccountIdentifier(event.target.value);
                setAccountError("");
              }}
              onBlur={() => setAccountTouched(true)}
              type="text"
              inputMode="text"
              placeholder={t.accountIdentifierPlaceholder}
              aria-invalid={Boolean(accountFeedback)}
              aria-describedby={accountFeedback ? "auth-account-error" : undefined}
            />
            {accountFeedback && (
              <small id="auth-account-error" role="alert" style={{ ...styles.fieldFeedback, color: "#ffe1dc" }}>
                {accountFeedback}
              </small>
            )}
          </label>
          <label style={styles.fieldLabel}>
            {t.password}
            <input
              style={styles.inputShell}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder={mode === "signup" ? t.signupPasswordPlaceholder : t.loginPasswordPlaceholder}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
            {mode === "signup" && (
              <small style={styles.fieldFeedback}>
                {language === "zh" ? "使用 10–72 位密码" : "Use 10–72 characters"}
              </small>
            )}
          </label>
          {mode === "signup" && (
            <>
              <label style={styles.fieldLabel}>
                {t.confirmPassword}
                <input
                  style={{
                    ...styles.inputShell,
                    borderColor:
                      passwordConfirmationState === "mismatch"
                        ? "rgba(255, 118, 103, 0.95)"
                        : passwordConfirmationState === "match"
                          ? "rgba(151, 238, 199, 0.88)"
                          : styles.inputShell.borderColor,
                  }}
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                  type="password"
                  placeholder={t.confirmPassword}
                  autoComplete="new-password"
                  aria-invalid={passwordConfirmationState === "mismatch"}
                  aria-describedby={passwordConfirmationState === "idle" ? undefined : "signup-password-status"}
                />
                {passwordConfirmationState !== "idle" && (
                  <small
                    id="signup-password-status"
                    role={passwordConfirmationState === "mismatch" ? "alert" : "status"}
                    style={{
                      ...styles.fieldFeedback,
                      color: passwordConfirmationState === "match" ? "#c3f7dd" : "#ffe1dc",
                    }}
                  >
                    {passwordConfirmationState === "match" ? t.passwordMatch : t.passwordMismatch}
                  </small>
                )}
              </label>
              <label style={styles.fieldLabel}>
                {t.securityQuestion}
                <select
                  style={styles.inputShell}
                  value={securityQuestion}
                  onChange={(event) => setSecurityQuestion(event.target.value)}
                >
                  <option value="">{language === "zh" ? "请选择" : "Choose one"}</option>
                  {securityQuestions.map((question) => (
                    <option value={question.value} key={question.value}>
                      {language === "zh" ? question.zh : question.en}
                    </option>
                  ))}
                </select>
              </label>
              <label style={styles.fieldLabel}>
                {t.securityAnswer}
                <input
                  style={styles.inputShell}
                  value={securityAnswer}
                  onChange={(event) => setSecurityAnswer(event.target.value)}
                  type="text"
                  autoComplete="off"
                  placeholder={
                    language === "zh"
                      ? "填写 2–80 字，并记住这个答案"
                      : "Enter 2–80 characters and remember this answer"
                  }
                />
              </label>
            </>
          )}
          {authError && (
            <p role="alert" style={{ color: "#b42318", fontSize: 13, margin: "0 0 12px" }}>
              {authError}
            </p>
          )}
          <button
            style={{
              ...styles.primaryButton,
              opacity: valid && !submitting ? 1 : 0.48,
              cursor: valid && !submitting ? "pointer" : "not-allowed",
            }}
            disabled={!valid || submitting}
            onClick={() => void submit()}
          >
            {submitting
              ? language === "zh"
                ? "正在连接…"
                : "Connecting…"
              : mode === "signup"
                ? t.createAccount
                : t.enter}
          </button>
          <div style={styles.loginAssist}>
            {mode === "login" && (
              <p style={styles.loginHint}>
                {t.forgotPrefix}{" "}
                <button
                  type="button"
                  style={styles.loginHintLink}
                  onClick={() => {
                    track("password_recovery_started");
                    setResetOpen(true);
                  }}
                >
                  {t.forgotAction}
                </button>
              </p>
            )}
            <p style={styles.loginHint}>
              {mode === "signup" ? `${t.already} ` : `${t.newHere} `}
              <button
                type="button"
                style={styles.loginHintLink}
                onClick={() => changeMode(mode === "signup" ? "login" : "signup")}
              >
                {mode === "signup" ? t.login : t.signup}
              </button>
            </p>
          </div>
        </div>
      </div>
      {resetOpen && <PasswordResetDialog language={language} onClose={() => setResetOpen(false)} />}
    </section>
  );
}

function PasswordResetDialog({ language, onClose }: { language: Language; onClose: () => void }) {
  const t = gatewayCopy[language];
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [accountTouched, setAccountTouched] = useState(false);
  const passwordConfirmationState = getPasswordConfirmationState(password, confirm);
  const accountValidationIssue = getAccountIdentifierValidationIssue(account);
  const accountFeedback =
    accountValidationIssue && (accountTouched || account.length > 0)
      ? getAccountIdentifierFeedback(accountValidationIssue, t)
      : "";
  const canSubmit =
    accountValidationIssue === null &&
    password.length >= 10 &&
    password.length <= 72 &&
    passwordConfirmationState === "match" &&
    Boolean(securityQuestion) &&
    securityAnswer.trim().length >= 2;

  return (
    <div
      className="gateway-modal-backdrop"
      style={styles.gatewayModalBackdrop}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="gateway-modal gateway-reset-modal" style={{ ...styles.gatewayModal, ...styles.resetModal }}>
        <button type="button" style={styles.gatewayModalClose} onClick={onClose}>
          ×
        </button>
        <p style={styles.gatewayModalEyebrow}>Account Recovery</p>
        <h2 style={styles.gatewayModalTitle}>{t.resetTitle}</h2>
        <p style={styles.gatewayModalBody}>{done ? t.resetDone : t.resetLead}</p>
        {!done && (
          <div style={styles.resetForm}>
            <label style={styles.resetLabel}>
              {t.resetAccount}
              <input
                style={{
                  ...styles.resetInput,
                  borderColor: accountFeedback ? "rgba(255, 118, 103, 0.95)" : styles.resetInput.borderColor,
                }}
                value={account}
                onChange={(event) => setAccount(event.target.value)}
                onBlur={() => setAccountTouched(true)}
                placeholder={t.accountIdentifierPlaceholder}
                aria-invalid={Boolean(accountFeedback)}
                aria-describedby={accountFeedback ? "reset-account-error" : undefined}
              />
              {accountFeedback && (
                <small id="reset-account-error" role="alert" style={{ ...styles.fieldFeedback, color: "#ffe1dc" }}>
                  {accountFeedback}
                </small>
              )}
            </label>
            <label style={styles.resetLabel}>
              {t.resetPassword}
              <input
                style={styles.resetInput}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder={t.signupPasswordPlaceholder}
                autoComplete="new-password"
              />
              <small style={styles.fieldFeedback}>
                {language === "zh" ? "使用 10–72 位密码" : "Use 10–72 characters"}
              </small>
            </label>
            <label style={styles.resetLabel}>
              {t.resetConfirm}
              <input
                style={{
                  ...styles.resetInput,
                  borderColor:
                    passwordConfirmationState === "mismatch"
                      ? "rgba(255, 118, 103, 0.95)"
                      : passwordConfirmationState === "match"
                        ? "rgba(151, 238, 199, 0.88)"
                        : styles.resetInput.borderColor,
                }}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                type="password"
                placeholder={t.resetConfirm}
                autoComplete="new-password"
                aria-invalid={passwordConfirmationState === "mismatch"}
                aria-describedby={passwordConfirmationState === "idle" ? undefined : "reset-password-status"}
              />
              {passwordConfirmationState !== "idle" && (
                <small
                  id="reset-password-status"
                  role={passwordConfirmationState === "mismatch" ? "alert" : "status"}
                  style={{
                    ...styles.fieldFeedback,
                    color: passwordConfirmationState === "match" ? "#c3f7dd" : "#ffe1dc",
                  }}
                >
                  {passwordConfirmationState === "match" ? t.passwordMatch : t.passwordMismatch}
                </small>
              )}
            </label>
            <label style={styles.resetLabel}>
              {t.securityQuestion}
              <select
                style={styles.resetInput}
                value={securityQuestion}
                onChange={(event) => setSecurityQuestion(event.target.value)}
              >
                <option value="">{language === "zh" ? "请选择" : "Choose one"}</option>
                {securityQuestions.map((question) => (
                  <option value={question.value} key={question.value}>
                    {language === "zh" ? question.zh : question.en}
                  </option>
                ))}
              </select>
            </label>
            <label style={styles.resetLabel}>
              {t.resetCode}
              <input
                style={styles.resetInput}
                value={securityAnswer}
                onChange={(event) => setSecurityAnswer(event.target.value)}
                autoComplete="off"
                placeholder={t.securityAnswer}
              />
            </label>
            {error && <p style={{ ...styles.gatewayModalBody, color: "#ffe0e0" }}>{error}</p>}
            <button
              type="button"
              style={{ ...styles.primaryButton, marginTop: 18, opacity: canSubmit ? 1 : 0.48 }}
              disabled={!canSubmit}
              onClick={() => {
                setError("");
                void dataService
                  .resetPassword({
                    accountIdentifier: account,
                    securityQuestion,
                    securityAnswer,
                    password,
                    passwordConfirmation: confirm,
                  })
                  .then(() => {
                    setDone(true);
                    track("password_recovery_result", { success: true });
                  })
                  .catch((reason) => {
                    track("password_recovery_result", {
                      success: false,
                      error_code: reason instanceof Error && "code" in reason ? String(reason.code) : "UNKNOWN",
                    });
                    setError(
                      localizedError(reason, language, {
                        zh: "暂时无法修改密码。",
                        en: "Could not update the password.",
                      }),
                    );
                  });
              }}
            >
              {t.resetSubmit}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
