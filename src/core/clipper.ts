import createClipper from "clipper2-wasm/dist/es/clipper2z.js";
import type { MainModule, Paths64 } from "clipper2-wasm/dist/clipper2z";
import type { Paths, Ring, Point } from "./types";
export const GRID = 100000;
export const area = (p: Ring) =>
  p.reduce((v, a, i) => {
    const b = p[(i + 1) % p.length];
    return v + a[0] * b[1] - a[1] * b[0];
  }, 0) / 2;
export const totalArea = (p: Paths) => p.reduce((a, r) => a + area(r), 0);
export function clean(p: Ring): Ring {
  let q = p
    .map(
      ([x, y]) =>
        [Math.round(x * GRID) / GRID, Math.round(y * GRID) / GRID] as Point,
    )
    .filter((v, i, a) => !i || v[0] !== a[i - 1][0] || v[1] !== a[i - 1][1]);
  if (q.length > 1 && q[0][0] === q.at(-1)![0] && q[0][1] === q.at(-1)![1])
    q.pop();
  let changed = true;
  while (changed && q.length >= 3) {
    changed = false;
    const out: Ring = [];
    for (let i = 0; i < q.length; i++) {
      const a = q[(i + q.length - 1) % q.length],
        b = q[i],
        c = q[(i + 1) % q.length];
      if (
        Math.abs(
          (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]),
        ) < 1e-10
      ) {
        changed = true;
      } else out.push(b);
    }
    q = out;
  }
  return q.length >= 3 && Math.abs(area(q)) > 1e-6 ? q : [];
}
export const inside = (p: Point, ring: Ring) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
};
// Integer intersections can land a fraction of one grid unit across an edge.
// Split these sub-grid contacts into simple contours before triangulation.
// This changes the outline by at most 0.00002 mm, far below the curve tolerance.
export function splitTouches(r: Ring): Paths {
  const tolerance = 2 / GRID;
  for (let i = 0; i < r.length; i++)
    for (let j = i + 2; j < r.length; j++) {
      if ((j + 1) % r.length === i) continue;
      const p = r[i],
        a = r[j],
        b = r[(j + 1) % r.length],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        length2 = dx * dx + dy * dy;
      const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2;
      if (
        t < 0 ||
        t > 1 ||
        Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) > tolerance
      )
        continue;
      const first = clean(r.slice(i, j + 1)),
        second = clean([...r.slice(j + 1), ...r.slice(0, i + 1)]);
      if (!first.length || !second.length) continue;
      return [...splitTouches(first), ...splitTouches(second)];
    }
  return [r];
}
export function groups(paths: Paths): { outer: Ring; holes: Ring[] }[] {
  const out = paths
    .filter((p) => area(p) > 0)
    .map((outer) => ({ outer, holes: [] as Ring[] }));
  for (const hole of paths.filter((p) => area(p) < 0)) {
    const parents = out
      .filter(
        (g) =>
          area(g.outer) > -area(hole) &&
          hole.some((p, i) =>
            inside(
              [
                (p[0] + hole[(i + 1) % hole.length][0]) / 2,
                (p[1] + hole[(i + 1) % hole.length][1]) / 2,
              ],
              g.outer,
            ),
          ),
      )
      .sort((a, b) => area(a.outer) - area(b.outer));
    if (!parents.length)
      throw new Error(
        `Polygon has an orphan hole: area ${area(hole)}, first ${hole[0]}, vertices ${hole.length}`,
      );
    parents[0].holes.push(hole);
  }
  return out;
}
export class Kernel {
  constructor(readonly c: MainModule) {}
  static async create(wasmBinary?: Uint8Array, wasmUrl?: string) {
    return new Kernel(
      await createClipper({
        ...(wasmBinary && { wasmBinary }),
        ...(wasmUrl && { locateFile: () => wasmUrl }),
      }),
    );
  }
  private to(paths: Paths) {
    const out = new this.c.Paths64();
    for (const ring of paths) {
      if (ring.length < 2) continue;
      const p = this.c.MakePath64(
        ring.flatMap(([x, y]) => [
          BigInt(Math.round(x * GRID)),
          BigInt(Math.round(y * GRID)),
        ]),
      );
      out.push_back(p);
      p.delete();
    }
    return out;
  }
  private from(paths: Paths64) {
    const out: Paths = [];
    for (let i = 0; i < paths.size(); i++) {
      const p = paths.get(i),
        v = p.view(),
        r: Ring = [];
      for (let j = 0; j < v.length; j += 3)
        r.push([Number(v[j]) / GRID, Number(v[j + 1]) / GRID]);
      p.delete();
      const trimmed = clean(r);
      if (trimmed.length) out.push(...splitTouches(trimmed));
    }
    return out;
  }
  op(
    a: Paths,
    b: Paths,
    type: "union" | "difference" | "intersection" | "xor",
  ): Paths {
    const aa = this.to(a),
      bb = this.to(b);
    let result: Paths64 | undefined;
    try {
      const f = this.c.FillRule.NonZero;
      result =
        type === "union"
          ? this.c.Union64(aa, bb, f)
          : type === "difference"
            ? this.c.Difference64(aa, bb, f)
            : type === "xor"
              ? this.c.Xor64(aa, bb, f)
              : this.c.Intersect64(aa, bb, f);
      return this.from(result);
    } finally {
      result?.delete();
      aa.delete();
      bb.delete();
    }
  }
  union(a: Paths) {
    return this.op(a, [], "union");
  }
  simplify(a: Paths, tolerance = 0.012) {
    const aa = this.to(a);
    let r: Paths64 | undefined;
    try {
      r = this.c.SimplifyPaths64(aa, tolerance * GRID, true);
      return this.from(r);
    } finally {
      r?.delete();
      aa.delete();
    }
  }
  stroke(a: Paths, width: number) {
    const aa = this.to(a);
    let r: Paths64 | undefined;
    try {
      r = this.c.InflatePaths64(
        aa,
        (width / 2) * GRID,
        this.c.JoinType.Round,
        this.c.EndType.Round,
        2,
        0.015 * GRID,
      );
      return this.from(r);
    } finally {
      r?.delete();
      aa.delete();
    }
  }
  offset(a: Paths, delta: number) {
    const aa = this.to(a);
    let r: Paths64 | undefined;
    try {
      r = this.c.InflatePaths64(
        aa,
        delta * GRID,
        this.c.JoinType.Round,
        this.c.EndType.Polygon,
        2,
        0.02 * GRID,
      );
      return this.from(r);
    } finally {
      r?.delete();
      aa.delete();
    }
  }
}
