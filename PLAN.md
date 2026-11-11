# Implementation plan

## 1. Product and print contract

Create a static website for one personal sky moment. The inputs are a selected
town or explicit coordinates, local date, local time and IANA timezone. Optional
controls set the title, location caption, constellation visibility, star density,
four palette assignments and card thickness. Save/load the design as versioned
JSON without sending it to a server.

Use A6 portrait dimensions, R3 corners, a 4–8 mm backing and 0.6 mm coplanar
colour inlays. Print face down on a P1S with a 0.4 mm nozzle and PLA. Limit the
whole design to one AMS's four filaments, including the background. No embossed
or recessed front details. The mailability of the packaged object is a separate
physical/postal check.

## 2. Location and civil time

Bundle a compressed GeoNames city list and country/region labels. Require the
user to choose a result so similarly named places cannot silently resolve to the
wrong town. Manual coordinates require timezone confirmation. Dates must be
real calendar dates between 1900 and 2100; coordinates and dimensions must be
finite and within their defined ranges. Resolve local time by enumerating valid
UTC candidates. Reject gaps and require earlier/later selection for overlaps.
Record the chosen offset, UTC instant and timezone database version.

## 3. Sky calculation

Bundle a magnitude-limited HYG catalogue and constellation connections. Apply
proper motion in the J2000 tangent plane, then transform to the local horizon.
Project the visible hemisphere with zenith at the centre, north up and east left.
Clip constellation arcs at the horizon. Include their anchor stars, even when
the density setting would otherwise hide a faint endpoint. Warn in daylight.
Compare an independent Skyfield/JPL reference on the same timescale, including
both poles, leap dates, modern dates and the supported endpoints.

## 4. Printable artwork and geometry

Convert the star disks, line strokes, compass, horizon and font outlines into
integer planar polygons. Use bounded curve flattening rather than a dense
generic sphere/text mesh. Enlarge very thin text strokes slightly; reject text
that cannot fit. Resolve overlapping colour regions with deterministic priority.
Preserve star centres. Remove only explicitly disclosed undersized detached line
fragments. Split sub-grid polygon contacts before triangulation.

Create shallow watertight inlay solids and a complementary background with one
continuous backing. Merge matching colours before triangulation so STL contains
no coincident internal faces. Check coverage, overlap, area preservation,
dimensions, oriented manifold edges, triangle indices, finite coordinates,
degeneracy, positive volumes and small isolated features.

## 5. Preview and exports

Show the exact printable polygons as SVG, then lazy-load a Three.js view using
the actual output meshes. Disallow exports while inputs are edited, generation
is running or validation fails. Run expensive work in a cancellable worker with
a timeout and actionable errors. Show star/colour counts, triangles, compressed
file size and downloadable validation evidence.

Produce a native-compatible multipart 3MF with millimetre units, material slots,
part assignments, consistent per-filament settings and a face-down placement.
Also provide aligned binary STLs, one per distinct colour, in a ZIP with import
instructions. Round-trip the package. Enforce hard budgets of 100,000 triangles
and 5 MiB; report the softer targets of 30,000 triangles and 2 MiB separately.

## 6. Release gates

1. TypeScript production build and dependency audit.
2. Automated input, astronomy, all-palette and geometry/export regression tests.
3. Independent XML/STL/GEOS/trimesh checks of actual exported sample files.
4. Native Bambu slicing of default, thick, two-colour and polar samples; verify
   filament slots, only three decorative layers, supported bounds, no supports,
   and no automatic mesh repairs. Tie every report to its source file hash.
5. Browser checks for search, staleness, errors, 2D/3D preview, download controls,
   and responsive layout. Record any verification limits explicitly.
6. Push source with locked dependencies and retained data licences; build and
   deploy through GitHub Pages; verify the hosted result.
7. Physical print proof remains a user test. Inspect first-layer adhesion,
   lettering, tiny stars, colour coverage, dimensions and the packaged weight.
   Do not represent digital checks as physical-print proof.
