import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import * as A from "astronomy-engine";
import { starDirection } from "../src/core/sky";
import type { Star } from "../src/core/types";
const catalogue: Star[] = JSON.parse(
  readFileSync("public/data/stars.json", "utf8"),
);
const reference = JSON.parse(
  readFileSync("tests/fixtures/skyfield.json", "utf8"),
);
describe("independent Skyfield/JPL reference", () => {
  for (const c of reference.cases)
    it(`${c.name} at ${c.latitude}, ${c.longitude}, ${c.utc}`, () => {
      const date = new Date(c.utc),
        star = catalogue.find((s) => s.id === c.starId)!;
      const v = A.RotateVector(
        A.Rotation_EQJ_HOR(date, new A.Observer(c.latitude, c.longitude, 0)),
        starDirection(star, date),
      );
      const alt = (c.altitude * Math.PI) / 180,
        az = (c.azimuth * Math.PI) / 180;
      const expected = [
        Math.cos(alt) * Math.cos(az),
        -Math.cos(alt) * Math.sin(az),
        Math.sin(alt),
      ];
      const separation =
        (Math.acos(
          Math.min(
            1,
            Math.max(
              -1,
              (v.x * expected[0] + v.y * expected[1] + v.z * expected[2]) /
                Math.hypot(v.x, v.y, v.z),
            ),
          ),
        ) *
          180) /
        Math.PI;
      expect(separation).toBeLessThan(0.1);
    });
});
