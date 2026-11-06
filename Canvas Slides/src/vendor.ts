import data from './vendor/guizang.json';
import type {Layout,VendorTemplate,Deck,Family} from './model';
import {newId,emptyNote} from './model';
export const layouts=data.layouts as Layout[];
export const templates=data.templates as unknown as Record<string,VendorTemplate>;
export function template(family:Family,presenter=false){return templates[family==='magazine'?(presenter?'magazinePresenter':'magazine'):(presenter?'swissPresenter':'swiss')];}
export function fromLayout(layout:Layout){const id=newId();const doc=new DOMParser().parseFromString(layout.html,'text/html');const el=doc.querySelector('section')!;el.dataset.slideId=id;
 for(const image of el.querySelectorAll('img'))image.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="840" height="400"><rect width="840" height="400" fill="#e6e9e9"/><circle cx="350" cy="170" r="75" fill="#b4c4bd"/><path d="M100 340l190-180 155 140 120-90 175 130" fill="#748e80"/></svg>');
 return{id,html:el.outerHTML,note:emptyNote(layout.title),hidden:false};}
export function createDeck(family:'swiss'|'magazine'='swiss'):Deck {
 const t=template(family),first=fromLayout(layouts.find(x=>x.family===family)!);
 if(family==='swiss'){const doc=new DOMParser().parseFromString(first.html,'text/html');const title=doc.querySelector('h1');if(title){title.textContent='讓想法\n形成方向';(title as HTMLElement).style.whiteSpace='pre-line';(title as HTMLElement).style.fontSize='min(7vw,12vh)';}for(const e of doc.querySelectorAll('p,.t-cat,.t-meta,.kicker,.chrome-min span,.chrome-min div,.footnote'))if(e.textContent?.includes('[必填]'))e.textContent=e.classList.contains('t-cat')?'YOUR NEXT PRESENTATION':'雙擊文字開始編輯 · 讓內容成為你的作品';first.html=doc.querySelector('section')!.outerHTML;}
 first.note=emptyNote('讓想法形成方向');
 return {schema:1,id:newId(),title:'未命名簡報',family,width:1280,height:720,css:t.css,rootAttrs:t.rootAttrs,bodyClass:t.bodyClass,bodyStyle:'',slides:[first],original:'',warnings:[],updated:Date.now()};
}
