import { normalize } from "./model";
export class PdfClient {
  worker = new Worker(new URL("./pdf.worker.ts", import.meta.url), {
    type: "module",
  });
  seq = 0;
  pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void }
  >();
  constructor() {
    this.worker.onmessage = (e) => {
      const p = this.pending.get(e.data.id);
      if (p) {
        this.pending.delete(e.data.id);
        e.data.error ? p.reject(Error(e.data.error)) : p.resolve(e.data.result);
      }
    };
    this.worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(Error(e.message));
      this.pending.clear();
    };
  }
  call(type: string, args: any = {}) {
    return new Promise<any>((resolve, reject) => {
      const id = ++this.seq;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, args });
    });
  }
  async init() {
    await this.call("init", { base: new URL(".", location.href).href });
  }
  async open(bytes: Uint8Array, page = 0, password = "") {
    return normalize(await this.call("open", { bytes, page, password }), page);
  }
  async view(page: number) {
    return normalize(await this.call("view", { page }), page);
  }
}
export { normalize } from "./model";
