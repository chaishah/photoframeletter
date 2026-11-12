export type Point = [number, number];
export type Ring = Point[];
export type Paths = Ring[];
export interface Star {
  id: number;
  hip: number | null;
  ra: number;
  dec: number;
  mag: number;
  pmra: number;
  pmdec: number;
  name: string;
}
export interface Settings {
  version: 1;
  location: string;
  latitude: number;
  longitude: number;
  timezone: string;
  date: string;
  time: string;
  ambiguity: "" | "earlier" | "later";
  thickness: number;
  magnitude: number;
  constellations: boolean;
  title: string;
  caption: boolean;
  displayStand?: boolean;
  palette: [string, string, string, string];
}
export interface ResolvedTime {
  utc: string;
  offsetMinutes: number;
  abbreviation: string;
  tzdb: string;
}
export interface SkyStar extends Star {
  altitude: number;
  azimuth: number;
  x: number;
  y: number;
  radius: number;
}
export interface Sky {
  stars: SkyStar[];
  segments: Point[][];
  aboveHorizon: number;
  sunAltitude: number;
  time: ResolvedTime;
}
export interface Mesh {
  name: string;
  colour: string;
  slot: number;
  vertices: number[][];
  triangles: number[][];
}
export interface Issue {
  code: string;
  message: string;
  field?: string;
  point?: Point;
}
export interface Report {
  version: 1;
  errors: Issue[];
  warnings: Issue[];
  triangles: number;
  vertices: number;
  colours: number;
  stars: number;
  modelValidated: boolean;
  nativeSlice: "not-run";
  physicalPrint: "not-run";
  dimensions: [number, number, number];
  volume: number;
  inputHash: string;
  modelHash: string;
  versions: Record<string, string>;
  generatedUtc: string;
  bytes3mf?: number;
  displayStand?: { width: number; depth: number; height: number; slotWidth: number; cardGap: number };
}
export interface Model {
  settings: Settings;
  sky: Sky;
  regions: Paths[];
  meshes: Mesh[];
  report: Report;
}
export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  location: "PERTH, WA",
  latitude: -31.9523,
  longitude: 115.8613,
  timezone: "Australia/Perth",
  date: "2026-11-11",
  time: "20:00",
  ambiguity: "",
  thickness: 4,
  magnitude: 4.5,
  constellations: true,
  title: "OUR NIGHT SKY",
  caption: true,
  palette: ["#101E30", "#FFFFFF", "#9AC9E0", "#F4E5C3"],
};
export const CARD = {
  width: 105,
  height: 148,
  radius: 3,
  inlay: 0.6,
  cx: 52.5,
  cy: 66,
  mapRadius: 42,
};
