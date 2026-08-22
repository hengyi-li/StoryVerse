/**
 * User-facing AI requests must not hold the page indefinitely when the
 * upstream model has a long-tail latency spike. Story analysis already has a
 * fail-open path, so a short timeout is preferable to making the participant
 * wait for the former 90-second ceiling.
 */
export const STORY_ANALYSIS_TIMEOUT_MS = 30_000;
export const STORY_ANALYSIS_MAX_TOKENS = 1_200;

/**
 * Recent observed production successes stayed below 90 seconds. The former
 * 120-second ceiling mainly prolonged failed requests and approached the
 * hosted Edge Function request-idle limit.
 */
export const STORY_IMAGE_TIMEOUT_MS = 90_000;
