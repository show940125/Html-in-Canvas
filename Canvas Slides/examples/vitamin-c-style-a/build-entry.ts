import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {zipSync,strToU8} from 'fflate';
import {createHash} from 'node:crypto';
import {template} from '../../src/vendor';
import {exportHtml} from '../../src/exporter';
import type {Deck} from '../../src/model';
const t=template('magazine'),notes=JSON.parse(readFileSync('notes.json','utf8'));
const doc=new DOMParser().parseFromString(readFileSync('slides.html','utf8'),'text/html');
const assets=['vitamin-c-fruits.png','everyday-plate.png'].map(name=>{const bytes=readFileSync(`images/${name}`);return{name,bytes,url:`data:image/png;base64,${bytes.toString('base64')}`};});
for(const img of doc.querySelectorAll('img')){const asset=assets.find(a=>img.getAttribute('src')===`images/${a.name}`);if(!asset)throw new Error('Missing image');img.setAttribute('src',asset.url);}
const slides=[...doc.querySelectorAll('section.slide')].map(el=>{const id=el.getAttribute('data-slide-id')!;return{id,html:el.outerHTML,note:notes.find((n:any)=>n.id===id),hidden:false};});
if(slides.length!==5||slides.some(s=>!s.note))throw new Error('Expected five slides with matching notes');
const deck:Deck={schema:1,id:'vitamin-c-style-a-five-slides',title:'維他命C的好處｜日常營養筆記',family:'magazine',width:1280,height:720,css:t.css+'\n'+readFileSync('deck.css','utf8'),rootAttrs:{...t.rootAttrs,lang:'zh-Hant','data-theme':'forest-ink'},bodyClass:t.bodyClass,bodyStyle:'',slides,original:readFileSync('slides.html','utf8'),warnings:[],updated:Date.now()};
const portable=exportHtml(deck);writeFileSync('維他命C的好處_風格A_五頁.html',portable);
let relative=portable;for(const asset of assets)relative=relative.replaceAll(asset.url,`images/${asset.name}`);writeFileSync('index.html',relative);
const entries:Record<string,Uint8Array>={'index.html':strToU8(relative),'README.md':strToU8(readFileSync('README.md','utf8')),'SOURCES.md':strToU8(readFileSync('SOURCES.md','utf8'))};for(const asset of assets)entries[`images/${asset.name}`]=asset.bytes;
const zip=zipSync(entries,{level:6});writeFileSync('維他命C_風格A_在線編輯測試.zip',zip);
writeFileSync('asset-manifest.json',JSON.stringify({theme:'forest-ink',family:'magazine',slides:slides.map(s=>({id:s.id,layout:new DOMParser().parseFromString(s.html,'text/html').querySelector('section')!.getAttribute('data-layout'),title:s.note.title})),images:assets.map(a=>({path:`images/${a.name}`,bytes:a.bytes.length,sha256:createHash('sha256').update(a.bytes).digest('hex'),source:'OpenAI image generation; food illustration only'})),zipSha256:createHash('sha256').update(zip).digest('hex')},null,2));
console.log(JSON.stringify({slides:slides.length,portableBytes:Buffer.byteLength(portable),zipBytes:zip.length,images:assets.length}));
