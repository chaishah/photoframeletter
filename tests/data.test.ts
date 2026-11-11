import { it, expect } from "vitest";
import { gzipSync, strToU8 } from "fflate";
import { decodeJson } from "../src/core/data";
it("reads compressed assets whether or not the host/browser decompresses them", () => {
  const value = [["Perth", -31.95, 115.86]],
    bytes = strToU8(JSON.stringify(value));
  expect(decodeJson(bytes)).toEqual(value);
  expect(decodeJson(gzipSync(bytes))).toEqual(value);
});
