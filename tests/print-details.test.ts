import { describe, expect, it } from "vitest";
import { printDetails } from "../src/core/print-details";
import { DEFAULT_SETTINGS } from "../src/core/types";
import { validateSettings } from "../src/core/time";
import { calculateSky } from "../src/core/sky";
import { readFileSync } from "node:fs";

describe("print detail controls", () => {
  it("preserves legacy dimensions and uses stronger defaults for new cards", () => {
    const legacy = { ...DEFAULT_SETTINGS, inlayDepth: undefined, lineWidth: undefined, starScale: undefined };
    expect(printDetails(legacy)).toEqual({ inlayDepth: 0.6, lineWidth: 0.65, starScale: 1 });
    expect(printDetails(DEFAULT_SETTINGS)).toEqual({ inlayDepth: 1, lineWidth: 0.9, starScale: 1.25 });
    expect(() => validateSettings(legacy)).not.toThrow();
  });
  it("rejects non-finite, out-of-range and off-step values", () => {
    for (const patch of [
      { inlayDepth: 4 }, { inlayDepth: 0.7 }, { inlayDepth: NaN },
      { lineWidth: 0.5 }, { lineWidth: 0.91 }, { lineWidth: Infinity },
      { starScale: 0.5 }, { starScale: 1.27 }, { starScale: NaN },
    ]) expect(() => validateSettings({ ...DEFAULT_SETTINGS, ...patch })).toThrow();
  });
  it("enlarges stars without changing their count or astronomical positions", () => {
    const catalogue = JSON.parse(readFileSync("public/data/stars.json", "utf8"));
    const edges = JSON.parse(readFileSync("public/data/constellations.json", "utf8"));
    const original = calculateSky({ ...DEFAULT_SETTINGS, starScale: 1 }, catalogue, edges);
    const enlarged = calculateSky(DEFAULT_SETTINGS, catalogue, edges);
    expect(enlarged.stars.length).toBe(original.stars.length);
    enlarged.stars.forEach((star, i) => {
      expect(star.radius).toBeCloseTo(original.stars[i].radius * 1.25, 8);
      expect([star.id, star.x, star.y]).toEqual([original.stars[i].id, original.stars[i].x, original.stars[i].y]);
    });
  });
});
