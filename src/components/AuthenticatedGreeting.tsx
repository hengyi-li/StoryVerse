import type { Language } from "../types/domain";

export function AuthenticatedGreeting({ displayName, language }: { displayName: string; language: Language }) {
  const safeDisplayName = displayName.trim() || (language === "zh" ? "故事讲述者" : "Storyteller");

  return (
    <div
      className="authenticated-greeting"
      aria-label={language === "zh" ? `当前登录昵称：${safeDisplayName}` : `Signed in as ${safeDisplayName}`}
    >
      <span className="authenticated-greeting-star" aria-hidden="true">
        ✦
      </span>
      <span>{language === "zh" ? "你好，" : "Hello, "}</span>
      <strong title={safeDisplayName}>{safeDisplayName}</strong>
    </div>
  );
}
