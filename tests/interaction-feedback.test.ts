import { afterEach, describe, expect, it, vi } from "vitest";
import { reactionFeedbackCopy } from "../src/lib/reaction-feedback";
import { downloadStoryImage, preloadStoryImage, storyImageThumbnailUrl } from "../src/services/story-image";

afterEach(() => vi.unstubAllGlobals());

describe("故事图片下载方式", () => {
  it("下载原图文件，不打开新标签页", async () => {
    const anchor = { href: "", download: "", rel: "", click: vi.fn() };
    const createElement = vi.fn(() => anchor);
    const blob = new Blob(["image"], { type: "image/jpeg" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(blob) });
    const createObjectURL = vi.fn(() => "blob:story-image");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("document", { createElement });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const fileName = await downloadStoryImage("https://example.test/story.jpg", "周末的相遇:一次改变/选择");

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/story.jpg", { credentials: "omit" });
    expect(createElement).toHaveBeenCalledWith("a");
    expect(anchor.href).toBe("blob:story-image");
    expect(anchor.download).toBe("周末的相遇-一次改变-选择.jpg");
    expect(anchor).not.toHaveProperty("target");
    expect(anchor.rel).toBe("noopener");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:story-image");
    expect(fileName).toBe(anchor.download);
  });

  it("StarLobby 使用 768px 正方形缩略图，同时保留原图地址供下载", () => {
    const original = "https://project.supabase.co/storage/v1/object/public/story-images/user/story/generated.jpeg";
    const thumbnail = new URL(storyImageThumbnailUrl(original));

    expect(thumbnail.pathname).toBe("/storage/v1/render/image/public/story-images/user/story/generated.jpeg");
    expect(thumbnail.searchParams.get("width")).toBe("768");
    expect(thumbnail.searchParams.get("height")).toBe("768");
    expect(thumbnail.searchParams.get("resize")).toBe("cover");
    expect(thumbnail.searchParams.get("quality")).toBe("75");
    expect(original).toContain("/storage/v1/object/public/");
  });

  it("本地 Supabase 未启用图片变换时继续使用原图", () => {
    const local = "http://127.0.0.1:54321/storage/v1/object/public/story-images/story.jpeg";
    expect(storyImageThumbnailUrl(local)).toBe(local);
  });

  it("预加载图片使用异步解码和指定优先级", () => {
    const ImageMock = vi.fn(
      class {
        decoding = "auto";
        fetchPriority = "auto";
        src = "";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
      },
    );
    vi.stubGlobal("Image", ImageMock);

    preloadStoryImage("https://example.test/preload-story.jpeg", "high");

    expect(ImageMock).toHaveBeenCalledOnce();
    const image = ImageMock.mock.results[0].value;
    expect(image.decoding).toBe("async");
    expect(image.fetchPriority).toBe("high");
    expect(image.src).toBe("https://example.test/preload-story.jpeg");
  });
});

describe("故事反应反馈", () => {
  it("明确反馈不喜欢、取消和失败状态", () => {
    expect(reactionFeedbackCopy("zh", "dislike", "saving")).toBe("正在保存你的选择…");
    expect(reactionFeedbackCopy("zh", "dislike", "saved")).toBe("已记录不喜欢。");
    expect(reactionFeedbackCopy("zh", null, "saved")).toBe("已取消选择。");
    expect(reactionFeedbackCopy("zh", "dislike", "failed")).toBe("这次没有保存成功，请再试一次。");
  });

  it("英文反馈完整", () => {
    expect(reactionFeedbackCopy("en", "dislike", "saved")).toBe("Dislike saved.");
    expect(reactionFeedbackCopy("en", null, "saved")).toBe("Choice cleared.");
  });
});
