import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
await build({entryPoints:[fileURLToPath(new URL('../tests/capture-probe.ts',import.meta.url))],outfile:fileURLToPath(new URL('../output/capture-probe.js',import.meta.url)),bundle:true,format:'iife',target:'chrome157'});
