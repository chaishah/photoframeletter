import { gunzipSync, strFromU8 } from "fflate";
export function decodeJson(bytes: Uint8Array): unknown {
  // Some hosts set Content-Encoding: gzip; browsers already decode that body.
  // Others serve .gz as an opaque file. Accept both without double decompression.
  const decoded =
    bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  return JSON.parse(strFromU8(decoded));
}
