import { defineConfig } from "vitest/config";
function cspOpenCv() {
  return {
    name: "opencv-static-embind",
    transform(code: string, id: string) {
      if (
        !id
          .replaceAll("\\", "/")
          .endsWith("@techstark/opencv-js/dist/opencv.js")
      )
        return;
      const named =
        /function createNamedFunction\(name,body\)\{.*?\}function extendError/s;
      const dyn =
        /function makeDynCaller\(dynCall\)\{.*?new Function\("dynCall","rawFunction",body\)\(dynCall,rawFunction\)\}/s;
      if (!named.test(code) || !dyn.test(code))
        throw Error("Pinned OpenCV embind shape changed; review CSP adapter");
      const craft =
        /function craftInvokerFunction\(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc\)\{.*?\}function heap32VectorToArray/s;
      if (!craft.test(code)) throw Error("Pinned OpenCV invoker shape changed");
      const staticCraft =
        'function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc){var method=argTypes[1]!==null&&classType!==null,stack=argTypes.slice(1).some(t=>t!==null&&t.destructorFunction===undefined);var fn=function(){if(arguments.length!==argTypes.length-2)throwBindingError(humanName+" argument count mismatch");var destructors=stack?[]:null,wired=[],types=[];try{if(method){wired.push(argTypes[1].toWireType(destructors,this));types.push(argTypes[1]);}for(var i=0;i<arguments.length;i++){wired.push(argTypes[i+2].toWireType(destructors,arguments[i]));types.push(argTypes[i+2]);}var result=cppInvokerFunc.apply(null,[cppTargetFunc].concat(wired));return argTypes[0].name==="void"?undefined:argTypes[0].fromWireType(result);}finally{if(stack)runDestructors(destructors);else for(var i=0;i<types.length;i++)if(types[i].destructorFunction!==null)types[i].destructorFunction(wired[i]);}};Object.defineProperty(fn,"length",{value:argTypes.length-2});return fn;}function heap32VectorToArray';
      const emval =
        /function __emval_get_method_caller\(argCount,argTypes\)\{.*?\}function __emval_get_property/s;
      if (!emval.test(code)) throw Error("Pinned OpenCV emval shape changed");
      code = code.replace(
        emval,
        "function __emval_get_method_caller(argCount,argTypes){var types=__emval_lookupTypes(argCount,argTypes),ret=types[0];return __emval_addMethodCaller(function(handle,name,destructors,args){var values=[],offset=0;for(var i=1;i<types.length;i++){values.push(types[i].readValueFromPointer(args+offset));offset+=types[i].argPackAdvance;}var rv;try{rv=handle[name].apply(handle,values);}finally{for(var i=1;i<types.length;i++)if(types[i].deleteObject)types[i].deleteObject(values[i-1]);}if(!ret.isVoid)return ret.toWireType(destructors,rv);});}function __emval_get_property",
      );
      return {
        code: code
          .replace(
            named,
            "function createNamedFunction(name,body){return function(){return body.apply(this,arguments)}}function extendError",
          )
          .replace(
            dyn,
            'function makeDynCaller(dynCall){var f=function(){return dynCall.apply(null,[rawFunction].concat(Array.prototype.slice.call(arguments)))};Object.defineProperty(f,"length",{value:signature.length-1});return f}',
          )
          .replace(craft, staticCraft),
        map: null,
      };
    },
  };
}
function backendImport() {
  return {
    name: "paddle-backend-import",
    transform(code: string, id: string) {
      if (
        !id
          .replaceAll("\\", "/")
          .endsWith("@paddleocr/paddleocr-js/dist/index.mjs")
      )
        return;
      code = code
        .replace(
          /const DEFAULT_MODEL_ASSETS = \{[\s\S]*?\n\};/,
          "const DEFAULT_MODEL_ASSETS = Object.freeze({});",
        )
        .replace(
          /const wasmCdnFallback = [^\n]+;/,
          'const wasmCdnFallback = {}; if(!ortOpts.wasmPaths) throw new Error("Canvas PDF requires local WASM assets");',
        );
      code = code.replace(
        "score: rec.score",
        "score: rec.score, detectionScore: detBoxes[boxIdx].score",
      );
      code = code.replace(
        /return \(\(\) => \{ const _w = new URL\("[^"]*worker-entry[^"]*", import.meta.url\); return new Worker\(_w, \{\s*type: "module"\s*\}\); \}\)\(\);/,
        'throw new Error("Canvas PDF uses its own MV3 OCR worker");',
      );
      code = code.replace(
        /const \[detModel, recModel\] = await Promise.all\(\[\s*(createDetModel\(\{[\s\S]*?\}\)),\s*(createRecModel\(\{[\s\S]*?\}\))\s*\]\);/,
        "const detModel = await $1; const recModel = await $2;",
      );
      return {
        code: code.replace(
          'ortModulePromise = import("onnxruntime-web")',
          'ortModulePromise = globalThis.__canvasOcrProvider === "webgpu" ? import("onnxruntime-web/webgpu") : import("onnxruntime-web/wasm")',
        ),
        map: null,
      };
    },
  };
}
export default defineConfig({
  base: "./",
  plugins: [cspOpenCv(), backendImport()],
  resolve: {
    conditions: [
      "onnxruntime-web-use-extern-wasm",
      "module",
      "browser",
      "development|production",
    ],
    dedupe: ["onnxruntime-web"],
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: { target: "chrome157", chunkSizeWarningLimit: 1800 },
  worker: { format: "es", plugins: () => [cspOpenCv(), backendImport()] },
  test: { include: ["tests/**/*.test.ts"] },
});
