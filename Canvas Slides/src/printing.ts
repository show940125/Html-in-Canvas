import type {Deck} from './model';
import {sanitizeDeck} from './importer';
import {presentationCss} from './presentation';

const attr=(s:string)=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const style=(s:string)=>s.replace(/<\/style/gi,'<\\/style');

// One fixed viewport per page preserves vw/vh typography on every printed page.
// No player, timers, shaders or entry animations run in the print document.
export function exportPrintHtml(input:Deck){
 const deck=sanitizeDeck(input),slides=deck.slides.filter(s=>!s.hidden);
 if(!slides.length)throw new Error('至少保留一頁可列印的投影片。');
 const attrs=Object.entries({...deck.rootAttrs,style:deck.rootStyle||''}).map(([k,v])=>`${k}="${attr(v)}"`).join(' ');
 const css=deck.css+presentationCss+`
 html,body{margin:0!important;width:100vw!important;height:100vh!important;overflow:hidden!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}
 #deck{position:relative!important;display:block!important;inset:auto!important;width:100vw!important;height:100vh!important;transform:none!important}
 #deck>.slide{position:relative!important;width:100vw!important;height:100vh!important;min-height:0!important;transform:none!important;break-after:auto!important;page-break-after:auto!important}
 [data-anim]{opacity:1!important;visibility:visible!important;transform:none!important;translate:none!important}
 *,*::before,*::after{animation:none!important;transition:none!important;box-sizing:border-box}
 #nav,#hint,#overview,#ppt-presenter{display:none!important}
 `;
 const pages=slides.map(slide=>{
  const source=`<!doctype html><html ${attrs}><head><meta charset="utf-8"><style>${style(css)}</style></head><body class="${attr(deck.bodyClass)}" style="${attr(deck.bodyStyle)}"><div id="deck">${slide.html}</div></body></html>`;
  return `<section class="cs-print-page"><iframe title="${attr(slide.note.title)}" srcdoc="${attr(source)}"></iframe></section>`;
 }).join('');
 return `<!doctype html><html><head><meta charset="utf-8"><title>${attr(deck.title)}</title><style>
 @page{size:${deck.width}px ${deck.height}px;margin:0}
 html,body{margin:0;padding:0;background:white;print-color-adjust:exact;-webkit-print-color-adjust:exact}
 .cs-print-page{width:${deck.width}px;height:${deck.height}px;overflow:hidden;break-after:page;page-break-after:always}
 .cs-print-page:last-child{break-after:auto;page-break-after:auto}
 iframe{display:block;border:0;width:${deck.width}px;height:${deck.height}px}
 </style></head><body>${pages}</body></html>`;
}

export async function waitForPrint(view:Window){
 await Promise.all([...view.document.querySelectorAll('iframe')].map(async frame=>{
  if(frame.contentDocument?.readyState!=='complete')await new Promise<void>((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('等待列印頁面載入逾時。')),20000);
   frame.addEventListener('load',()=>{clearTimeout(timer);resolve();},{once:true});
  });
  const doc=frame.contentDocument;
  if(!doc)throw new Error('無法讀取列印頁面。');
  await doc.fonts.ready;
  await Promise.all([...doc.images].map(image=>image.decode()));
  // CSS background images are also part of the exported visual content.
  const urls=new Set<string>();
  for(const node of doc.querySelectorAll('*')){
   const bg=frame.contentWindow!.getComputedStyle(node).backgroundImage;
   for(const match of bg.matchAll(/url\(["']?(data:[^"')]+)["']?\)/g))urls.add(match[1]);
  }
  await Promise.all([...urls].map(src=>new Promise<void>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve();img.onerror=()=>reject(new Error('列印背景圖載入失敗。'));img.src=src;})));
 }));
 await new Promise<void>(resolve=>view.requestAnimationFrame(()=>view.requestAnimationFrame(()=>resolve())));
 view.document.documentElement.dataset.csPrintReady='true';
}
