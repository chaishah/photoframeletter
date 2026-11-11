declare module "clipper2-wasm/dist/es/clipper2z.js" {
  import type { MainModule } from "clipper2-wasm/dist/clipper2z";
  export default function create(options?: {
    wasmBinary?: Uint8Array;
    locateFile?: (path: string) => string;
  }): Promise<MainModule>;
}
