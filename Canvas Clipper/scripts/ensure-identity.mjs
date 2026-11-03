import { readFile,writeFile } from 'node:fs/promises';
import { generateKeyPairSync,createHash } from 'node:crypto';
const manifest=JSON.parse(await readFile('public/manifest.json','utf8'));
if(!manifest.key){const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});manifest.key=publicKey.export({type:'spki',format:'der'}).toString('base64');}
manifest.version='0.2.0';
manifest.description='圖文摘錄、聚焦閱讀、並排比較、主題框、標籤、關係線與本機完整備份。';
manifest.optional_host_permissions=['https://*/*','http://*/*'];
manifest.content_security_policy.extension_pages="script-src 'self'; object-src 'none'; base-uri 'none'; img-src 'self' blob:;";
await writeFile('public/manifest.json',JSON.stringify(manifest,null,2)+'\n');
const hex=createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32);
const id=[...hex].map(c=>String.fromCharCode(97+parseInt(c,16))).join('');
await writeFile('extension-identity.json',JSON.stringify({id,key:manifest.key,legacyId:process.env.CLIPPER_LEGACY_ID||''},null,2));
console.log('Stable development ID: '+id);
