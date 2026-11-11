import { readFile, mkdir, writeFile } from "node:fs/promises";
import opentype from "opentype.js";
import { Kernel } from "../src/core/clipper";
import { generate } from "../src/core/generate";
import { make3mf, makeStlZip } from "../src/core/export";
import { DEFAULT_SETTINGS, type Settings } from "../src/core/types";
const json = async (p: string) => JSON.parse(await readFile(p, "utf8"));
const stars = await json("public/data/stars.json"),
  edges = await json("public/data/constellations.json"),
  template = await json("public/data/bambu-settings.json");
const fontBytes = await readFile("public/data/NotoSans-Bold.ttf");
const font = opentype.parse(
  fontBytes.buffer.slice(
    fontBytes.byteOffset,
    fontBytes.byteOffset + fontBytes.byteLength,
  ) as ArrayBuffer,
);
const k = await Kernel.create(
  await readFile("node_modules/clipper2-wasm/dist/es/clipper2z.wasm"),
);
await mkdir("samples", { recursive: true });
await mkdir("validation", { recursive: true });
const fixtures: { name: string; changes: Partial<Settings> }[] = [
  { name: "perth-default", changes: {} },
  ...(process.argv.includes("--all")
    ? [
        { name: "perth-8mm", changes: { thickness: 8 } },
        {
          name: "london-two-colour",
          changes: {
            latitude: 51.5074,
            longitude: -0.1278,
            timezone: "Europe/London",
            location: "LONDON",
            palette: [
              "#101E30",
              "#FFFFFF",
              "#FFFFFF",
              "#FFFFFF",
            ] as Settings["palette"],
          },
        },
        {
          name: "equator-dense",
          changes: {
            latitude: 0,
            longitude: 0,
            timezone: "Etc/UTC",
            location: "THE EQUATOR",
            magnitude: 5.5,
          },
        },
        {
          name: "north-pole",
          changes: {
            latitude: 90,
            longitude: 0,
            timezone: "Etc/UTC",
            location: "NORTH POLE",
            magnitude: 3,
          },
        },
      ]
    : []),
];
for (const f of fixtures) {
  const start = performance.now();
  const model = await generate(
    { ...DEFAULT_SETTINGS, ...f.changes },
    stars,
    edges,
    font,
    k,
    (p) => console.log(f.name, p),
  );
  await writeFile(`validation/${f.name}.model.json`, JSON.stringify(model));
  const file = make3mf(model, template, true);
  model.report.bytes3mf = file.length;
  await writeFile(`samples/${f.name}.3mf`, file);
  if (model.report.modelValidated)
    await writeFile(`samples/${f.name}-stl.zip`, makeStlZip(model));
  await writeFile(
    `validation/${f.name}.report.json`,
    JSON.stringify(model.report, null, 2),
  );
  console.log(
    JSON.stringify({
      name: f.name,
      seconds: (performance.now() - start) / 1000,
      triangles: model.report.triangles,
      bytes: file.length,
      errors: model.report.errors.slice(0, 8),
      errorCount: model.report.errors.length,
    }),
  );
}
