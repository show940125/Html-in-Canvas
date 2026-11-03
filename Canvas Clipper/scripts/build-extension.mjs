import { build } from 'esbuild';
import { mkdir, writeFile, copyFile, readFile, readdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
await build({ entryPoints: ['src/background.ts'], outfile: 'dist/background.js', bundle: true, format: 'esm', target: 'chrome156' });
await build({ entryPoints: ['src/extract.ts'], outfile: 'dist/extract.js', bundle: true, format: 'iife', target: 'chrome156' });
await build({ entryPoints: ['src/selection.ts'], outfile: 'dist/selection.js', bundle: true, format: 'iife', target: 'chrome156' });
await build({ entryPoints: ['../examples/runtime.ts'], outfile: '../examples/runtime.js', bundle: true, format: 'esm', target: 'chrome156' });
await copyFile('GUIDE.html', 'dist/start.html');
await copyFile('../LICENSE', 'dist/LICENSE');
await copyFile('../NOTICE', 'dist/NOTICE');
await copyFile('../THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.md');
await mkdir('dist/licenses', { recursive:true });
// Include every installed runtime dependency, including editor transitive packages.
const seen = new Set();
async function license(dependency) {
  if (seen.has(dependency)) return;
  seen.add(dependency);
  const base = `node_modules/${dependency}`;
  const metadata = JSON.parse(await readFile(`${base}/package.json`, 'utf8'));
  const names = await readdir(base);
  const licenseFile = names.find(name => /^licen[cs]e(?:\.(?:md|txt))?$/i.test(name));
  if (!licenseFile) throw new Error(`Missing license for runtime package ${dependency}`);
  const label = dependency.replaceAll('/', '-');
  await copyFile(`${base}/${licenseFile}`, `dist/licenses/${label}.txt`);
  await writeFile(`dist/licenses/${label}.json`, JSON.stringify({ name:dependency, version:metadata.version, license:metadata.license },null,2));
  for (const child of Object.keys(metadata.dependencies || {})) await license(child);
}
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
for (const dependency of Object.keys(packageJson.dependencies)) await license(dependency);
// Small original geometric icon; no remote assets or runtime downloads.
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) { crc ^= byte; for (let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
  const head=Buffer.alloc(4), tail=Buffer.alloc(4); head.writeUInt32BE(data.length); tail.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([head,body,tail]);
}
await mkdir('dist/icons', { recursive:true });
for (const size of [16,48,128]) {
  const raw=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const u=x/size,v=y/size;
    const sheet=u>.23&&u<.77&&v>.17&&v<.83;
    const rule=sheet&&u>.34&&u<.66&&((v>.35&&v<.40)||(v>.49&&v<.54)||(v>.63&&v<.68));
    const c=rule?[32,77,65]:sheet?[247,244,231]:[32,77,65];
    const at=y*(size*4+1)+1+x*4; raw.set([...c,255],at);
  }
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  await writeFile(`dist/icons/${size}.png`,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
