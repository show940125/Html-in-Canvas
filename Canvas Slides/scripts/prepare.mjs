import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
await mkdir('src/generated',{recursive:true});
await build({entryPoints:['src/playback.ts'],outfile:'src/generated/playback.js',bundle:true,format:'iife',target:'chrome156',minify:true,legalComments:'eof'});
