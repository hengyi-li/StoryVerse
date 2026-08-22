import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

describe("CloudBase deployment contract", () => {
  it("生产构建不再生成 GitHub Pages 404 副本", () => {
    expect(packageJson.scripts.build).toBe("tsc --noEmit && vite build");
    expect(existsSync(".github/workflows/pages.yml")).toBe(false);
  });

  it("CloudBase 构建先测试，再构建并扫描产物", () => {
    expect(packageJson.scripts["build:cloudbase"]).toBe(
      "npm test && npm run build && node scripts/create-spa-route-fallbacks.mjs && node scripts/verify-cloudbase-build.mjs",
    );
  });

  it("CloudBase 构建为所有可直接访问页面生成 SPA 入口", () => {
    const routeFallbackScript = readFileSync("scripts/create-spa-route-fallbacks.mjs", "utf8");
    for (const route of [
      "StoryStart",
      "StoryWrite",
      "StoryAnalyzing",
      "StoryPage",
      "Resonance",
      "Recommendations",
      "StarLobby",
      "Admin",
    ]) {
      expect(routeFallbackScript).toContain(`"${route}"`);
    }
  });

  it("仓库提供腾讯云配置、拨测和回滚说明", () => {
    const guide = readFileSync("docs/deployment/tencent-cloud.md", "utf8");
    expect(guide).toContain("npm run build:cloudbase");
    expect(guide).toContain("FRONTEND_ORIGINS");
    expect(guide).toContain("x-storyverse-monitor-token");
    expect(guide).toContain("git revert");
  });
});
