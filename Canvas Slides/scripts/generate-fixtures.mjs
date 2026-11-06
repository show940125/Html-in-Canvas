import {build} from 'esbuild';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body></body></html>');globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.DOMParser=dom.window.DOMParser;
await mkdir('output/playback',{recursive:true});
await build({entryPoints:['scripts/browser-fixtures.ts'],outfile:'output/playback/generate.cjs',bundle:true,platform:'node',format:'cjs',target:'node24',external:['jsdom'],plugins:[{name:'raw',setup(b){b.onResolve({filter:/\?raw$/},args=>({path:resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));}}]});
createRequire(import.meta.url)(resolve('output/playback/generate.cjs'));
