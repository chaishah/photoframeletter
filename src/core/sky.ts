import * as A from "astronomy-engine";
import { CARD, type Settings, type Star, type Sky, type Point } from "./types";
import { validateSettings } from "./time";
const RAD = Math.PI / 180;
export function starDirection(s: Star, date: Date): A.Vector {
  const ra = s.ra * 15 * RAD,
    dec = s.dec * RAD,
    years = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000 / 365.25;
  const e = [-Math.sin(ra), Math.cos(ra), 0],
    n = [
      -Math.cos(ra) * Math.sin(dec),
      -Math.sin(ra) * Math.sin(dec),
      Math.cos(dec),
    ];
  const u = [
    Math.cos(ra) * Math.cos(dec),
    Math.sin(ra) * Math.cos(dec),
    Math.sin(dec),
  ];
  const k = (years * RAD) / 3600000;
  const v = u.map((x, i) => x + k * (s.pmra * e[i] + s.pmdec * n[i]));
  const len = Math.hypot(...v);
  return new A.Vector(
    v[0] / len,
    v[1] / len,
    v[2] / len,
    new A.AstroTime(date),
  );
}
export function project(alt: number, az: number): Point {
  const r = (CARD.mapRadius * (90 - alt)) / 90;
  return [CARD.cx - r * Math.sin(az * RAD), CARD.cy - r * Math.cos(az * RAD)];
}
export function calculateSky(
  settings: Settings,
  catalogue: Star[],
  edges: number[][],
): Sky {
  const time = validateSettings(settings),
    date = new Date(time.utc),
    observer = new A.Observer(settings.latitude, settings.longitude, 0);
  const rotation = A.Rotation_EQJ_HOR(date, observer);
  const all = catalogue.map((s) => {
    const vector = A.RotateVector(rotation, starDirection(s, date));
    const altitude = Math.atan2(vector.z, Math.hypot(vector.x, vector.y)) / RAD;
    const azimuth =
      (((Math.atan2(-vector.y, vector.x) / RAD) % 360) + 360) % 360;
    const [x, y] = project(altitude, azimuth);
    return {
      ...s,
      altitude,
      azimuth,
      x,
      y,
      radius: Math.min(1.05, Math.max(0.4, 0.4 + (4.5 - s.mag) * 0.105)),
      vector,
    };
  });
  const lookup = new Map(all.map((s) => [s.id, s]));
  const anchors = new Set(settings.constellations ? edges.flat() : []);
  const stars = all
    .filter(
      (s) =>
        s.altitude >= 0 && (s.mag <= settings.magnitude || anchors.has(s.id)),
    )
    .map(({ vector, ...s }) => s);
  const segments: Point[][] = [];
  if (settings.constellations)
    for (const [aid, bid] of edges) {
      const a = lookup.get(aid),
        b = lookup.get(bid);
      if (!a || !b) throw new Error("Constellation catalogue mismatch");
      // Sample the great-circle arc in 3D; clip each sampled segment at z=0.
      let run: Point[] = [];
      for (let i = 0; i <= 32; i++) {
        const t = i / 32,
          v = [
            a.vector.x * (1 - t) + b.vector.x * t,
            a.vector.y * (1 - t) + b.vector.y * t,
            a.vector.z * (1 - t) + b.vector.z * t,
          ];
        const len = Math.hypot(...v),
          alt = Math.asin(v[2] / len) / RAD,
          az = Math.atan2(-v[1], v[0]) / RAD;
        if (alt >= 0) run.push(project(alt, az));
        if (i > 0) {
          const pt = (i - 1) / 32,
            pz = a.vector.z * (1 - pt) + b.vector.z * pt;
          if ((pz < 0 && v[2] >= 0) || (pz >= 0 && v[2] < 0)) {
            const cut = -a.vector.z / (b.vector.z - a.vector.z);
            const x = a.vector.x * (1 - cut) + b.vector.x * cut,
              y = a.vector.y * (1 - cut) + b.vector.y * cut;
            const hit = project(0, Math.atan2(-y, x) / RAD);
            if (v[2] >= 0) run.unshift(hit);
            else {
              run.push(hit);
              if (run.length > 1) segments.push(run);
              run = [];
            }
          }
        }
      }
      if (run.length > 1) segments.push(run);
    }
  const sun = A.Equator(A.Body.Sun, date, observer, true, true);
  const sunAltitude = A.Horizon(date, observer, sun.ra, sun.dec).altitude;
  return {
    stars,
    segments,
    aboveHorizon: all.filter((s) => s.altitude >= 0).length,
    sunAltitude,
    time,
  };
}
