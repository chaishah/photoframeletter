import { printDetails } from "./print-details";
import type { Font } from "opentype.js";
import {
  type Settings,
  type Star,
  type Model,
  type Paths,
  type Report,
  type Issue,
} from "./types";
import { calculateSky } from "./sky";
import { Kernel, totalArea, groups, area, inside } from "./clipper";
import { artwork, outline } from "./artwork";
import { backing, extrude, inspectMesh } from "./mesh";
import { makeDisplayStand, standVolume, fitsPlate } from "./stand";
import { STAND } from "./print-layout";
export async function sha256(data: string | Uint8Array) {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function generate(
  s: Settings,
  catalogue: Star[],
  edges: number[][],
  font: Font,
  k: Kernel,
  progress: (s: string) => void = () => {},
): Promise<Model> {
  progress("Calculating the sky");
  const sky = calculateSky(s, catalogue, edges);
  progress("Building flat colour regions");
  const regions = artwork(s, sky, font, k);
  const errors: Issue[] = [],
    warnings: Issue[] = [];
  for (const star of sky.stars) {
    const winding = regions[1].reduce(
      (n, r) => n + (inside([star.x, star.y], r) ? Math.sign(area(r)) : 0),
      0,
    );
    if (winding <= 0)
      errors.push({
        code: "STAR_LOST",
        message: `Star ${star.name || star.id} lost its centre during clipping. Change the time or reduce density.`,
        point: [star.x, star.y],
      });
  }
  // Coverage and overlap are tested before meshing. Shared surfaces are deliberate; volumes never overlap.
  const plate = [outline()];
  if (Math.abs(totalArea(k.op(k.union(regions.flat()), plate, "xor"))) > 0.002)
    errors.push({
      code: "COVERAGE",
      message:
        "The colour regions do not fill the card within the 0.002 mm² integer-clipping tolerance.",
    });
  for (let i = 0; i < 4; i++)
    for (let j = i + 1; j < 4; j++)
      if (
        Math.abs(totalArea(k.op(regions[i], regions[j], "intersection"))) >
        0.002
      )
        errors.push({
          code: "OVERLAP",
          message: `Colour regions ${i + 1} and ${j + 1} overlap beyond the 0.002 mm² integer-clipping tolerance.`,
        });
  progress("Triangulating the card");
  const names = [
    "Background",
    "Stars",
    "Constellations",
    "Lettering and horizon",
  ];
  // Union same-colour regions BEFORE meshing. Concatenated STL shells would
  // leave coincident internal faces when stars and lines use the same filament.
  const colours = [
    ...new Set(
      s.palette.filter((_, i) => regions[i].length).map((c) => c.toUpperCase()),
    ),
  ];
  const fullForeground = k.op([outline()], regions[0], "difference");
  const mapForeground = () => k.op(fullForeground, regions[3], "difference");
  const physical: Paths[] = [regions[0]];
  for (const colour of colours.slice(1)) {
    const indices = [1, 2, 3].filter(
      (i) => s.palette[i].toUpperCase() === colour,
    );
    // Stars and lines share an interface; recover their union from the backing.
    // Lettering is spatially separate, so concatenate its closed contours.
    physical.push(
      indices.includes(1) && indices.includes(2)
        ? indices.includes(3)
          ? fullForeground
          : mapForeground()
        : indices.flatMap((i) => regions[i]),
    );
  }
  const hidden = [1, 2, 3].filter(
    (i) => s.palette[i].toUpperCase() === colours[0],
  );
  let foreground = fullForeground;
  if (hidden.length) {
    foreground =
      hidden.length === 1 && hidden[0] === 3
        ? mapForeground()
        : physical.slice(1).flat();
    physical[0] = k.op([outline()], foreground, "difference");
  }
  foreground = k.op([outline()], physical[0], "difference");
  const { inlayDepth } = printDetails(s);
  const meshes = [backing(physical[0], foreground, s.thickness, colours[0], inlayDepth)];
  for (let slot = 1; slot < colours.length; slot++)
    meshes.push(
      extrude(
        physical[slot],
        names
          .filter((_, i) => s.palette[i].toUpperCase() === colours[slot])
          .join(" + "),
        colours[slot],
        slot,
        inlayDepth,
      ),
    );
  progress("Checking topology and dimensions");
  let volume = 0;
  for (const mesh of meshes) {
    const stats = inspectMesh(mesh);
    volume += stats.volume;
    if (stats.invalidEdges || stats.degenerate || stats.volume <= 0)
      errors.push({
        code: "TOPOLOGY",
        message: `${mesh.name}: ${stats.invalidEdges} invalid edges, ${stats.degenerate} degenerate triangles.`,
      });
    if (
      mesh.vertices.some(
        ([x, y, z]) =>
          x < -52.501 ||
          x > 52.501 ||
          y < -74.001 ||
          y > 74.001 ||
          z < 0 ||
          z > s.thickness + 1e-7,
      )
    )
      errors.push({
        code: "BOUNDS",
        message: "Geometry exceeds the card dimensions.",
      });
  }
  const expected = totalArea(plate) * s.thickness;
  if (Math.abs(volume - expected) > expected * 1e-6)
    errors.push({
      code: "VOLUME",
      message: "The assembled volume does not match a completely filled card.",
    });
  if (s.displayStand) {
    const stand = makeDisplayStand(s.thickness, colours[0]);
    const stats = inspectMesh(stand);
    if (stats.invalidEdges || stats.degenerate || stats.volume <= 0 ||
      Math.abs(stats.volume - standVolume(s.thickness)) > 0.0001)
      errors.push({ code: "STAND_TOPOLOGY", message: "The display stand failed its geometry checks." });
    if (stand.vertices.some(([x, y, z]) =>
      Math.abs(x) > STAND.width / 2 + 1e-7 ||
      y < 74 + STAND.cardGap - 1e-7 ||
      y > STAND.y + STAND.depth / 2 + 1e-7 ||
      z < 0 || z > STAND.height + 1e-7))
      errors.push({ code: "STAND_BOUNDS", message: "The stand exceeds its reserved area beside the card." });
    meshes.push(stand);
    volume += stats.volume;
    warnings.push({ code: "DISPLAY_STAND", message: "Card and stand share one plate with a 10 mm gap. The stand uses the background filament and a slot 0.6 mm wider than the card. Let both pieces cool before assembly; physical fit is not yet tested." });
  }
  if (meshes.some((mesh) => !fitsPlate(mesh)))
    errors.push({ code: "PLATE_BOUNDS", message: "The layout does not fit the reserved P1S print area." });
  const triangles = meshes.reduce((n, m) => n + m.triangles.length, 0),
    vertices = meshes.reduce((n, m) => n + m.vertices.length, 0);
  if (triangles > 100000)
    errors.push({
      code: "TRIANGLE_LIMIT",
      message:
        "The 100,000 triangle limit was exceeded. Reduce star density or shorten the caption.",
    });
  else if (triangles > 30000)
    warnings.push({
      code: "TRIANGLE_TARGET",
      message:
        "This detailed design exceeds the 30,000 triangle target. Reduce density for a smaller file.",
    });
  // Individual short fragments are checked after colour clipping. The background is supported by the backing.
  for (let i = 1; i < 4; i++)
    for (const g of groups(regions[i])) {
      const xs = g.outer.map((p) => p[0]),
        ys = g.outer.map((p) => p[1]);
      const w = Math.max(...xs) - Math.min(...xs),
        h = Math.max(...ys) - Math.min(...ys);
      if (
        (Math.min(w, h) < 0.38 ||
          !k.offset([g.outer, ...g.holes], -0.19).length) &&
        area(g.outer) > 0.001
      )
        errors.push({
          code: "SMALL_FRAGMENT",
          message: `A clipped ${names[i].toLowerCase()} fragment cannot contain a 0.38 mm bead. Reduce density or turn off constellation lines.`,
          point: g.outer[0],
        });
    }
  warnings.push({
    code: "PRINTABLE_OUTLINES",
    message:
      "Touching stars join. Detached constellation fragments narrower than 0.4 mm are omitted. The preview shows the printable outlines; star centres are preserved.",
  });
  if (sky.sunAltitude > -18)
    warnings.push({
      code: "DAYLIGHT",
      message:
        sky.sunAltitude >= 0
          ? "The Sun is above the horizon. This is a geometric star map; these stars would not all be visible."
          : "This moment is in twilight. Actual visibility depends on sky conditions.",
    });
  if (Number(s.date.slice(0, 4)) < 1970)
    warnings.push({
      code: "HISTORICAL_ZONE",
      message:
        "Historical timezone records can be incomplete. Confirm the selected zone and UTC offset.",
    });
  if (new Date(sky.time.utc) > new Date())
    warnings.push({
      code: "FUTURE_ZONE",
      message:
        "Future timezone rules may change. The saved design records the current timezone database.",
    });
  if (
    s.palette
      .slice(1)
      .some((c) => c.toUpperCase() === s.palette[0].toUpperCase())
  )
    warnings.push({
      code: "MATCHING_COLOURS",
      message:
        "Some artwork shares the background colour and will not be visible as a separate colour.",
    });
  const report: Report = {
    version: 1,
    errors,
    warnings,
    triangles,
    vertices,
    colours: colours.length,
    stars: sky.stars.length,
    modelValidated: errors.length === 0,
    nativeSlice: "not-run",
    physicalPrint: "not-run",
    dimensions: s.displayStand
      ? [105, 74 + STAND.y + STAND.depth / 2, STAND.height]
      : [105, 148, s.thickness],
    volume,
    ...(s.displayStand && { displayStand: {
      width: STAND.width, depth: STAND.depth, height: STAND.height,
      slotWidth: s.thickness + STAND.clearance, cardGap: STAND.cardGap,
    } }),
    inputHash: await sha256(JSON.stringify(s)),
    modelHash: await sha256(JSON.stringify(meshes)),
    versions: {
      app: "0.1.0",
      catalogue: "HYG 4.1, magnitude ≤6.5",
      astronomy: "astronomy-engine 2.1.19",
      timezone: sky.time.tzdb,
      geometry: "clipper2-wasm 0.4.0 / earcut 3.2.4",
    },
    generatedUtc: new Date().toISOString(),
  };
  return { settings: s, sky, regions, meshes, report };
}
