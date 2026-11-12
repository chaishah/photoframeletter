import type { Settings } from "./types";

// Missing values reproduce older saved designs; new designs set explicit values.
export function printDetails(s: Settings) {
  return {
    inlayDepth: s.inlayDepth ?? 0.6,
    lineWidth: s.lineWidth ?? 0.65,
    starScale: s.starScale ?? 1,
  };
}
