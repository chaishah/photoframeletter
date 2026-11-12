import { extrude } from "./mesh";
import type { Mesh, Ring } from "./types";
import { PLATE, STAND } from "./print-layout";

export function standVolume(thickness: number) {
  return STAND.width * (STAND.depth * STAND.height -
    (thickness + STAND.clearance) * (STAND.height - STAND.floor));
}

export function makeDisplayStand(thickness: number, colour: string): Mesh {
  if (!Number.isFinite(thickness) || thickness < 4 || thickness > 8)
    throw new Error("Display stand requires a card thickness between 4 and 8 mm.");
  const halfSlot = (thickness + STAND.clearance) / 2;
  const halfDepth = STAND.depth / 2;
  // A single concave section forms the base and both jaws. The slot opens
  // upwards: each layer is supported, with no bridge across the card slot.
  const section: Ring = [
    [-halfDepth, 0], [halfDepth, 0], [halfDepth, STAND.height],
    [halfSlot, STAND.height], [halfSlot, STAND.floor],
    [-halfSlot, STAND.floor], [-halfSlot, STAND.height],
    [-halfDepth, STAND.height],
  ];
  const mesh = extrude([section], "Matching display stand", colour, 0, STAND.width);
  // Undo the card-centred XY translation and rotate section/extrusion axes
  // with an orientation-preserving permutation into printer XYZ.
  mesh.vertices = mesh.vertices.map(([u, v, w]) => [
    w - STAND.width / 2, u + 52.5 + STAND.y, v + 74,
  ]);
  return mesh;
}

export function fitsPlate(mesh: Mesh) {
  return mesh.vertices.every(([x, y, z]) =>
    Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) &&
    x + PLATE.x >= 5 && x + PLATE.x <= PLATE.size - 5 &&
    y + PLATE.y >= 5 && y + PLATE.y <= PLATE.size - 5 && z >= 0 && z <= 250 &&
    // Bambu P1S front-left exclusion zone, including a small margin.
    !(x + PLATE.x < 23 && y + PLATE.y < 33));
}
