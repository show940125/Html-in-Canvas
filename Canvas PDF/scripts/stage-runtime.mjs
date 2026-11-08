import { readdir, cp, mkdir, readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
await mkdir(new URL("dist/ort/", root), { recursive: true });
for (const name of await readdir(
  new URL("node_modules/onnxruntime-web/dist/", root),
))
  if (/^ort-wasm-simd-threaded(?:\.jsep|\.asyncify)?\.(?:mjs|wasm)$/.test(name))
    await cp(
      new URL("node_modules/onnxruntime-web/dist/" + name, root),
      new URL("dist/ort/" + name, root),
    );
// ONNX Runtime 1.30 JSEP's generated emval method-caller uses dynamic compilation.
// Replace only that factory with its equivalent closure; keep MV3's normal CSP.
const path = new URL("dist/ort/ort-wasm-simd-threaded.jsep.mjs", root);
let code = await readFile(path, "utf8");
const start = code.indexOf("function Pb(a,b,d){var [c,...e]=Gf("),
  end = code.indexOf("function Rb(a,b)", start);
if (start < 0 || end < 0 || !code.slice(start, end).includes("new Function"))
  throw Error("Pinned ORT JSEP factory changed; review CSP adaptation");
const replacement =
  "function Pb(a,b,d){var types=Gf(a,b>>>0),ret=types[0],readers=types.slice(1).map(t=>t.Xc.bind(t)),wire=ret.Yc.bind(ret);var caller=function(handle,methodName,destructorsRef,args){var vals=readers.map((read,i)=>read(args+i*8)),target=V(handle),value;if(d===0)value=target(...vals);else if(d===1)value=target[Jf(methodName)](...vals);else if(d===2)value=Reflect.construct(target,vals);else value=vals[vals.length-1];return ret.Cd?undefined:Hf(wire,destructorsRef,value)};return Ff(caller)}";
code = code.slice(0, start) + replacement + code.slice(end);
await writeFile(path, code);

const asyncPath = new URL("dist/ort/ort-wasm-simd-threaded.asyncify.mjs", root);
let asyncCode = await readFile(asyncPath, "utf8");
const asyncStart = asyncCode.indexOf("function Pb(a,b,c){var [d,...e]=Vg("),
  asyncEnd = asyncCode.indexOf("function Rb(a,b)", asyncStart);
if (
  asyncStart < 0 ||
  asyncEnd < 0 ||
  !asyncCode.slice(asyncStart, asyncEnd).includes("new Function")
)
  throw Error("Pinned ORT asyncify factory changed; review CSP adaptation");
const asyncReplacement =
  "function Pb(a,b,c){var types=Vg(a,b>>>0),ret=types[0],readers=types.slice(1).map(t=>t.bd.bind(t)),wire=ret.cd.bind(ret);return Ug(function(handle,methodName,destructorsRef,args){var vals=readers.map((read,i)=>read(args+i*8)),target=R(handle),value;if(c===0)value=target(...vals);else if(c===1)value=target[Yg(methodName)](...vals);else if(c===2)value=Reflect.construct(target,vals);else value=vals[vals.length-1];return ret.we?undefined:Wg(wire,destructorsRef,value)})}";
await writeFile(
  asyncPath,
  asyncCode.slice(0, asyncStart) + asyncReplacement + asyncCode.slice(asyncEnd),
);

for (const name of ["standard_fonts", "cmaps"])
  await cp(
    new URL("node_modules/pdfjs-dist/" + name, root),
    new URL("dist/" + name, root),
    { recursive: true },
  );
await cp(
  new URL("node_modules/pdfjs-dist/wasm/", root),
  new URL("dist/pdfjs/", root),
  { recursive: true },
);
