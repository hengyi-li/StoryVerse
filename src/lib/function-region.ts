import { FunctionRegion } from "@supabase/supabase-js";

/**
 * Text and embedding responses are small, so route Ark-backed text functions
 * through Tokyo. Production verification on 2026-08-26 showed that automatic
 * and Singapore routing had severe long-tail failures, while the core story
 * analysis completed through Tokyo once its premature 30-second timeout was
 * corrected to 45 seconds.
 *
 * Image generation intentionally stays in the default Storage region.
 */
const TOKYO_TEXT_FUNCTIONS = new Set(["story-analyze", "story-confirm", "story-translate"]);

export function functionRegionFor(name: string, supabaseUrl?: string) {
  const hostedProject = /^https:\/\/[^/]+\.supabase\.co\/?$/i.test(supabaseUrl?.trim() ?? "");
  return hostedProject && TOKYO_TEXT_FUNCTIONS.has(name) ? FunctionRegion.ApNortheast1 : undefined;
}
