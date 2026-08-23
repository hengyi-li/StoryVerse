import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalCss = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");
const starLobbyCss = readFileSync(new URL("../src/features/star-lobby/star-lobby.css", import.meta.url), "utf8");
const adminCss = readFileSync(new URL("../src/features/admin/admin.css", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("手机端响应式设计契约", () => {
  it("声明移动端 viewport，并兼容动态浏览器高度和安全区", () => {
    expect(indexHtml).toContain('name="viewport"');
    expect(indexHtml).toContain("width=device-width");
    expect(indexHtml).toContain("viewport-fit=cover");
    expect(globalCss).toContain("100dvh");
    expect(globalCss).toContain("env(safe-area-inset-top)");
    expect(globalCss).toContain("env(safe-area-inset-bottom)");
  });

  it("手机输入控件不会触发 iOS 自动放大，并保留可触控尺寸", () => {
    expect(globalCss).toMatch(/@media \(max-width: 760px\)[\s\S]*?input,[\s\S]*?font-size: 16px !important/);
    expect(globalCss).toContain("min-height: 44px");
    expect(globalCss).toContain("touch-action: manipulation");
  });

  it("创作、分析、确认和推荐流程在手机端改为单列或横向分页", () => {
    expect(globalCss).toMatch(/\.guide-panels \{[\s\S]*?scroll-snap-type: x mandatory/);
    expect(globalCss).toMatch(/\.analysis-steps-copy \{[\s\S]*?grid-template-columns: 1fr/);
    expect(globalCss).toMatch(/\.field-grid,[\s\S]*?grid-template-columns: 1fr/);
    expect(globalCss).toMatch(/\.recommendations-heading-actions \{[\s\S]*?grid-template-columns: 1fr/);
    expect(globalCss).toMatch(
      /\.image-style-option \.image-style-popover \{[\s\S]*?display: none;[\s\S]*?position: relative/,
    );
    expect(globalCss).toMatch(/\.image-style-option\.selected \.image-style-popover \{[\s\S]*?display: block/);
  });

  it("弹窗在手机端使用可滚动底部面板，不会被刘海或底部手势区遮挡", () => {
    expect(globalCss).toMatch(/\.modal-backdrop \{[\s\S]*?align-items: end/);
    expect(globalCss).toMatch(/\.story-modal,[\s\S]*?max-height: calc\(100dvh/);
    expect(starLobbyCss).toMatch(/\.star-lobby-modal-backdrop \{[\s\S]*?align-items: end/);
    expect(adminCss).toMatch(/\.admin-gate \{[\s\S]*?align-items: end/);
  });

  it("StarLobby 的搜索、故事详情和共鸣设置在手机端保持在视口内", () => {
    expect(starLobbyCss).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.search-expanded \{[\s\S]*?position: fixed/);
    expect(starLobbyCss).toMatch(/\.search-expanded \{[\s\S]*?box-sizing: border-box/);
    expect(starLobbyCss).toMatch(/\.story-panel \{[\s\S]*?bottom: calc\(72px \+ env\(safe-area-inset-bottom\)\)/);
    expect(starLobbyCss).toMatch(
      /\.resonance-bar \{[\s\S]*?left: max\(12px, env\(safe-area-inset-left\)\);[\s\S]*?max-height: calc\(100dvh/,
    );
    expect(starLobbyCss).toMatch(
      /@media \(max-height: 520px\) and \(orientation: landscape\)[\s\S]*?\.story-panel \{[\s\S]*?transform: none/,
    );
    expect(starLobbyCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.story-score-popover \{[\s\S]*?position: static;[\s\S]*?width: 100%/,
    );
  });

  it("管理后台在小屏上提供横向导航和单列筛选器", () => {
    expect(adminCss).toMatch(/@media \(max-width: 860px\)[\s\S]*?\.admin-nav \{[\s\S]*?scroll-snap-type: x proximity/);
    expect(adminCss).toMatch(/\.analytics-filter-panel,[\s\S]*?grid-template-columns: 1fr/);
  });
});
