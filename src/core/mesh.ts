import earcut from "earcut";
import { groups, totalArea, area, GRID } from "./clipper";
import { CARD, type Mesh, type Paths, type Ring } from "./types";
import { outline } from "./artwork";
class Builder {
  vertices: number[][] = [];
  triangles: number[][] = [];
  private lookup = new Map<string, number>();
  point(x: number, y: number, z: number) {
    // Screen coordinates become printer XY; the finished front is viewed from below.
    const p = [x - 52.5, y - 74, z];
    const key = p.map((v) => Math.round(v * GRID)).join(",");
    let id = this.lookup.get(key);
    if (id === undefined) {
      id = this.vertices.length;
      this.lookup.set(key, id);
      this.vertices.push(p);
    }
    return id;
  }
  cap(paths: Paths, z: number, up: boolean) {
    let triArea = 0;
    for (const g of groups(paths)) {
      const rings = [g.outer, ...g.holes],
        flat: number[] = [],
        holes: number[] = [];
      for (let i = 0; i < rings.length; i++) {
        if (i) holes.push(flat.length / 2);
        for (const p of rings[i]) flat.push(...p);
      }
      const tris = earcut(flat, holes);
      const ids = Array.from({ length: flat.length / 2 }, (_, i) =>
        this.point(flat[2 * i], flat[2 * i + 1], z),
      );
      for (let i = 0; i < tris.length; i += 3) {
        let [a, b, c] = tris.slice(i, i + 3);
        const cross =
          (flat[b * 2] - flat[a * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1]) -
          (flat[b * 2 + 1] - flat[a * 2 + 1]) * (flat[c * 2] - flat[a * 2]);
        triArea += Math.abs(cross) / 2;
        if (cross > 0 !== up) [b, c] = [c, b];
        this.triangles.push([ids[a], ids[b], ids[c]]);
      }
    }
    if (
      Math.abs(triArea - totalArea(paths)) >
      Math.max(0.00002, Math.abs(totalArea(paths)) * 1e-8)
    )
      throw new Error(
        `Triangulation area does not match the source polygons: ${triArea} vs ${totalArea(paths)}, ${paths.length} contours, z=${z}`,
      );
  }
  sides(paths: Paths, low: number, high: number) {
    for (const ring of paths)
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        const ai = this.point(...a, low),
          bi = this.point(...b, low),
          at = this.point(...a, high),
          bt = this.point(...b, high);
        this.triangles.push([ai, bi, bt], [ai, bt, at]);
      }
  }
  conform() {
    // Earcut can bridge several collinear hole edges without retaining their
    // intermediate vertices. Split those T-junctions; never move or smooth them.
    const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
    const edges = new Map<string, { a: number; b: number; count: number }>();
    for (const f of this.triangles)
      for (let j = 0; j < 3; j++) {
        const a = f[j],
          b = f[(j + 1) % 3],
          id = key(a, b),
          edge = edges.get(id) || { a, b, count: 0 };
        edge.count++;
        edges.set(id, edge);
      }
    const open = [...edges.values()].filter((e) => e.count !== 2),
      candidates = [...new Set(open.flatMap((e) => [e.a, e.b]))],
      splits = new Map<string, number[]>();
    for (const { a, b } of open) {
      const p = this.vertices[a],
        q = this.vertices[b],
        d = q.map((v, i) => v - p[i]),
        length2 = d.reduce((n, v) => n + v * v, 0);
      const hits = candidates
        .filter((i) => i !== a && i !== b)
        .map((id) => {
          const v = this.vertices[id],
            t = v.reduce((n, x, i) => n + (x - p[i]) * d[i], 0) / length2;
          return {
            id,
            t,
            distance: Math.hypot(...v.map((x, i) => x - p[i] - t * d[i])),
          };
        })
        .filter((h) => h.t > 1e-9 && h.t < 1 - 1e-9 && h.distance < 1e-8)
        .sort((x, y) => x.t - y.t);
      if (hits.length)
        splits.set(
          key(a, b),
          a < b ? hits.map((h) => h.id) : hits.map((h) => h.id).reverse(),
        );
    }
    const split = (f: number[]): number[][] => {
      for (let j = 0; j < 3; j++) {
        const a = f[j],
          b = f[(j + 1) % 3],
          c = f[(j + 2) % 3],
          hits = splits.get(key(a, b));
        if (hits) {
          const chain = [a, ...(a < b ? hits : [...hits].reverse()), b];
          return chain.slice(1).flatMap((v, i) => split([chain[i], v, c]));
        }
      }
      return [f];
    };
    this.triangles = this.triangles.flatMap(split);
  }
}
export function extrude(
  paths: Paths,
  name: string,
  colour: string,
  slot: number,
  height: number,
): Mesh {
  const b = new Builder();
  b.cap(paths, 0, false);
  b.cap(paths, height, true);
  b.sides(paths, 0, height);
  b.conform();
  return { name, colour, slot, vertices: b.vertices, triangles: b.triangles };
}
export function backing(
  background: Paths,
  foreground: Paths,
  height: number,
  colour: string,
): Mesh {
  const b = new Builder();
  b.cap(background, 0, false);
  b.sides(background, 0, CARD.inlay);
  b.cap(foreground, CARD.inlay, false);
  b.cap([outline()], height, true);
  b.sides([outline()], CARD.inlay, height);
  b.conform();
  return {
    name: "Background and continuous backing",
    colour,
    slot: 0,
    vertices: b.vertices,
    triangles: b.triangles,
  };
}
export function inspectMesh(m: Mesh) {
  const edges = new Map<string, { count: number; balance: number }>();
  let volume = 0,
    degenerate = 0;
  for (const face of m.triangles) {
    if (
      face.some((v) => !Number.isInteger(v) || v < 0 || v >= m.vertices.length)
    )
      throw new Error("Invalid triangle index");
    const [a, b, c] = face.map((i) => m.vertices[i]);
    if ([...a, ...b, ...c].some((x) => !Number.isFinite(x)))
      throw new Error("Non-finite geometry");
    const ab = b.map((v, i) => v - a[i]),
      ac = c.map((v, i) => v - a[i]);
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    if (Math.hypot(...cross) < 1e-10) degenerate++;
    volume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
    for (let j = 0; j < 3; j++) {
      const u = face[j],
        v = face[(j + 1) % 3],
        key = u < v ? `${u}:${v}` : `${v}:${u}`;
      const e = edges.get(key) || { count: 0, balance: 0 };
      e.count++;
      e.balance += u < v ? 1 : -1;
      edges.set(key, e);
    }
  }
  return {
    volume,
    degenerate,
    invalidEdges: [...edges.values()].filter(
      (e) => e.count !== 2 || e.balance !== 0,
    ).length,
  };
}
