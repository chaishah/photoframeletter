# Our Night Sky

A browser-based star-map card designer. Choose a location, date and local time,
review the printable front or rotate the 3D card, then download a Bambu-compatible
3MF or a ZIP containing one aligned STL per filament colour.

## Run locally

Requires Node 22.12+ and npm. No API keys, account, database or backend are needed.

```sh
npm ci
npm run dev
```

Open the URL Vite prints, with `/photoframeletter/` at the end. For a production
preview, run `npm run build` followed by `npm run preview`.

## Print specification

- A6 portrait: 105 × 148 mm, rounded 3 mm corners.
- Thickness: 4–8 mm in 0.2 mm steps; default 4 mm.
- A flat, non-embossed front, printed face down. Colour inlays occupy the same
  first three 0.2 mm layers; the continuous backing starts above them.
- Bambu P1S, 0.4 mm nozzle, PLA, up to four colours including the background.
- Matching palette choices share one filament and are merged before meshing.
- 3MF preserves parts, colours and printer settings. For STL, import every file
  in the ZIP together as parts of **one object**, keeping their shared origin.

This is one flat assembled card, not a single 0.2 mm physical layer. Inspect the
native slice and map the spools before printing. Physical print adhesion, colour
opacity and postal suitability still require a real sample. Measure and weigh
the packaged print before choosing postage.

## Validation and compact files

Invalid dates, coordinates, timezones, skipped clock times, unresolved repeated
clock times, unsupported lettering and oversized captions block generation.
Editing the location or inputs disables downloads until the new design passes.

Geometry checks cover colour coverage/overlap, retained star centres, finite
vertices, positive assembled volume, bounds, triangle indices, paired oriented
edges, degenerate triangles and small disconnected print features. Curves are
flattened with bounded geometric error; hidden and interior same-colour surfaces
are removed. No global mesh decimation moves the stars or colour boundaries.

The target is 30,000 triangles / 2 MiB. Detailed maps can exceed that target: the
default contains 74,420 triangles and is approximately 0.77 MiB. Downloads are
blocked above **100,000 triangles or 5 MiB**. The app never quietly drops stars to
meet this budget. Touching star disks can join, and disconnected constellation
fragments unable to contain a 0.4 mm bead are omitted; the preview shows this.
Corner tips and narrow gaps can still be changed by the slicer's extrusion width.

## Astronomy and data

- HYG 4.1, stars down to magnitude 6.5; the design density limit is magnitude 5.5.
- J2000 positions and proper motion, precession/nutation and horizon rotation
  through Astronomy Engine. Azimuthal equidistant projection, looking up:
  north at the top, east at the left. Constellation anchors remain in the map.
- Geometric horizon, no refraction, terrain, atmospheric extinction or weather.
  The Sun triggers a daylight/twilight notice. Planets and the Moon are not drawn.
- Astronomy Engine approximates UTC as UT1. Historic civil time and future
  timezone/rotation predictions are approximate; the saved UTC offset and tzdb
  version make the conversion reviewable.
- Bundled GeoNames cities1000 location search with explicit result selection,
  or manual coordinates and confirmed IANA timezone. Search is a compressed
  local dataset; there is no geocoding service or location transmission.

Source URLs and original SHA-256 hashes are in `public/data/sources.json`.
The checked-in derived datasets are used at build/runtime. `prepare_data.py`
explicitly refreshes upstream data and its hashes; it is not part of the build.
Review data changes before committing an update. Licences and attribution are
in `public/licenses/`: HYG CC BY-SA, GeoNames CC BY, d3-celestial BSD and Noto OFL.

## Checks

```sh
npm test
npm run build
node node_modules/tsx/dist/cli.mjs scripts/generate-samples.ts --all
```

Tests include an independent 48-case Skyfield/JPL reference on a matched UT1
timescale, DST/invalid inputs, global sky cases, all palette partitions, topology,
export gates and ZIP/STL round trips. Reference regeneration requires Python,
Skyfield, requests and the DE440s kernel (`scripts/reference_sky.py`).

On Windows with Bambu Studio installed, native and independent geometry checks:

```sh
python scripts/slice_validate.py perth-default perth-8mm london-two-colour north-pole
python scripts/verify_exports.py
```

The independent checks require numpy, trimesh and shapely. They parse the actual
3MF XML and STL binaries, verify topology and volumes, compare planar coverage,
and ensure native reports belong to the exact exported file SHA-256. Native
reports inspect the colour layer ranges and require zero automatic mesh repairs.
Generated evidence is in the ignored `validation/` folder; print files are in
`samples/`. A native pass applies to that sample, not every future custom design.

## Architecture and deployment

React + TypeScript + Vite. A cancellable Web Worker loads astronomy/geometry data
and performs generation. Clipper2 handles planar regions, Earcut triangulates
caps, fflate packages exports, and lazy Three.js renders the same meshes as 3MF.
The SVG preview uses the printable contours, including clipping decisions.

GitHub Actions tests and builds before deploying `dist/` to GitHub Pages. Enable
Pages with **Source: GitHub Actions** in the repository settings. The base path
is `/photoframeletter/`; changing the repository name requires updating it in
`vite.config.ts`. For a different host, set the base to that host's mount path.

See [PLAN.md](PLAN.md) for the implementation and release criteria, and
[VALIDATION.md](VALIDATION.md) for the recorded release evidence.
