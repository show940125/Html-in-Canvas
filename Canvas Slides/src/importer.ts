import DOMPurify from 'dompurify';
import {parse} from 'acorn';
import {unzipSync,strFromU8} from 'fflate';
import {emptyNote,newId,validateDeck,type Deck,type Note} from './model';
export const MAX_TOTAL=250*1024*1024;
const placeholder='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#e5e8ed"/><path d="M180 240l100-100 70 70 50-50 80 80" fill="none" stroke="#9ca5b3" stroke-width="8"/></svg>');
export function safePath(path:string){const value=path.replaceAll('\\','/');if(value.startsWith('/')||/^[a-z]:/i.test(value)||value.split('/').some(x=>x==='..'||x===''))throw new Error(`不接受的素材路徑：${path}`);return value;}
function literal(node:any):any {
 if(node.type==='Literal')return node.value;
 if(node.type==='ArrayExpression')return node.elements.map(literal);
 if(node.type==='ObjectExpression')return Object.fromEntries(node.properties.map((p:any)=>{if(p.type!=='Property'||p.computed||p.kind!=='init')throw new Error('dynamic');return[p.key.name??p.key.value,literal(p.value)];}));
 if(node.type==='UnaryExpression'&&node.operator==='-'&&node.argument.type==='Literal')return-node.argument.value;
 throw new Error('備註包含動態程式，未執行。');
}
export function readNotes(source:string):any[] {
 try{const ast:any=parse(source,{ecmaVersion:'latest',sourceType:'script'});for(const n of ast.body)if(n.type==='VariableDeclaration')for(const d of n.declarations)if(d.id.name==='SPEAKER_NOTES'&&d.init)return literal(d.init);}catch{/* Unknown code is never evaluated. */}return[];
}
export function safeHtml(html:string):string {
 return DOMPurify.sanitize(html,{USE_PROFILES:{html:true,svg:true,svgFilters:true},ADD_ATTR:['data-cs-id','data-slide-id','data-layout','data-anim','data-animate'],FORBID_TAGS:['script','iframe','object','embed','link','meta','base','form','foreignObject','animate','set','style'],FORBID_ATTR:['srcdoc','autofocus','formaction']});
}
function resolvePath(path:string,base:string){const parts=base.split('/').slice(0,-1);for(const p of path.split('/')){if(p==='..')parts.pop();else if(p!=='.'&&p)parts.push(p);}return parts.join('/');}
function mime(name:string){const ext=name.split('.').pop()?.toLowerCase();return ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',avif:'image/avif',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',ogg:'audio/ogg'} as Record<string,string>)[ext||''];}
function dataUrl(bytes:Uint8Array,type:string){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return`data:${type};base64,${btoa(binary)}`;}
export function normalizeCss(css:string,resolveUrl:(url:string)=>string){
 return css.replace(/@import\s+[^;]+;/gi,'').replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi,(_,a,b,c)=>`url("${resolveUrl((a??b??c??'').trim()).replaceAll('"','%22')}")`);
}
export function sanitizeDeck(deck:Deck):Deck {
 validateDeck(deck);
 const resolver=(url:string)=>url.startsWith('#')||/^data:(image|font|audio|video)\//i.test(url)?url:'';
 return {...deck,rootAttrs:Object.fromEntries(Object.entries(deck.rootAttrs).filter(([k,v])=>/^(lang|dir|class|data-[\w-]+)$/.test(k)&&typeof v==='string')),rootStyle:normalizeCss(typeof deck.rootStyle==='string'?deck.rootStyle:'',resolver),css:normalizeCss(deck.css,resolver),bodyStyle:normalizeCss(deck.bodyStyle,resolver),slides:deck.slides.map(s=>({...s,html:safeHtml(s.html)}))};
}
export function importHtml(source:string,files=new Map<string,Uint8Array>(),entry='index.html',selector?:string):Deck {
 if(source.length>16*1024*1024)throw new Error('HTML 超過 16 MiB。');
 const doc=new DOMParser().parseFromString(source,'text/html');const warnings:string[]=[];
 const resolveUrl=(url:string,base=entry):string=>{
   if(url.startsWith('#')||/^data:(image|font|audio|video)\//i.test(url))return url;
   if(!url)return'';
   const name=resolvePath(decodeURIComponent(url.split(/[?#]/)[0]),base),bytes=files.get(name),type=mime(name);
   if(bytes&&type)return dataUrl(bytes,type);
   warnings.push(`素材未納入：${url}`);return placeholder;
 };
 const notes=[...doc.scripts].flatMap(s=>readNotes(s.textContent||''));
 const scripted=[...doc.scripts].filter(s=>!s.type.includes('json')).length;
 let css=[...doc.querySelectorAll('style')].map(s=>normalizeCss(s.textContent||'',url=>resolveUrl(url))).join('\n');
 for(const link of doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')){
  const name=resolvePath(link.getAttribute('href')||'',entry);const bytes=files.get(name);
  if(bytes)css+='\n'+normalizeCss(strFromU8(bytes),url=>resolveUrl(url,name));else warnings.push(`外部樣式未納入：${link.getAttribute('href')}`);
 }
 let elements:Element[]=[];
 if(selector){try{elements=[...doc.querySelectorAll(selector)];}catch{throw new Error('頁面容器選擇器格式錯誤。');}if(!elements.length)throw new Error('找不到符合這個選擇器的頁面容器。');}
 else for(const sel of ['#deck > .slide','.reveal .slides > section','.slides > section','section.slide','.slide','body > section']){elements=[...doc.querySelectorAll(sel)];if(elements.length)break;}
 elements=elements.filter(el=>!elements.some(other=>other!==el&&other.contains(el)));
 if(!elements.length){elements=[doc.body];warnings.push('未辨識投影片，先以整個文件作為一頁；可指定頁面容器重新匯入。');}
 if(elements.length>200)throw new Error('簡報最多 200 頁。');
 const declaredFamily=doc.documentElement.getAttribute('data-family');
 const guizang=source.includes('GZ:EFFECTS')||source.includes('guizang')||source.includes('__playSlide');
 const family:Deck['family']=declaredFamily==='magazine'||declaredFamily==='swiss'?declaredFamily:guizang?(doc.querySelector('.slide .canvas-card')?'swiss':'magazine'):'generic';
 if(scripted&&family==='generic')warnings.push(`${scripted} 段腳本已停用；腳本生成的圖表或內容需要另外提供靜態版本。`);
 const ids=new Set<string>();
 const slides=elements.map((sourceEl,i)=>{
  const el=sourceEl===doc.body?doc.createElement('section'):sourceEl.cloneNode(true) as HTMLElement;
  if(sourceEl===doc.body)el.innerHTML=doc.body.innerHTML;
  el.classList.add('slide');let id=el.getAttribute('data-slide-id')||newId();if(ids.has(id))id=newId();ids.add(id);el.setAttribute('data-slide-id',id);
  const oldNote=notes.find(n=>n?.id===sourceEl.getAttribute('data-slide-id'));
  const note:Note={...emptyNote(el.querySelector('h1,h2,h3')?.textContent?.trim()||`投影片 ${i+1}`),...(oldNote&&typeof oldNote==='object'?oldNote:{})};
  note.title=String(note.title||'');note.purpose=String(note.purpose||'');note.transition=String(note.transition||'');note.talk=Array.isArray(note.talk)?note.talk.map(String):[];
  for(const image of el.querySelectorAll('img,video,audio,source')){for(const key of ['src','poster'])if(image.hasAttribute(key))image.setAttribute(key,resolveUrl(image.getAttribute(key)!));image.removeAttribute('srcset');}
  for(const node of [el,...el.querySelectorAll('[style]')])if(node.hasAttribute('style'))node.setAttribute('style',normalizeCss(node.getAttribute('style')!,url=>resolveUrl(url)));
  return{id,html:safeHtml(el.outerHTML),note,hidden:false};
 });
 const viewport=doc.querySelector('[data-cs-size]')?.getAttribute('data-cs-size')?.split('x').map(Number);
 return sanitizeDeck({schema:1,id:newId(),title:doc.title||entry.split('/').pop()?.replace(/\.html?$/i,'')||'匯入簡報',family,width:viewport?.[0]||1280,height:viewport?.[1]||720,css,rootAttrs:Object.fromEntries([...doc.documentElement.attributes].filter(a=>/^(lang|dir|class|data-[\w-]+)$/.test(a.name)).map(a=>[a.name,a.value])),rootStyle:normalizeCss(doc.documentElement.getAttribute('style')||'',url=>resolveUrl(url)),bodyClass:doc.body.className,bodyStyle:normalizeCss(doc.body.getAttribute('style')||'',url=>resolveUrl(url)),slides,original:source,warnings:[...new Set(warnings)],updated:Date.now()});
}
export function readZip(bytes:Uint8Array){let total=0;return unzipSync(bytes,{filter(file){safePath(file.name.replace(/\/$/,''));total+=file.originalSize;if(total>MAX_TOTAL||file.originalSize>64*1024*1024)throw new Error('ZIP 解壓後超過大小限制。');return!file.name.endsWith('/');}});}
export async function readFiles(files:File[]):Promise<{deck?:Deck;source?:string;files:Map<string,Uint8Array>;entry?:string;entries?:string[]}> {
 let total=0;const entries=new Map<string,Uint8Array>();
 for(const file of files){total+=file.size;if(total>MAX_TOTAL)throw new Error('匯入總量超過 250 MiB。');const bytes=new Uint8Array(await file.arrayBuffer());if(/\.zip$/i.test(file.name)){for(const [name,data]of Object.entries(readZip(bytes)))entries.set(name,data);}else entries.set(safePath((file as any).webkitRelativePath||file.name),bytes);}
 if(entries.has('project.json')){const deck=JSON.parse(strFromU8(entries.get('project.json')!));return{deck:sanitizeDeck(deck),files:entries};}
 const htmls=[...entries.keys()].filter(n=>/\.html?$/i.test(n));if(!htmls.length)throw new Error('找不到 HTML 或 project.json。');
 if([...entries.values()].reduce((n,v)=>n+v.byteLength,0)>MAX_TOTAL)throw new Error('匯入素材解壓總量超過 250 MiB。');
 const entry=htmls.find(n=>/(^|\/)index\.html?$/i.test(n))||htmls[0];return{source:strFromU8(entries.get(entry)!),files:entries,entry,entries:htmls};
}
