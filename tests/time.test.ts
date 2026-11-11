import { describe, it, expect } from "vitest";
import { resolveTime, validateSettings } from "../src/core/time";
import { DEFAULT_SETTINGS as s } from "../src/core/types";
describe("civil time validation", () => {
  it("resolves Perth independently of machine timezone", () =>
    expect(resolveTime(s).utc).toBe("2026-11-11T12:00:00.000Z"));
  it("rejects impossible dates and hours", () => {
    for (const patch of [
      { date: "2025-02-29" },
      { date: "2024-04-31" },
      { time: "24:00" },
      { time: "12:60" },
      { time: "" },
      { date: "1899-12-31" },
    ])
      expect(() => resolveTime({ ...s, ...patch })).toThrow();
  });
  it("accepts leap day and fractional timezones", () => {
    expect(
      resolveTime({
        ...s,
        date: "2024-02-29",
        time: "00:00",
        timezone: "Asia/Kathmandu",
      }).utc,
    ).toBe("2024-02-28T18:15:00.000Z");
    expect(
      resolveTime({ ...s, timezone: "Australia/Adelaide" }).offsetMinutes,
    ).toBe(630);
  });
  it("rejects a skipped DST time", () =>
    expect(() =>
      resolveTime({
        ...s,
        date: "2026-03-08",
        time: "02:30",
        timezone: "America/New_York",
      }),
    ).toThrow("skipped"));
  it("requires a choice for repeated DST time", () => {
    const v = {
      ...s,
      date: "2026-11-01",
      time: "01:30",
      timezone: "America/New_York",
    };
    expect(() => resolveTime(v)).toThrow("twice");
    const a = resolveTime({ ...v, ambiguity: "earlier" }),
      b = resolveTime({ ...v, ambiguity: "later" });
    expect(Date.parse(b.utc) - Date.parse(a.utc)).toBe(3600000);
  });
  it("handles historical Perth daylight saving", () =>
    expect(resolveTime({ ...s, date: "2008-01-10" }).offsetMinutes).toBe(540));
  it("rejects non-finite coordinates and unsafe dimensions", () => {
    for (const patch of [
      { latitude: NaN },
      { longitude: 181 },
      { thickness: 4.1 },
      { thickness: 3.8 },
      { magnitude: 6 },
      { timezone: "Invalid/Zone" },
    ])
      expect(() => validateSettings({ ...s, ...patch })).toThrow();
  });
});
