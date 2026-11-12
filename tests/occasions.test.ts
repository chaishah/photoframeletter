import { describe, expect, it } from "vitest";
import { OCCASIONS, applyOccasion } from "../src/core/occasions";
import { DEFAULT_SETTINGS } from "../src/core/types";

describe("occasion templates", () => {
  it("provides at least twelve distinct occasions", () => {
    expect(OCCASIONS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(OCCASIONS.map((item) => item.id)).size).toBe(OCCASIONS.length);
  });
  it("preserves personal moment and print settings without sharing mutable palettes", () => {
    const input = { ...DEFAULT_SETTINGS, location: "NEW YORK CITY", date: "2026-03-06", thickness: 8, magnitude: 3.5, caption: false };
    const template = OCCASIONS[0];
    const result = applyOccasion(input, template);
    expect(result).toEqual({ ...input, title: template.title, palette: template.palette });
    expect(result.palette).not.toBe(template.palette);
    result.palette[0] = "#000000";
    expect(template.palette[0]).not.toBe("#000000");
    expect(input.title).toBe(DEFAULT_SETTINGS.title);
  });
});
