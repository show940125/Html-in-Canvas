import {build} from 'esbuild';
import {mkdir,cp,copyFile,writeFile,readFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
await mkdir('dist',{recursive:true});
for(const name of ['content','popup','demo']) await build({entryPoints:[`src/${name}.ts`],outfile:`dist/${name}.js`,bundle:true,format:'iife',target:'chrome157'});
await build({entryPoints:['src/background.ts'],outfile:'dist/background.js',bundle:true,format:'esm',target:'chrome157'});
await cp('public','dist',{recursive:true});
await copyFile('../LICENSE','dist/LICENSE');
await copyFile('../NOTICE','dist/NOTICE');
await copyFile('README.md','dist/README.md');
function chunk(type,data){const body=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;for(const byte of body){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,body,tail]);}
await mkdir('dist/icons',{recursive:true});
for(const size of [16,48,128]){const raw=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const u=x/size,v=y/size;const head=Math.hypot(u-.55,v-.25)<.1;const body=Math.abs(u-(.56-(v-.4)*.35))<.055&&v>.35&&v<.65;const limb=(Math.abs(v-(.38+u*.5))<.045&&u>.2&&u<.7)||(Math.abs(v-(1.0-u*.55))<.045&&u>.3&&u<.8);raw.set(head||body||limb?[226,246,157,255]:[19,24,24,255],y*(size*4+1)+1+x*4);}const ih=Buffer.alloc(13);ih.writeUInt32BE(size);ih.writeUInt32BE(size,4);ih[8]=8;ih[9]=6;await writeFile(`dist/icons/${size}.png`,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
// The preview has no CDN, eval, API key or build-time asset downloads.
const css=await readFile('dist/demo.css','utf8'),js=await readFile('dist/demo.js','utf8');
const embedded={};
for(const name of ['human-run','godzilla-stomp','destruction'])embedded[name]={data:JSON.parse(await readFile(`dist/assets/${name}.json`,'utf8')),image:'data:image/png;base64,'+(await readFile(`dist/assets/${name}.png`)).toString('base64')};
const previewJS=`window.runawayAssets=${JSON.stringify(embedded)};\n${js}`;
const demo=(await readFile('dist/demo.html','utf8')).replace('<link rel="stylesheet" href="demo.css">',()=>`<style>${css}</style>`).replace('<script src="demo.js"></script>',()=>`<script>${previewJS.replaceAll('</script','<\\/script')}</script>`);
await writeFile('失控-本機預覽.html',demo);
console.log('Canvas Runaway v0.2.0 → dist + 失控-本機預覽.html');
