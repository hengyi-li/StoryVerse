import { FunctionRegion } from "@supabase/supabase-js";

/**
 * Text and embedding responses are small, so running these Ark-backed
 * functions in Tokyo avoids the unstable Singapore -> Beijing model route
 * without adding meaningful database transfer overhead.
 *
 * Image generation intentionally stays in the default project region. A
 * production A/B test found that Tokyo shortened the model call but made the
 * complete request slower because the generated image still had to be written
 * back to Supabase Storage in Singapore.
 */
const TOKYO_TEXT_FUNCTIONS = new Set(["story-analyze", "story-confirm", "story-translate"]);

export function functionRegionFor(name: string, supabaseUrl?: string) {
  const hostedProject = /^https:\/\/[^/]+\.supabase\.co\/?$/i.test(supabaseUrl?.trim() ?? "");
  return hostedProject && TOKYO_TEXT_FUNCTIONS.has(name) ? FunctionRegion.ApNortheast1 : undefined;
}
