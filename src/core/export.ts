import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import type { Model, Mesh } from "./types";
export const xml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
const NS = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02";
const PROD = "http://schemas.microsoft.com/3dmanufacturing/production/2015/06";
const REL = "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel";
const uuid = (n: number) =>
  `${n.toString(16).padStart(8, "0")}-4e53-4b59-8888-000000000001`;
const header = '<?xml version="1.0" encoding="UTF-8"?>';
function meshXml(m: Mesh, id: number) {
  return `<object id="${id}" type="model" name="${xml(m.name)}" pid="100" pindex="${m.slot}" p:UUID="${uuid(id)}"><mesh><vertices>${m.vertices.map(([x, y, z]) => `<vertex x="${x.toFixed(5)}" y="${y.toFixed(5)}" z="${z.toFixed(5)}"/>`).join("")}</vertices><triangles>${m.triangles.map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}"/>`).join("")}</triangles></mesh></object>`;
}
export function make3mf(
  model: Model,
  template: Record<string, unknown>,
  allowInvalid = false,
): Uint8Array {
  if (!model.report.modelValidated && !allowInvalid)
    throw new Error("Fix model validation errors before downloading.");
  const colours = [...new Set(model.meshes.map((m) => m.colour.toUpperCase()))];
  const settings = structuredClone(template);
  settings.filament_colour = colours;
  const filamentKeys = settings._filament_array_keys as string[];
  delete settings._filament_array_keys;
  settings.different_settings_to_system = Array(colours.length + 2).fill("");
  settings.inherits_group = Array(colours.length + 2).fill("");
  for (const [key, value] of Object.entries(settings))
    if (
      (key.startsWith("filament_") || filamentKeys.includes(key)) &&
      Array.isArray(value) &&
      value.length === 4
    )
      settings[key] = value.slice(0, colours.length);
  settings.flush_volumes_matrix = colours.flatMap((_, i) =>
    colours.map((_, j) => (i === j ? "0" : "280")),
  );
  settings.flush_volumes_vector = Array(colours.length * 2).fill("140");
  const objects =
    header +
    `<model unit="millimeter" xmlns="${NS}" xmlns:p="${PROD}"><resources><basematerials id="100">${colours.map((c, i) => `<base name="Filament ${i + 1}" displaycolor="${c}"/>`).join("")}</basematerials>${model.meshes.map((m, i) => meshXml(m, i + 1)).join("")}</resources></model>`;
  const main =
    header +
    `<model unit="millimeter" xml:lang="en-US" xmlns="${NS}" xmlns:p="${PROD}" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" requiredextensions="p"><metadata name="Application">BambuStudio-02.08.02.61</metadata><metadata name="BambuStudio:3mfVersion">1</metadata><metadata name="Title">Our Night Sky</metadata><metadata name="Description">Flat A6 star-map card. Model checks are recorded separately from native slicing and physical print proof.</metadata><resources><object id="20" p:UUID="${uuid(20)}" type="model"><components>${model.meshes.map((_, i) => `<component p:path="/3D/Objects/object_1.model" objectid="${i + 1}" p:UUID="${uuid(30 + i)}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`).join("")}</components></object></resources><build p:UUID="${uuid(50)}"><item objectid="20" p:UUID="${uuid(51)}" transform="1 0 0 0 1 0 0 0 1 112 116 0" printable="1"/></build></model>`;
  const config =
    header +
    `<config><object id="20"><metadata key="name" value="Our Night Sky — ${xml(model.settings.location)}"/><metadata key="extruder" value="1"/><metadata face_count="${model.report.triangles}"/>${model.meshes.map((m, i) => `<part id="${i + 1}" subtype="normal_part" uuid="${uuid(60 + i)}"><metadata key="name" value="${xml(m.name)}"/><metadata key="extruder" value="${m.slot + 1}"/><metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/><metadata key="source_file" value="generated-star-map"/><metadata key="source_object_id" value="0"/><metadata key="source_volume_id" value="${i}"/><metadata key="source_offset_x" value="0"/><metadata key="source_offset_y" value="0"/><metadata key="source_offset_z" value="0"/></part>`).join("")}</object><plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value="Our Night Sky"/><metadata key="locked" value="false"/><model_instance><metadata key="object_id" value="20"/><metadata key="instance_id" value="0"/><metadata key="identify_id" value="1"/></model_instance></plate><assemble/></config>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      header +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/octet-stream"/><Default Extension="json" ContentType="application/json"/></Types>',
    ),
    "_rels/.rels": strToU8(
      header +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="${REL}"/></Relationships>`,
    ),
    "3D/_rels/3dmodel.model.rels": strToU8(
      header +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/Objects/object_1.model" Id="rel-1" Type="${REL}"/></Relationships>`,
    ),
    "3D/3dmodel.model": strToU8(main),
    "3D/Objects/object_1.model": strToU8(objects),
    "Metadata/model_settings.config": strToU8(config),
    "Metadata/project_settings.config": strToU8(JSON.stringify(settings)),
    "Metadata/design.json": strToU8(
      JSON.stringify(
        { settings: model.settings, resolvedTime: model.sky.time },
        null,
        2,
      ),
    ),
    "Metadata/validation.json": strToU8(JSON.stringify(model.report, null, 2)),
  };
  const bytes = zipSync(files, {
    level: 6,
    mtime: new Date("2020-01-01T00:00:00Z"),
  });
  const reloaded = unzipSync(bytes);
  if (
    strFromU8(reloaded["3D/Objects/object_1.model"]) !== objects ||
    strFromU8(reloaded["Metadata/model_settings.config"]) !== config
  )
    throw new Error("3MF round-trip verification failed.");
  if (bytes.length > 5 * 1024 * 1024)
    throw new Error("3MF exceeds the 5 MiB export limit. Reduce detail.");
  return bytes;
}
export function binaryStl(mesh: Mesh) {
  const bytes = new Uint8Array(84 + mesh.triangles.length * 50),
    view = new DataView(bytes.buffer);
  bytes.set(
    strToU8(
      "Our Night Sky | millimetres | shared origin | import as assembly",
    ).slice(0, 80),
  );
  view.setUint32(80, mesh.triangles.length, true);
  let offset = 84;
  for (const face of mesh.triangles) {
    const [a, b, c] = face.map((i) => mesh.vertices[i]);
    const ab = b.map((x, i) => x - a[i]),
      ac = c.map((x, i) => x - a[i]);
    const n = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ],
      len = Math.hypot(...n);
    for (const v of [...n.map((v) => v / len), ...a, ...b, ...c]) {
      view.setFloat32(offset, v, true);
      offset += 4;
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return bytes;
}
export function makeStlZip(model: Model) {
  if (!model.report.modelValidated)
    throw new Error("Fix validation errors first.");
  const files: Record<string, Uint8Array> = {};
  for (const slot of new Set(model.meshes.map((m) => m.slot))) {
    const source = model.meshes.filter((m) => m.slot === slot);
    const mesh: Mesh = {
      name: `Filament ${slot + 1}`,
      slot,
      colour: source[0].colour,
      vertices: [],
      triangles: [],
    };
    for (const s of source) {
      const off = mesh.vertices.length;
      mesh.vertices.push(...s.vertices);
      mesh.triangles.push(...s.triangles.map((f) => f.map((i) => i + off)));
    }
    files[`filament-${slot + 1}-${mesh.colour.slice(1)}.stl`] = binaryStl(mesh);
  }
  files["READ-ME.txt"] = strToU8(
    "Import ALL STL files together into Bambu Studio as parts of ONE object. Units: mm. Preserve the shared origin and relative Z positions. Assign the named filament colours. Print face-down using 0.2 mm layers, with the inlays in layers 1–3. Slice and inspect before printing. STL does not store colours or printer settings.\n",
  );
  files["design.json"] = strToU8(JSON.stringify(model.settings, null, 2));
  files["validation.json"] = strToU8(JSON.stringify(model.report, null, 2));
  return zipSync(files, { level: 6 });
}
