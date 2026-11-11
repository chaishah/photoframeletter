import { readFileSync } from "node:fs";
import { beforeAll, describe, it, expect } from "vitest";
import { Kernel, area, totalArea } from "../src/core/clipper";
import { extrude, inspectMesh, backing } from "../src/core/mesh";
import { outline, circle } from "../src/core/artwork";
import { project } from "../src/core/sky";
let k: Kernel;
beforeAll(async () => {
  k = await Kernel.create(
    readFileSync("node_modules/clipper2-wasm/dist/es/clipper2z.wasm"),
  );
});
describe("flat print geometry", () => {
  it("orients the looking-up sky correctly", () => {
    expect(project(90, 0)).toEqual([52.5, 66]);
    expect(project(0, 90)[0]).toBeLessThan(52.5);
    expect(project(0, 270)[0]).toBeGreaterThan(52.5);
    expect(project(0, 0)[1]).toBe(24);
  });
  it("creates manifold extrusions with holes", () => {
    const p = k.op([circle(20, 20, 10)], [circle(20, 20, 5)], "difference");
    const mesh = extrude(p, "ring", "#FFFFFF", 1, 0.6),
      r = inspectMesh(mesh);
    expect(r.invalidEdges).toBe(0);
    expect(r.degenerate).toBe(0);
    expect(r.volume).toBeCloseTo(totalArea(p) * 0.6, 5);
  });
  it("fills the front and backing without overlapping volumes", () => {
    const fg = k.union([circle(30, 30, 1), circle(60, 60, 2)]),
      bg = k.op([outline()], fg, "difference");
    const a = inspectMesh(backing(bg, fg, 4, "#101E30")),
      b = inspectMesh(extrude(fg, "stars", "#FFFFFF", 1, 0.6));
    expect(a.invalidEdges).toBe(0);
    expect(b.invalidEdges).toBe(0);
    expect(a.volume + b.volume).toBeCloseTo(area(outline()) * 4, 5);
  });
});
