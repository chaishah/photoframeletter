import { describe, expect, it } from "vitest";
import { fitsPlate, makeDisplayStand } from "../src/core/stand";
import { inspectMesh } from "../src/core/mesh";
import { validateSettings } from "../src/core/time";
import { DEFAULT_SETTINGS } from "../src/core/types";

describe("display stand geometry", () => {
  for (let step = 20; step <= 40; step++) {
    const thickness = step / 5;
    it(`fits the same plate and has a valid open slot for a ${thickness} mm card`, () => {
      const mesh = makeDisplayStand(thickness, "#101E30");
      const stats = inspectMesh(mesh);
      expect(stats.invalidEdges).toBe(0);
      expect(stats.degenerate).toBe(0);
      // Solid 70x30x14 block minus the open, 10 mm deep insertion slot.
      expect(stats.volume).toBeCloseTo(70 * 30 * 14 - 70 * (thickness + 0.6) * 10, 5);
      expect(fitsPlate(mesh)).toBe(true);
      expect(Math.min(...mesh.vertices.map((p) => p[1])) - 74).toBe(10);
      expect(Math.min(...mesh.vertices.map((p) => p[2]))).toBe(0);
      const slotWalls = [...new Set(mesh.vertices.filter((p) => p[2] === 4).map((p) => p[1]))].sort((a, b) => a - b);
      expect(slotWalls[1] - slotWalls[0]).toBeCloseTo(thickness + 0.6, 5);
      // No triangle can bridge the slot at the top: its centre is outside
      // the slot, unless it belongs to the solid floor or the end caps.
      for (const face of mesh.triangles) {
        const points = face.map((i) => mesh.vertices[i]);
        if (points.every((p) => p[2] === 14)) {
          const y = points.reduce((sum, p) => sum + p[1], 0) / 3;
          expect(y <= slotWalls[0] || y >= slotWalls[1]).toBe(true);
        }
      }
    });
  }
  it("rejects out-of-plate placement and invalid settings", () => {
    const mesh = makeDisplayStand(4, "#101E30");
    mesh.vertices[0][0] = 200;
    expect(fitsPlate(mesh)).toBe(false);
    expect(() => makeDisplayStand(NaN, "#101E30")).toThrow();
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, displayStand: "yes" as unknown as boolean })).toThrow();
    expect(() => validateSettings(DEFAULT_SETTINGS)).not.toThrow();
  });
});
