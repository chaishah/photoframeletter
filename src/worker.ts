import opentype from "opentype.js";
import wasmUrl from "clipper2-wasm/dist/es/clipper2z.wasm?url";
import { Kernel } from "./core/clipper";
import { generate } from "./core/generate";
import { make3mf, makeStlZip } from "./core/export";
import { InputError } from "./core/time";
import type { Settings } from "./core/types";
const base = import.meta.env.BASE_URL;
async function fetchAsset(name: string) {
  const r = await fetch(`${base}data/${name}`);
  if (!r.ok)
    throw new Error(`Could not load ${name}. Check your connection and retry.`);
  return r;
}
const loaded = Promise.all([
  fetchAsset("stars.json").then((r) => r.json()),
  fetchAsset("constellations.json").then((r) => r.json()),
  fetchAsset("NotoSans-Bold.ttf")
    .then((r) => r.arrayBuffer())
    .then((b) => opentype.parse(b)),
  Kernel.create(undefined, wasmUrl),
  fetchAsset("bambu-settings.json").then((r) => r.json()),
]);
self.onmessage = async ({
  data,
}: {
  data: { id: number; settings: Settings };
}) => {
  const { id, settings } = data;
  try {
    const [stars, edges, font, k, template] = await loaded;
    const model = await generate(settings, stars, edges, font, k, (message) =>
      self.postMessage({ id, type: "progress", message }),
    );
    let file3mf: Uint8Array | undefined, stlZip: Uint8Array | undefined;
    if (model.report.modelValidated) {
      self.postMessage({
        id,
        type: "progress",
        message: "Packaging your print files",
      });
      file3mf = make3mf(model, template);
      model.report.bytes3mf = file3mf.length;
      stlZip = makeStlZip(model);
    }
    self.postMessage({ id, type: "complete", model, file3mf, stlZip });
  } catch (e) {
    self.postMessage({
      id,
      type: "error",
      message: e instanceof Error ? e.message : String(e),
      field: e instanceof InputError ? e.field : undefined,
    });
  }
};
