import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gatewayCopy } from "../src/features/gateway/gateway-content";

describe("Gateway 注册与欢迎页文案", () => {
  it("使用短昵称提示和独立的名句署名", () => {
    expect(gatewayCopy.zh.nicknameHint).toBe("昵称会被公开显示");
    expect(gatewayCopy.en.nicknameHint).toBe("Others will see this instead of username");
    expect(gatewayCopy.zh.previewQuote).toBe("构成我们的不是原子，而是故事。");
    expect(gatewayCopy.zh.previewAuthor).toContain("米里尔");
    expect(gatewayCopy.en.previewAuthor).toContain("Muriel Rukeyser");
  });

  it("昵称位于完整密保问题和答案之后", () => {
    const source = readFileSync("src/features/gateway/Gateway.tsx", "utf8");
    const signupBlock = source.slice(
      source.indexOf("function ImmersiveLogin"),
      source.indexOf("function PasswordResetDialog"),
    );
    expect(signupBlock.lastIndexOf("{t.nickname}")).toBeGreaterThan(signupBlock.lastIndexOf("{t.securityAnswer}"));
  });

  it("欢迎卡片使用独立的紧凑品牌资源", () => {
    expect(existsSync("src/assets/storyverse-wordmark-tight.svg")).toBe(true);
    const source = readFileSync("src/features/gateway/Gateway.tsx", "utf8");
    expect(source).toContain("gateway-login-wordmark");
  });
});
