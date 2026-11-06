import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {zipSync,strToU8} from 'fflate';
import {createHash} from 'node:crypto';
const entries={};async function walk(path,base=''){for(const e of await readdir(path,{withFileTypes:true})){const relative=base+e.name;if(e.isDirectory())await walk(`${path}/${e.name}`,relative+'/');else entries[relative]=new Uint8Array(await readFile(`${path}/${e.name}`));}}await walk('dist');
for(const name of ['GUIDE.html','README.md','ACCEPTANCE.md','SOURCES.md','TECHNICAL.md'])entries[name]=new Uint8Array(await readFile(name));
const version=JSON.parse(await readFile('package.json','utf8')).version;await mkdir('release',{recursive:true});const name=`Canvas-Slides-v${version}-preview.zip`,bytes=zipSync(entries,{level:6});await writeFile(`release/${name}`,bytes);const sha256=createHash('sha256').update(bytes).digest('hex');await writeFile(`release/${name}.sha256`,`${sha256}  ${name}\n`);console.log(JSON.stringify({file:`release/${name}`,sha256,files:Object.keys(entries).length,bytes:bytes.length}));
