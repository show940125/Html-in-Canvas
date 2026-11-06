import {build} from 'esbuild';
import {readFile,writeFile,copyFile,mkdir,readdir} from 'node:fs/promises';
await build({entryPoints:['src/stage.ts'],outfile:'dist/stage.js',bundle:true,format:'iife',target:'chrome156',minify:true,legalComments:'eof'});
await writeFile('dist/stage.html','<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>Canvas Slides 舞台</title><script src="stage.js"></script></html>');
await mkdir('dist/licenses',{recursive:true});
for(const name of ['LICENSE','NOTICE','THIRD_PARTY_NOTICES.md'])await copyFile(`../${name}`,`dist/${name}`);
const seen=new Set();async function license(name){
 if(seen.has(name))return;seen.add(name);const base=`node_modules/${name}`,pkg=JSON.parse(await readFile(`${base}/package.json`,'utf8')),names=await readdir(base),label=name.replaceAll('/','-');const file=names.find(n=>/^licen[cs]e(?:\.(md|txt))?$/i.test(n));
 if(file)await copyFile(`${base}/${file}`,`dist/licenses/${label}.txt`);
 else{
  // Some published MIT packages omit LICENSE but preserve the copyright header.
  const source=await readFile(`${base}/${pkg.module||pkg.main}`,'utf8');const copyright=source.slice(0,1000).match(/Copyright[^\n\r]+/i)?.[0];
  if(pkg.license!=='MIT'||!copyright)throw new Error(`Missing verifiable license attribution: ${name}`);
  const mit=await readFile('node_modules/react/LICENSE','utf8');const permission=mit.slice(mit.indexOf('Permission is hereby granted'));
  await writeFile(`dist/licenses/${label}.txt`,`MIT License\n\n${copyright}\n\n${permission}\n\nAttribution from distributed source header; MIT declaration from ${name}@${pkg.version} package.json.\n`);
 }
 await writeFile(`dist/licenses/${label}.json`,JSON.stringify({name,version:pkg.version,license:pkg.license,repository:pkg.repository},null,2));
 for(const child of Object.keys(pkg.dependencies||{}))await license(child);
}
const pkg=JSON.parse(await readFile('package.json','utf8'));for(const name of Object.keys(pkg.dependencies))await license(name);
async function normalize(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())await normalize(path);else if(/\.(html|js|json|css|md|txt)$/.test(entry.name)){const value=await readFile(path,'utf8');if(value.includes('\r'))await writeFile(path,value.replace(/\r\n?/g,'\n'));}}}await normalize('dist');
console.log('Built Canvas Slides extension, sandbox runtime and bundled licenses.');
