import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { decodeJson } from "./core/data";
import { OCCASIONS, applyOccasion } from "./core/occasions";
import {
  DEFAULT_SETTINGS,
  type Model,
  type Settings,
  type Paths,
} from "./core/types";
import { timezoneNames, resolveTime, validateSettings } from "./core/time";
const Preview3D = lazy(() => import("./Preview3D"));
type City = [
  string,
  string,
  string,
  string,
  string,
  number,
  number,
  string,
  number,
];
const dataUrl = (name: string) => `${import.meta.env.BASE_URL}data/${name}`;
const path = (paths: Paths) =>
  paths
    .map(
      (r) =>
        r
          .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(4)} ${y.toFixed(4)}`)
          .join("") + "Z",
    )
    .join("");
function download(data: Uint8Array | string, name: string, type: string) {
  const blob = new Blob(
      [typeof data === "string" ? data : new Uint8Array(data)],
      { type },
    ),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const schema = z
  .object({
    version: z.literal(1),
    location: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    timezone: z.string(),
    date: z.string(),
    time: z.string(),
    ambiguity: z.enum(["", "earlier", "later"]),
    thickness: z.number(),
    magnitude: z.number(),
    constellations: z.boolean(),
    title: z.string(),
    caption: z.boolean(),
    palette: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  })
  .strict();
function Card({ model }: { model: Model }) {
  return (
    <svg
      className="card-art"
      viewBox="0 0 105 148"
      role="img"
      aria-label={`Printable sky above ${model.settings.location} on ${model.settings.date} at ${model.settings.time}`}
    >
      <title>
        Exact printable front: stars and lettering are flat colour inlays
      </title>
      {model.regions.map((r, i) => (
        <path
          key={i}
          d={path(r)}
          fill={model.settings.palette[i]}
          fillRule="nonzero"
        />
      ))}
      {model.report.errors
        .filter((e) => e.point)
        .map((e, i) => (
          <circle
            key={i}
            cx={e.point![0]}
            cy={e.point![1]}
            r="1.6"
            fill="none"
            stroke="#ff4c68"
            strokeWidth="0.4"
          />
        ))}
    </svg>
  );
}
export default function App() {
  const [occasionId, setOccasionId] = useState(OCCASIONS[0].id);
  const occasion = OCCASIONS.find((item) => item.id === occasionId)!;
  const [occasionNotice, setOccasionNotice] = useState("");
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS),
    [model, setModel] = useState<Model | null>(null),
    [mode, setMode] = useState<"front" | "3d">("front");
  const [phase, setPhase] = useState("Preparing the star catalogue"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [field, setField] = useState("");
  const [files, setFiles] = useState<{ three?: Uint8Array; stl?: Uint8Array }>(
    {},
  );
  const [query, setQuery] = useState("Perth"),
    [selected, setSelected] = useState(true),
    [manual, setManual] = useState(false),
    [zoneConfirmed, setZoneConfirmed] = useState(true);
  const [cities, setCities] = useState<City[]>([]),
    [countries, setCountries] = useState<Record<string, string>>({}),
    [regions, setRegions] = useState<Record<string, string>>({}),
    [searchOpen, setSearchOpen] = useState(false),
    [cityError, setCityError] = useState("");
  const worker = useRef<Worker | null>(null),
    generation = useRef(0),
    importRef = useRef<HTMLInputElement>(null);
  const locationConfirmed = (manual || selected) && zoneConfirmed;
  const dirty =
    !locationConfirmed ||
    !model ||
    JSON.stringify(s) !== JSON.stringify(model.settings);
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setS((v) => ({ ...v, [key]: value }));
    setError("");
    setField("");
  };
  const cancel = () => {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setPhase("Generation cancelled. Your previous preview is retained.");
  };
  const generate = () => {
    try {
      if (!manual && !selected)
        throw new Error(
          "Choose a location from the search results, or use precise coordinates.",
        );
      if (!zoneConfirmed)
        throw new Error("Confirm the timezone for this location.");
      validateSettings(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    worker.current?.terminate();
    const w = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    const id = ++generation.current;
    setBusy(true);
    setError("");
    setField("");
    setPhase("Loading the sky engine");
    const timer = window.setTimeout(() => {
      if (id === generation.current) {
        w.terminate();
        setBusy(false);
        setError(
          "Generation exceeded 45 seconds. Reduce density and try again.",
        );
      }
    }, 45000);
    w.onmessage = ({ data }) => {
      if (data.id !== generation.current) return;
      if (data.type === "progress") setPhase(data.message);
      else {
        clearTimeout(timer);
        setBusy(false);
        if (data.type === "error") {
          setError(data.message);
          setField(data.field || "");
          setPhase("Please correct the highlighted input");
        } else {
          setModel(data.model);
          setFiles({ three: data.file3mf, stl: data.stlZip });
          setPhase(
            data.model.report.modelValidated
              ? "Your card is ready to review"
              : "Review the printability issues below",
          );
        }
        w.terminate();
        worker.current = null;
      }
    };
    w.onerror = () => {
      clearTimeout(timer);
      setBusy(false);
      setError(
        "The sky engine could not start. Reload the page and try again.",
      );
      w.terminate();
    };
    w.postMessage({ id, settings: s });
  };
  useEffect(() => {
    generate();
    return () => worker.current?.terminate();
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all(
      ["cities.json.gz", "countries.json", "regions.json"].map((n) =>
        fetch(dataUrl(n)).then(async (r) => {
          if (!r.ok)
            throw new Error(
              "Location search could not load. Use precise coordinates or reload.",
            );
          return decodeJson(new Uint8Array(await r.arrayBuffer()));
        }),
      ),
    )
      .then(([c, co, re]) => {
        if (active) {
          setCities(c as City[]);
          setCountries(co as Record<string, string>);
          setRegions(re as Record<string, string>);
        }
      })
      .catch((e) => active && setCityError(e.message));
    return () => {
      active = false;
    };
  }, []);
  const q = query
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const matches =
    q.length >= 2 && searchOpen
      ? cities
          .filter((c) =>
            `${c[2]} ${c[3]} ${countries[c[3]] || ""} ${regions[`${c[3]}.${c[4]}`] || ""}`
              .toLowerCase()
              .includes(q),
          )
          .slice(0, 12)
      : [];
  let timeSummary = "Choose a valid date, time and timezone";
  try {
    const t = resolveTime(s),
      off = t.offsetMinutes;
    timeSummary = `${t.abbreviation} · UTC${off < 0 ? "−" : "+"}${String(Math.floor(Math.abs(off) / 60)).padStart(2, "0")}:${String(Math.abs(off) % 60).padStart(2, "0")} → ${t.utc.slice(0, 16).replace("T", " ")} UTC`;
  } catch {}
  const selectCity = (c: City) => {
    setS((v) => ({
      ...v,
      location: c[2].toUpperCase(),
      latitude: c[5],
      longitude: c[6],
      timezone: c[7],
      ambiguity: "",
    }));
    setQuery(`${c[1]}, ${countries[c[3]] || c[3]}`);
    setSelected(true);
    setZoneConfirmed(true);
    setSearchOpen(false);
    setError("");
  };
  const save = () =>
    download(
      JSON.stringify(s, null, 2),
      "our-night-sky-design.json",
      "application/json",
    );
  const load = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 100000)
        throw new Error("Design settings must be smaller than 100 KB.");
      const loaded = schema.parse(JSON.parse(await file.text())) as Settings;
      validateSettings(loaded);
      setS(loaded);
      setManual(true);
      setZoneConfirmed(true);
      setSelected(true);
      setQuery(loaded.location);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid design file.");
    }
  };
  const canDownload =
    !busy && !dirty && model?.report.modelValidated && files.three;
  return (
    <>
      <header className="header">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-mark">✧</span> OUR NIGHT SKY
        </a>
        <span className="header-note">A moment, made tangible.</span>
        <a className="text-link" href="#print-guide">
          Printing guide <span>↗</span>
        </a>
      </header>
      <main>
        <section className="intro">
          <span className="eyebrow">YOUR SKY. YOUR STORY.</span>
          <h1>
            Some moments deserve
            <br />
            their own constellation.
          </h1>
          <p>
            Find the stars above a place and time. Make them into a keepsake
            <br className="desktop-break" /> you can hold — flat, personal, and
            made to print.
          </p>
        </section>
        <div className="workspace">
          <section className="controls" aria-label="Design your star map">
            <div className="section-title">
              <span className="step">01</span>
              <h2>Choose your moment</h2>
            </div>
            <label htmlFor="place">Location</label>
            <div className="location-search">
              <input
                id="place"
                value={query}
                placeholder="Search a city or town…"
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(false);
                  setSearchOpen(true);
                }}
                disabled={manual}
                autoComplete="off"
                aria-expanded={searchOpen && matches.length > 0}
                aria-controls="location-results"
              />
              {searchOpen && !manual && q.length >= 2 && (
                <div id="location-results" className="results">
                  {matches.map((c) => (
                    <button key={c[0]} onClick={() => selectCity(c)}>
                      <strong>{c[1]}</strong>
                      <small>
                        {regions[`${c[3]}.${c[4]}`] || c[4]},{" "}
                        {countries[c[3]] || c[3]}
                      </small>
                    </button>
                  ))}
                  {!matches.length && (
                    <p>
                      {cities.length
                        ? "No match. Try a city name, or enter coordinates."
                        : "Loading the bundled location list…"}
                    </p>
                  )}
                </div>
              )}
            </div>
            {cityError && <p className="inline-error">{cityError}</p>}
            <button
              className="small-link"
              onClick={() => {
                setManual(!manual);
                setSearchOpen(false);
                setZoneConfirmed(false);
                if (manual) setSelected(false);
              }}
            >
              {" "}
              {manual ? "← Use city search" : "Use precise coordinates →"}
            </button>
            {manual && (
              <div className="manual">
                <div className="form-row">
                  <div>
                    <label htmlFor="latitude">Latitude</label>
                    <input
                      id="latitude"
                      type="number"
                      min="-90"
                      max="90"
                      step="any"
                      value={s.latitude}
                      onChange={(e) => {
                        update("latitude", e.target.valueAsNumber);
                        setZoneConfirmed(false);
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor="longitude">Longitude</label>
                    <input
                      id="longitude"
                      type="number"
                      min="-180"
                      max="180"
                      step="any"
                      value={s.longitude}
                      onChange={(e) => {
                        update("longitude", e.target.valueAsNumber);
                        setZoneConfirmed(false);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
            <div className="form-row">
              <div>
                <label htmlFor="date">Date</label>
                <input
                  id="date"
                  type="date"
                  min="1900-01-01"
                  max="2100-12-31"
                  value={s.date}
                  onChange={(e) => {
                    update("date", e.target.value);
                    update("ambiguity", "");
                  }}
                />
              </div>
              <div>
                <label htmlFor="time">Local time</label>
                <input
                  id="time"
                  type="time"
                  value={s.time}
                  onChange={(e) => {
                    update("time", e.target.value);
                    update("ambiguity", "");
                  }}
                />
              </div>
            </div>
            <label htmlFor="zone">Timezone</label>
            <input
              id="zone"
              list="timezones"
              value={s.timezone}
              onChange={(e) => {
                update("timezone", e.target.value);
                update("ambiguity", "");
                setZoneConfirmed(false);
              }}
            />
            <datalist id="timezones">
              {timezoneNames().map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            {(!zoneConfirmed || manual) && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={zoneConfirmed}
                  onChange={(e) => setZoneConfirmed(e.target.checked)}
                />
                This timezone is correct for my location.
              </label>
            )}
            <p className="time-summary">{timeSummary}</p>
            <details className="advanced">
              <summary>Repeated clock time?</summary>
              <p>
                If clocks moved backwards, choose which occurrence you mean.
              </p>
              <select
                aria-label="Repeated time occurrence"
                value={s.ambiguity}
                onChange={(e) =>
                  update("ambiguity", e.target.value as Settings["ambiguity"])
                }
              >
                <option value="">Require an explicit choice</option>
                <option value="earlier">Earlier occurrence</option>
                <option value="later">Later occurrence</option>
              </select>
            </details>
            <div className="section-title second">
              <span className="step">02</span>
              <h2>Make it yours</h2>
            </div>
            <div className="occasion-picker">
              <label htmlFor="occasion">Start with an occasion</label>
              <select id="occasion" value={occasionId} disabled={busy}
                onChange={(e) => { setOccasionId(e.target.value); setOccasionNotice(""); }}>
                {OCCASIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <p className="occasion-description">{occasion.description}</p>
              <div className="occasion-preview" style={{ background: occasion.palette[0], color: occasion.palette[3] }}>
                <span aria-hidden="true" style={{ color: occasion.palette[1] }}>✦</span>
                <strong>{occasion.title}</strong>
                <div className="occasion-swatches" aria-label="Template colours">
                  {occasion.palette.map((colour, i) => <span key={i} style={{ background: colour }} title={`${["Background", "Stars", "Lines", "Lettering"][i]}: ${colour}`} />)}
                </div>
              </div>
              <p className="occasion-help">Applies a title and four colours. Keep your chosen place and time, then personalise below.</p>
              <button className="secondary occasion-apply" disabled={busy} onClick={() => {
                setS((current) => applyOccasion(current, occasion));
                setError("");
                setField("");
                setOccasionNotice(`${occasion.name} template applied. Update your star map to preview it.`);
              }}>Apply {occasion.name.toLowerCase()} template</button>
              <p className="occasion-status" role="status">{occasionNotice}</p>
            </div>
            <label htmlFor="title">
              Title <span>optional</span>
            </label>
            <input
              id="title"
              value={s.title}
              maxLength={40}
              onChange={(e) => update("title", e.target.value)}
              aria-invalid={field === "title"}
            />
            <label htmlFor="caption">Location caption</label>
            <input
              id="caption"
              value={s.location}
              maxLength={80}
              onChange={(e) => update("location", e.target.value)}
              aria-invalid={field === "location"}
            />
            <div className="toggles">
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.constellations}
                  onChange={(e) => update("constellations", e.target.checked)}
                />
                Constellation lines
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.caption}
                  onChange={(e) => update("caption", e.target.checked)}
                />
                Location, date & time
              </label>
            </div>
            <div className="range-label">
              <label htmlFor="density">Star density</label>
              <strong>{s.magnitude.toFixed(1)}</strong>
            </div>
            <input
              id="density"
              type="range"
              min="3"
              max="5.5"
              step="0.1"
              value={s.magnitude}
              onChange={(e) => update("magnitude", e.target.valueAsNumber)}
            />
            <div className="range-ends">
              <span>Quiet sky</span>
              <span>More stars</span>
            </div>
            <label>Four-colour palette</label>
            <div className="palette">
              {["Background", "Stars", "Lines", "Lettering"].map((label, i) => (
                <label key={label}>
                  <input
                    aria-label={`${label} colour`}
                    type="color"
                    value={s.palette[i]}
                    onChange={(e) => {
                      const p = [...s.palette] as Settings["palette"];
                      p[i] = e.target.value;
                      update("palette", p);
                    }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div className="range-label">
              <label htmlFor="thickness">Card thickness</label>
              <strong>{s.thickness.toFixed(1)} mm</strong>
            </div>
            <input
              id="thickness"
              type="range"
              min="4"
              max="8"
              step="0.2"
              value={s.thickness}
              onChange={(e) => update("thickness", e.target.valueAsNumber)}
            />
            <div className="range-ends">
              <span>4 mm</span>
              <span>8 mm</span>
            </div>
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary generate"
              disabled={busy}
              onClick={generate}
            >
              {busy
                ? "Creating your sky…"
                : dirty
                  ? "Update my star map"
                  : "Regenerate star map"}
              <span>✧</span>
            </button>
            {busy && (
              <button className="small-link" onClick={cancel}>
                Cancel generation
              </button>
            )}
            <div className="save-row">
              <button onClick={save}>Save design</button>
              <span>·</span>
              <button onClick={() => importRef.current?.click()}>
                Load design
              </button>
              <input
                ref={importRef}
                hidden
                type="file"
                accept=".json"
                onChange={(e) => {
                  load(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </section>
          <section className="preview-column" aria-label="Your card preview">
            <div className="preview-toolbar">
              <span>YOUR KEEPSAKE</span>
              <div className="segmented">
                <button
                  className={mode === "front" ? "active" : ""}
                  onClick={() => setMode("front")}
                >
                  Front
                </button>
                <button
                  className={mode === "3d" ? "active" : ""}
                  onClick={() => setMode("3d")}
                >
                  3D view
                </button>
              </div>
            </div>
            <div className={`preview-stage ${busy ? "is-working" : ""}`}>
              <div className="orbital-line one" />
              <div className="orbital-line two" />
              {model ? (
                mode === "front" ? (
                  <div className="card-wrap">
                    <Card model={model} />
                  </div>
                ) : (
                  <Suspense fallback={<p>Opening 3D view…</p>}>
                    <Preview3D model={model} />
                  </Suspense>
                )
              ) : (
                <div className="placeholder">
                  <span>✧</span>
                  <p>Your moment is becoming a map.</p>
                </div>
              )}
              <div className="preview-spec">
                <span>105 × 148 mm</span>
                <i>·</i>
                <span>
                  {model?.settings.thickness.toFixed(1) ||
                    s.thickness.toFixed(1)}{" "}
                  mm thick
                </span>
                <i>·</i>
                <span>Flush colour inlays</span>
              </div>
              {dirty && model && (
                <span className="dirty-badge">
                  Update to preview your changes
                </span>
              )}
            </div>
            <p className="preview-caption">
              {mode === "3d"
                ? "Drag to rotate · Scroll to zoom"
                : "Looking up: north at the top, east on the left."}
              <span aria-live="polite">
                {busy
                  ? phase
                  : dirty
                    ? "Changes are waiting to be generated."
                    : phase}
              </span>
            </p>
            <section className="download-panel">
              <div>
                <span className="eyebrow">FROM SKY TO SPOOL</span>
                <h2>Ready for your AMS.</h2>
                <p>A flat front. Up to four colours. One assembled card.</p>
              </div>
              <button
                className="primary"
                disabled={!canDownload}
                onClick={() =>
                  files.three &&
                  download(files.three, "our-night-sky.3mf", "model/3mf")
                }
              >
                Download 3MF <span>↓</span>
              </button>
              <button
                className="secondary"
                disabled={!canDownload}
                onClick={() =>
                  files.stl &&
                  download(
                    files.stl,
                    "our-night-sky-stl.zip",
                    "application/zip",
                  )
                }
              >
                STL colour parts
              </button>
            </section>
            {model && (
              <section className="validation-panel">
                <div className="validation-heading">
                  <h3>
                    {model.report.modelValidated
                      ? "✓ Model checks passed"
                      : "Review before printing"}
                  </h3>
                  <button
                    className="small-link"
                    onClick={() =>
                      download(
                        JSON.stringify(model.report, null, 2),
                        "validation-report.json",
                        "application/json",
                      )
                    }
                  >
                    Download report
                  </button>
                </div>
                <div className="metrics">
                  <div>
                    <strong>{model.report.stars}</strong>
                    <span>stars</span>
                  </div>
                  <div>
                    <strong>{model.report.colours} / 4</strong>
                    <span>colours</span>
                  </div>
                  <div>
                    <strong>
                      {(model.report.triangles / 1000).toFixed(1)}k
                    </strong>
                    <span>triangles</span>
                  </div>
                  <div>
                    <strong>
                      {model.report.bytes3mf
                        ? `${(model.report.bytes3mf / 1048576).toFixed(2)} MB`
                        : "—"}
                    </strong>
                    <span>3MF file</span>
                  </div>
                </div>
                {model.report.errors.length > 0 && (
                  <ul className="validation-errors">
                    {model.report.errors.map((e, i) => (
                      <li key={i}>{e.message}</li>
                    ))}
                  </ul>
                )}
                <details>
                  <summary>Print notes & validation details</summary>
                  <ul>
                    {model.report.warnings.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                  <p>
                    Native slice: pending for this file. Physical print: not
                    tested. Open the download in Bambu Studio, map your spools,
                    and inspect the sliced layers.
                  </p>
                  <p>
                    3MF limit: 5 MiB · triangle limit: 100,000 · no supports ·
                    0.6 mm colour inlays.
                  </p>
                </details>
              </section>
            )}
          </section>
        </div>
        <section className="guide" id="print-guide">
          <div>
            <span className="eyebrow">A LITTLE CARE, A LASTING KEEPSAKE</span>
            <h2>
              From download to
              <br />
              your first print.
            </h2>
            <p>
              Designed for a Bambu P1S, a 0.4 mm nozzle, PLA and one four-slot
              AMS.
            </p>
          </div>
          <ol>
            <li>
              <span>01</span>
              <div>
                <h3>Open as a project</h3>
                <p>
                  Use the 3MF in Bambu Studio. With STL, import all colour files
                  together as one object with multiple parts.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Match your four spools</h3>
                <p>
                  Assign the palette to the PLA in your AMS. The artwork faces
                  the plate; colours share the first three 0.2 mm layers.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Slice, inspect, then print</h3>
                <p>
                  Check stars, lettering, prime-tower placement and filament
                  assignments. Model validation does not replace native slicing
                  or a physical test.
                </p>
              </div>
            </li>
          </ol>
        </section>
        <aside className="mail-note">
          <strong>Sending it to someone?</strong>
          <p>
            Measure and weigh the packaged print. A rigid plastic card is not
            automatically eligible for letter postage.{" "}
            <a
              href="https://auspost.com.au/personal/sending/sending-guidelines/size-weight-guidelines"
              target="_blank"
              rel="noreferrer"
            >
              Check Australia Post guidance ↗
            </a>
          </p>
        </aside>
      </main>
      <footer>
        <div>
          <span className="brand-mark">✧</span>
          <strong>OUR NIGHT SKY</strong>
          <p>Calculated in your browser. Your moments stay with you.</p>
        </div>
        <div>
          <p>Stars: HYG 4.1 · Astronomy Engine · GeoNames</p>
          <a href={`${import.meta.env.BASE_URL}licenses/HYG.txt`}>
            Star catalogue licence
          </a>
          <a href={`${import.meta.env.BASE_URL}licenses/GeoNames.txt`}>
            Location data
          </a>
          <a href={`${import.meta.env.BASE_URL}licenses/d3-celestial.txt`}>
            Constellations
          </a>
          <a href={`${import.meta.env.BASE_URL}licenses/Noto.txt`}>Font</a>
        </div>
      </footer>
    </>
  );
}
