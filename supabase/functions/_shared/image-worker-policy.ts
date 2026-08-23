export const STORY_IMAGE_ATTEMPT_TIMEOUT_MS = 55_000;
export const STORY_IMAGE_MAX_AUTOMATIC_RETRIES = 1;
export const STORY_IMAGE_RETRY_DELAY_SECONDS = 3;

export function isTransientImageGenerationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /aborted|aborterror|timed?\s*out|fetch failed|network|connection|ark (408|425|429|5\d\d)|generated image \((408|425|429|5\d\d)\)/i.test(
    message,
  );
}

export function shouldRetryImageGeneration(error: unknown, retryCount: number) {
  return retryCount < STORY_IMAGE_MAX_AUTOMATIC_RETRIES && isTransientImageGenerationError(error);
}
