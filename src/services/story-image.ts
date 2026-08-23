import type { StoryAnalysis, StoryDraft } from "../types/domain";
import { dataService } from "./data-service";

export type ImageStyle = "clay-3d" | "indie-zine" | "retro-collage";

export type StoryHighlight = {
  title: string;
  moment: string;
  scene: string;
  action: string;
  emotion: string;
};

const STORY_IMAGE_THUMBNAIL_SIZE = 768;
const STORY_IMAGE_THUMBNAIL_QUALITY = 75;
const preloadedStoryImages = new Set<string>();
const preloadingStoryImages = new Map<string, HTMLImageElement>();

/**
 * StarLobby only renders a roughly 430px square. Hosted Supabase projects can
 * serve a much smaller cached derivative while the original remains available
 * for the StoryPage download/open action.
 */
export function storyImageThumbnailUrl(imageUrl: string) {
  if (!imageUrl) return imageUrl;
  try {
    const url = new URL(imageUrl);
    const objectPrefix = "/storage/v1/object/public/";
    if (!url.pathname.startsWith(objectPrefix) || ["127.0.0.1", "localhost"].includes(url.hostname)) {
      return imageUrl;
    }
    url.pathname = url.pathname.replace(objectPrefix, "/storage/v1/render/image/public/");
    url.searchParams.set("width", String(STORY_IMAGE_THUMBNAIL_SIZE));
    url.searchParams.set("height", String(STORY_IMAGE_THUMBNAIL_SIZE));
    url.searchParams.set("resize", "cover");
    url.searchParams.set("quality", String(STORY_IMAGE_THUMBNAIL_QUALITY));
    return url.toString();
  } catch {
    return imageUrl;
  }
}

export function preloadStoryImage(imageUrl?: string, priority: "high" | "low" = "low") {
  if (
    !imageUrl ||
    typeof Image === "undefined" ||
    preloadedStoryImages.has(imageUrl) ||
    preloadingStoryImages.has(imageUrl)
  )
    return;
  const image = new Image();
  preloadingStoryImages.set(imageUrl, image);
  image.decoding = "async";
  image.fetchPriority = priority;
  image.onload = () => {
    preloadingStoryImages.delete(imageUrl);
    preloadedStoryImages.add(imageUrl);
  };
  image.onerror = () => preloadingStoryImages.delete(imageUrl);
  image.src = imageUrl;
}

export async function createStoryImagePreview(
  _draft: StoryDraft,
  analysis: StoryAnalysis,
  imageStyle: ImageStyle,
  _editedTags?: string[],
) {
  if (!analysis.id) throw new Error("请先完成故事分析，再生成图片。");
  return dataService.createStoryImage(analysis.id, imageStyle);
}

function storyImageFileName(title: string, mimeType: string) {
  const baseName =
    title
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 80) || "storyverse-story";
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
  return `${baseName}.${extension}`;
}

export async function downloadStoryImage(imageUrl: string, title: string) {
  const response = await fetch(imageUrl, { credentials: "omit" });
  if (!response.ok) throw new Error(`Story image download failed (${response.status})`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = objectUrl;
    link.download = storyImageFileName(title, blob.type);
    link.rel = "noopener";
    link.click();
    return link.download;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
