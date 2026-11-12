import moment from "moment-timezone";
import type { Settings, ResolvedTime } from "./types";
export class InputError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}
export function resolveTime(
  s: Pick<Settings, "date" | "time" | "timezone" | "ambiguity">,
): ResolvedTime {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !/^\d{2}:\d{2}$/.test(s.time))
    throw new InputError("time", "Enter a complete date and local time.");
  const [y, m, d] = s.date.split("-").map(Number),
    [hh, mm] = s.time.split(":").map(Number);
  if (y < 1900 || y > 2100)
    throw new InputError("date", "Supported dates are 1900–2100.");
  const wall = Date.UTC(y, m - 1, d, hh, mm),
    check = new Date(wall);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d ||
    hh > 23 ||
    mm > 59
  )
    throw new InputError("date", "This date or time does not exist.");
  const zone = moment.tz.zone(s.timezone);
  if (!zone) throw new InputError("timezone", "Select a valid IANA timezone.");
  const candidates = [...new Set(zone.offsets)]
    .map((offset) => Math.round(wall + offset * 60000))
    .filter((utc) => Math.abs(utc - zone.utcOffset(utc) * 60000 - wall) < 1)
    .sort((a, b) => a - b);
  if (!candidates.length)
    throw new InputError(
      "time",
      "This local time was skipped by a timezone clock change. Choose another time.",
    );
  if (candidates.length > 1 && !s.ambiguity)
    throw new InputError(
      "ambiguity",
      "This time happened twice. Choose the earlier or later occurrence.",
    );
  const utc = s.ambiguity === "later" ? candidates.at(-1)! : candidates[0];
  return {
    utc: new Date(utc).toISOString(),
    offsetMinutes: -zone.utcOffset(utc),
    abbreviation: zone.abbr(utc),
    tzdb: moment.tz.dataVersion,
  };
}
export const timezoneNames = () => moment.tz.names();
export function validateSettings(s: Settings): ResolvedTime {
  for (const [field, min, max, step] of [
    ["inlayDepth", 0.6, 1.2, 0.2],
    ["lineWidth", 0.65, 1, 0.05],
    ["starScale", 1, 1.3, 0.05],
  ] as const) {
    const value = s[field];
    if (value !== undefined && (!Number.isFinite(value) || value < min || value > max ||
      Math.abs((value - min) / step - Math.round((value - min) / step)) > 1e-7))
      throw new InputError(field, `${field === "inlayDepth" ? "Colour depth" : field === "lineWidth" ? "Line width" : "Star scale"} must be between ${min} and ${max} in steps of ${step}.`);
  }
  if (s.displayStand !== undefined && typeof s.displayStand !== "boolean")
    throw new InputError("displayStand", "Choose whether to include a display stand.");
  if (s.version !== 1)
    throw new InputError("version", "Unsupported design version.");
  if (!s.location?.trim())
    throw new InputError(
      "location",
      "Select a location or name your manual coordinates.",
    );
  if (!Number.isFinite(s.latitude) || Math.abs(s.latitude) > 90)
    throw new InputError("latitude", "Latitude must be between −90 and 90.");
  if (!Number.isFinite(s.longitude) || Math.abs(s.longitude) > 180)
    throw new InputError(
      "longitude",
      "Longitude must be between −180 and 180.",
    );
  if (
    !Number.isFinite(s.thickness) ||
    s.thickness < 4 ||
    s.thickness > 8 ||
    Math.abs(s.thickness * 5 - Math.round(s.thickness * 5)) > 1e-7
  )
    throw new InputError(
      "thickness",
      "Thickness must be 4–8 mm in 0.2 mm steps.",
    );
  if (!Number.isFinite(s.magnitude) || s.magnitude < 3 || s.magnitude > 5.5)
    throw new InputError(
      "magnitude",
      "Star density must be between magnitude 3 and 5.5.",
    );
  if (
    !Array.isArray(s.palette) ||
    s.palette.length !== 4 ||
    s.palette.some((c) => !/^#[0-9a-f]{6}$/i.test(c))
  )
    throw new InputError("palette", "Choose four valid colour assignments.");
  if (s.title.length > 40 || s.location.length > 80)
    throw new InputError("title", "Shorten the title or location caption.");
  return resolveTime(s);
}
