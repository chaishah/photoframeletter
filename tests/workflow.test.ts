import { readFileSync } from "node:fs";
import { beforeAll, describe, it, expect } from "vitest";
import opentype from "opentype.js";
import { unzipSync, strFromU8 } from "fflate";
import { Kernel, splitTouches, totalArea } from "../src/core/clipper";
import { generate } from "../src/core/generate";
import { make3mf, makeStlZip } from "../src/core/export";
import {
  DEFAULT_SETTINGS,
  type Settings,
  type Model,
  type Ring,
} from "../src/core/types";
const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const stars = json("public/data/stars.json"),
  lines = json("public/data/constellations.json"),
  settings = json("public/data/bambu-settings.json");
const data = readFileSync("public/data/NotoSans-Bold.ttf");
const font = opentype.parse(
  data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer,
);
let k: Kernel, perth: Model;
beforeAll(async () => {
  k = await Kernel.create(
    readFileSync("node_modules/clipper2-wasm/dist/es/clipper2z.wasm"),
  );
  perth = await generate(DEFAULT_SETTINGS, stars, lines, font, k);
});
describe("generation and export gates", () => {
  it("creates a compact, flat four-colour card with every star centre retained", () => {
    expect(perth.report.errors).toEqual([]);
    expect(perth.report.triangles).toBeLessThan(80000);
    expect(perth.report.stars).toBeGreaterThan(500);
    expect(make3mf(perth, settings).length).toBeLessThan(1024 * 1024);
    for (const m of perth.meshes.slice(1))
      expect(new Set(m.vertices.map((v) => v[2]))).toEqual(new Set([0, 0.6]));
  });
  it("exports a 3MF with complete per-filament settings and assigned parts", () => {
    const z = unzipSync(make3mf(perth, settings));
    const c = JSON.parse(strFromU8(z["Metadata/project_settings.config"]));
    expect(c.filament_colour).toEqual(DEFAULT_SETTINGS.palette);
    expect(c.nozzle_temperature).toHaveLength(4);
    expect(c.inherits_group).toHaveLength(6);
    expect(c.different_settings_to_system).toHaveLength(6);
    expect(
      strFromU8(z["Metadata/model_settings.config"]).match(/<part /g),
    ).toHaveLength(4);
    expect(strFromU8(z["3D/3dmodel.model"])).toContain('unit="millimeter"');
  });
  it("exports one binary STL per colour without losing triangles", () => {
    const z = unzipSync(makeStlZip(perth));
    let count = 0;
    const stls = Object.entries(z).filter(([p]) => p.endsWith(".stl"));
    expect(stls).toHaveLength(4);
    for (const [, b] of stls) {
      const n = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(
        80,
        true,
      );
      expect(b.length).toBe(84 + 50 * n);
      count += n;
    }
    expect(count).toBe(perth.report.triangles);
  });
  it("rejects both export formats when validation fails", () => {
    const invalid = {
      ...perth,
      report: { ...perth.report, modelValidated: false },
    };
    expect(() => make3mf(invalid, settings)).toThrow();
    expect(() => makeStlZip(invalid)).toThrow();
  });
  it("blocks dense geometry without silently discarding stars", async () => {
    const m = await generate(
      {
        ...DEFAULT_SETTINGS,
        latitude: 0,
        longitude: 0,
        timezone: "Etc/UTC",
        magnitude: 5.5,
      },
      stars,
      lines,
      font,
      k,
    );
    expect(m.report.errors.map((e) => e.code)).toContain("TRIANGLE_LIMIT");
    expect(() => make3mf(m, settings)).toThrow();
  });
  it("rejects missing glyphs and captions that would exceed the card", async () => {
    for (const title of ["🌟", "WWWWWWWWWWWWWWWWWWWWWWWWWWWW"])
      await expect(
        generate({ ...DEFAULT_SETTINGS, title }, stars, lines, font, k),
      ).rejects.toThrow();
  });
  it("splits a sub-grid contact without changing the designed area", () => {
    const p: Ring = [
      [18.8166, 90.59762],
      [18.93905, 90.6769],
      [18.73998, 90.76782],
      [18.67484, 90.86916],
      [19.21199, 91.58047],
      [19.25799, 91.57386],
      [19.4641, 91.39527],
      [19.52848, 91.17597],
      [19.89059, 91.58249],
      [21.26043, 93.01948],
      [21.16305, 93.00548],
      [20.93543, 93.10944],
      [20.80014, 93.31995],
      [20.80014, 93.47016],
      [20.41821, 93.07733],
      [19.77862, 92.3308],
      [18.49113, 90.6259],
      [18.62435, 90.56384],
    ];
    const split = splitTouches(p);
    expect(split).toHaveLength(2);
    expect(totalArea(split)).toBeCloseTo(totalArea([p]), 4);
  });
  for (const mapping of [
    "0000",
    "0001",
    "0010",
    "0011",
    "0012",
    "0100",
    "0101",
    "0102",
    "0110",
    "0111",
    "0112",
    "0120",
    "0121",
    "0122",
    "0123",
  ])
    it(`unions shared colour parts: ${mapping}`, async () => {
      const palette = [...mapping].map(
        (i) => DEFAULT_SETTINGS.palette[Number(i)],
      ) as Settings["palette"];
      const m = await generate(
        { ...DEFAULT_SETTINGS, palette },
        stars,
        lines,
        font,
        k,
      );
      expect(m.report.errors).toEqual([]);
      expect(m.meshes).toHaveLength(new Set(mapping).size);
      expect(m.report.triangles).toBeLessThanOrEqual(perth.report.triangles);
    }, 15000);
});
describe("global generation regression cases", () => {
  const cases: Partial<Settings>[] = [
    {
      latitude: 51.5074,
      longitude: -0.1278,
      timezone: "Europe/London",
      location: "LONDON",
      palette: ["#101E30", "#FFFFFF", "#FFFFFF", "#FFFFFF"],
    },
    {
      latitude: 90,
      longitude: 0,
      timezone: "Etc/UTC",
      location: "NORTH POLE",
      magnitude: 3,
    },
    {
      latitude: -90,
      longitude: 180,
      timezone: "Etc/UTC",
      location: "SOUTH POLE",
      date: "2100-12-31",
    },
    {
      latitude: 40.7128,
      longitude: -74.006,
      timezone: "America/New_York",
      location: "NEW YORK",
      date: "1900-01-01",
    },
    {
      latitude: 27.7172,
      longitude: 85.324,
      timezone: "Asia/Kathmandu",
      location: "KATHMANDU",
      date: "2024-02-29",
    },
    {
      latitude: 0,
      longitude: 180,
      timezone: "Pacific/Fiji",
      location: "DATE LINE",
      constellations: false,
      magnitude: 3,
    },
    { thickness: 8, title: "", caption: false },
  ];
  for (const change of cases)
    it(
      JSON.stringify(change),
      async () => {
        const m = await generate(
          { ...DEFAULT_SETTINGS, ...change },
          stars,
          lines,
          font,
          k,
        );
        expect(m.report.errors).toEqual([]);
        const c = JSON.parse(
          strFromU8(
            unzipSync(make3mf(m, settings))["Metadata/project_settings.config"],
          ),
        );
        expect(c.inherits_group).toHaveLength(m.report.colours + 2);
      },
      15000,
    );
});
