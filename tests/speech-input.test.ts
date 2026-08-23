import { describe, expect, it } from "vitest";
import { shouldUseSystemDictation } from "../src/services/speech-input";

describe("语音输入设备策略", () => {
  it("手机宽度或粗指针设备使用系统键盘听写", () => {
    expect(shouldUseSystemDictation(true, false)).toBe(true);
    expect(shouldUseSystemDictation(false, true)).toBe(true);
    expect(shouldUseSystemDictation(true, true)).toBe(true);
  });

  it("桌面细指针和宽视口保留浏览器语音识别", () => {
    expect(shouldUseSystemDictation(false, false)).toBe(false);
  });
});
