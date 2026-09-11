import { describe, expect, it } from "vitest";
import { sampleAreas } from "../data/sampleData";
import { PRESET_WEIGHTS, rankFeatures, scoreFeature } from "./scoring";

describe("scoring", () => {
  it("keeps scores in the 0-100 range", () => {
    const scored = scoreFeature(sampleAreas.features[0], {
      density: 100,
      access: 100,
      affluence: 100
    });

    expect(scored.properties.overallScore).toBeGreaterThanOrEqual(0);
    expect(scored.properties.overallScore).toBeLessThanOrEqual(100);
  });

  it("ranks the highest scoring area first", () => {
    const ranked = rankFeatures(sampleAreas, PRESET_WEIGHTS["density-gap"]);
    const scores = ranked.features.map((feature) => feature.properties.overallScore);

    expect(ranked.features[0].properties.rank).toBe(1);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
