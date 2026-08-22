import { FunctionRegion } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { functionRegionFor } from "../src/lib/function-region";

const productionUrl = "https://zgyrbtdyraxglxhbkazp.supabase.co";

describe("Edge Function region routing", () => {
  it.each(["story-analyze", "story-confirm", "story-translate"])(
    "routes the small Ark response for %s through Tokyo",
    (functionName) => {
      expect(functionRegionFor(functionName, productionUrl)).toBe(FunctionRegion.ApNortheast1);
    },
  );

  it("keeps image generation in the default Storage region", () => {
    expect(functionRegionFor("story-generate-image", productionUrl)).toBeUndefined();
  });

  it("does not force a hosted region during local Supabase development", () => {
    expect(functionRegionFor("story-analyze", "http://127.0.0.1:54321")).toBeUndefined();
  });
});
