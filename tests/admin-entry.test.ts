import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { routePatchFromPath } from "../src/app/routes";

describe("管理员入口隔离", () => {
  it("公开登录页不披露管理员入口或审核人员文案", () => {
    const gateway = readFileSync(new URL("../src/features/gateway/Gateway.tsx", import.meta.url), "utf8");
    const content = readFileSync(new URL("../src/features/gateway/gateway-content.ts", import.meta.url), "utf8");
    expect(`${gateway}\n${content}`).not.toMatch(/审核人员|进入内容审核台|Reviewer\?|moderation desk|onAdmin/);
  });

  it("管理员仍可通过独立的 /Admin 地址进入", () => {
    expect(routePatchFromPath("/Admin").screen).toBe("admin");
    expect(routePatchFromPath("/StoryVerse/Admin").screen).toBe("intro");
  });
});
