import { printDetails } from "./print-details";
import type { Font, PathCommand } from "opentype.js";
import {
  CARD,
  type Ring,
  type Paths,
  type Point,
  type Sky,
  type Settings,
} from "./types";
import { Kernel, area, clean, groups } from "./clipper";
import { InputError } from "./time";
export function circle(x: number, y: number, r: number): Ring {
  const steps = Math.max(
    8,
    Math.ceil(Math.PI / Math.acos(1 - Math.min(0.03, r / 4) / r)),
  );
  return clean(
    Array.from({ length: steps }, (_, i) => [
      x + r * Math.cos((i * 2 * Math.PI) / steps),
      y + r * Math.sin((i * 2 * Math.PI) / steps),
    ]),
  );
}
export function outline(): Ring {
  const p: Ring = [];
  for (const [cx, cy, start] of [
    [102, 3, -90],
    [102, 145, 0],
    [3, 145, 90],
    [3, 3, 180],
  ])
    for (let i = 0; i <= 10; i++) {
      const a = ((start + i * 9) * Math.PI) / 180;
      p.push([cx + 3 * Math.cos(a), cy + 3 * Math.sin(a)]);
    }
  return clean(p);
}
function segment(a: Point, b: Point, width: number): Ring {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = Math.hypot(dx, dy);
  if (len < 1e-8) return [];
  const x = ((-dy / len) * width) / 2,
    y = ((dx / len) * width) / 2;
  return clean([
    [a[0] + x, a[1] + y],
    [a[0] - x, a[1] - y],
    [b[0] - x, b[1] - y],
    [b[0] + x, b[1] + y],
  ]);
}
function bezier(points: Point[], out: Ring, depth = 0) {
  const a = points[0],
    b = points.at(-1)!,
    len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dist = Math.max(
    ...points
      .slice(1, -1)
      .map((p) =>
        len
          ? Math.abs(
              (b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1]),
            ) / len
          : Math.hypot(p[0] - a[0], p[1] - a[1]),
      ),
  );
  if (dist <= 0.02 || depth >= 12) {
    out.push(b);
    return;
  }
  const levels = [points];
  while (levels.at(-1)!.length > 1) {
    const q = levels.at(-1)!;
    levels.push(
      q.slice(1).map((p, i) => [(p[0] + q[i][0]) / 2, (p[1] + q[i][1]) / 2]),
    );
  }
  bezier(
    levels.map((l) => l[0]),
    out,
    depth + 1,
  );
  bezier(levels.map((l) => l.at(-1)!).reverse(), out, depth + 1);
}
function flatten(commands: PathCommand[]): Paths {
  const paths: Paths = [];
  let ring: Ring = [],
    at: Point = [0, 0];
  for (const c of commands) {
    if (c.type === "M") {
      if (ring.length) paths.push(clean(ring));
      at = [c.x, c.y];
      ring = [at];
    } else if (c.type === "L") {
      at = [c.x, c.y];
      ring.push(at);
    } else if (c.type === "Q") {
      bezier([at, [c.x1, c.y1], [c.x, c.y]], ring);
      at = [c.x, c.y];
    } else if (c.type === "C") {
      bezier([at, [c.x1, c.y1], [c.x2, c.y2], [c.x, c.y]], ring);
      at = [c.x, c.y];
    } else if (c.type === "Z") {
      if (ring.length) paths.push(clean(ring));
      ring = [];
    }
  }
  if (ring.length) paths.push(clean(ring));
  return paths.filter((p) => p.length);
}
export function textPaths(
  font: Font,
  k: Kernel,
  text: string,
  cx: number,
  baseline: number,
  size: number,
  maxWidth: number,
  field: string,
): Paths {
  if (!text) return [];
  if ([...text].some((c) => c !== " " && font.charToGlyphIndex(c) === 0))
    throw new InputError(
      field,
      "The print font does not contain every character. Use a Latin caption or supported accents.",
    );
  text = text.normalize("NFC");
  if (/\p{Mark}/u.test(text))
    throw new InputError(
      field,
      "Use precomposed accented letters in the printed caption.",
    );
  const glyphs = [...text].map((c) => font.charToGlyph(c));
  const advance = (i: number) =>
    (((glyphs[i].advanceWidth || 0) +
      (i + 1 < glyphs.length
        ? font.getKerningValue(glyphs[i], glyphs[i + 1])
        : 0)) *
      size) /
    font.unitsPerEm;
  const width = glyphs.reduce((n, _, i) => n + advance(i), 0);
  if (width > maxWidth)
    throw new InputError(
      field,
      `This caption is too wide (${width.toFixed(1)} mm). Shorten it to fit ${maxWidth} mm.`,
    );
  // Font outlines use clockwise outer contours in screen coordinates; reverse all contours if needed.
  let x = cx - width / 2;
  let p: Paths = [];
  for (let i = 0; i < glyphs.length; i++) {
    p.push(...flatten(glyphs[i].getPath(x, baseline, size).commands));
    x += advance(i);
  }
  const largest = p.reduce(
    (a, b) => (Math.abs(area(a)) > Math.abs(area(b)) ? a : b),
    [] as Ring,
  );
  if (area(largest) < 0) p = p.map((r) => [...r].reverse());
  return k.offset(k.union(p), 0.055);
}
export function artwork(s: Settings, sky: Sky, font: Font, k: Kernel): Paths[] {
  const starPaths = sky.stars.map((st) => circle(st.x, st.y, st.radius));
  const lines = k.simplify(k.union(k.stroke(sky.segments, printDetails(s).lineWidth)));
  const ring = k.op(
    [circle(CARD.cx, CARD.cy, CARD.mapRadius + 0.75)],
    [circle(CARD.cx, CARD.cy, CARD.mapRadius + 0.1)],
    "difference",
  );
  const labels = [
    ...ring,
    ...textPaths(font, k, s.title.toUpperCase(), 52.5, 13.5, 6, 93, "title"),
  ];
  for (const [letter, x, y] of [
    ["N", 52.5, 21.6],
    ["S", 52.5, 116],
    ["E", 5.2, 67.6],
    ["W", 99.8, 67.6],
  ] as [string, number, number][])
    labels.push(...textPaths(font, k, letter, x, y, 4.8, 7, "compass"));
  if (s.caption) {
    const dt = new Date(`${s.date}T12:00:00Z`);
    const day = `${dt.getUTCDate()} ${dt.toLocaleString("en-GB", { month: "long", timeZone: "UTC" }).toUpperCase()} ${dt.getUTCFullYear()}`;
    labels.push(
      ...textPaths(
        font,
        k,
        s.location.toUpperCase(),
        52.5,
        124,
        5,
        93,
        "location",
      ),
      ...textPaths(font, k, day, 52.5, 132.2, 4.8, 93, "date"),
      ...textPaths(
        font,
        k,
        `${s.time} ${sky.time.abbreviation}`,
        52.5,
        140.4,
        4.8,
        93,
        "time",
      ),
    );
  }
  // Compensate the inscribed polygon's chord error so even a star centred
  // exactly on the horizon retains its position in the printable region.
  const disk = [circle(CARD.cx, CARD.cy, CARD.mapRadius + 0.03)];
  let stars = k.op(k.union(starPaths), disk, "intersection");
  const originalLines = k.op(lines, disk, "intersection");
  let constellation = k.union(k.op(originalLines, stars, "difference"));
  const caption = k.union(labels);
  // Build the backing from the unpartitioned artwork, avoiding re-union of coincident rounded cuts.
  const foreground = k.union([...stars, ...originalLines, ...caption]);
  const small: Paths = [],
    large: Paths = [];
  for (const g of groups(constellation)) {
    const shape = [g.outer, ...g.holes];
    (k.offset(shape, -0.2).length ? large : small).push(...shape);
  }
  if (small.length) constellation = large;
  const background = k.union([
    ...k.op([outline()], foreground, "difference"),
    ...small,
  ]);
  return [background, stars, constellation, caption];
}
