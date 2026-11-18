import {clone,type Deck,type Slide} from './model';

const same=(a:unknown,b:unknown)=>a===b||JSON.stringify(a)===JSON.stringify(b);
export type Resolution='mine'|'saved';

export class SaveConflict extends Error {
 constructor(public readonly saved:Deck,public readonly fields:string[]){
  super('另一個分頁也修改了相同內容。');
 }
}

/** Reconcile changes against the exact version each editor opened. */
export function mergeDeck(base:Deck,mine:Deck,saved:Deck,resolution?:Resolution){
 const conflicts:string[]=[];
 function pick<T>(before:T,local:T,remote:T,label:string):T{
  if(same(local,before))return remote;
  if(same(remote,before)||same(local,remote))return local;
  conflicts.push(label);
  return resolution==='saved'?remote:local;
 }
 function fields<T extends object>(before:T,local:T,remote:T,label:string):T{
  const keys=[...new Set([...Object.keys(before),...Object.keys(local),...Object.keys(remote)])] as (keyof T)[];
  return Object.fromEntries(keys.map(key=>[key,pick(before[key],local[key],remote[key],label)]).filter(([,value])=>value!==undefined)) as T;
 }
 const {slides:baseSlides,updated:_b,rootAttrs:baseAttrs,...baseFields}=base;
 const {slides:mineSlides,updated:_m,rootAttrs:mineAttrs,...mineFields}=mine;
 const {slides:savedSlides,updated:_s,rootAttrs:savedAttrs,...savedFields}=saved;
 const byId=(slides:Slide[])=>new Map(slides.map(slide=>[slide.id,slide]));
 const initial=byId(baseSlides),local=byId(mineSlides),remote=byId(savedSlides);
 const combined=new Map<string,Slide>();
 for(const id of new Set([...initial.keys(),...local.keys(),...remote.keys()])){
  const before=initial.get(id),left=local.get(id),right=remote.get(id);
  const label=left?.note.title||right?.note.title||before?.note.title||'投影片';
  if(!before||!left||!right){
   const slide=pick(before,left,right,label);
   if(slide)combined.set(id,slide);
   continue;
  }
  combined.set(id,{
   id,
   html:pick(before.html,left.html,right.html,`「${label}」頁面內容`),
   hidden:pick(before.hidden,left.hidden,right.hidden,`「${label}」顯示狀態`),
   note:fields(before.note,left.note,right.note,`「${label}」講者備註`),
  });
 }
 // Only competing reorders conflict. Insertions are placed near their source neighbors.
 const common=new Set(baseSlides.filter(s=>local.has(s.id)&&remote.has(s.id)).map(s=>s.id));
 const commonOrder=(slides:Slide[])=>slides.map(s=>s.id).filter(id=>common.has(id));
 const order=pick(commonOrder(baseSlides),commonOrder(mineSlides),commonOrder(savedSlides),'投影片順序').filter(id=>combined.has(id));
 for(const source of [savedSlides,mineSlides]){
  source.forEach(({id},index)=>{
   if(!combined.has(id)||order.includes(id))return;
   const previous=source.slice(0,index).reverse().find(slide=>order.includes(slide.id));
   const next=source.slice(index+1).find(slide=>order.includes(slide.id));
   const at=previous?order.indexOf(previous.id)+1:next?order.indexOf(next.id):order.length;
   order.splice(at,0,id);
  });
 }
 const deck:Deck={
  ...fields(baseFields,mineFields,savedFields,'簡報設定'),
  rootAttrs:fields(baseAttrs,mineAttrs,savedAttrs,'簡報主題'),
  slides:order.map(id=>combined.get(id)!),
  updated:saved.updated,
 };
 if(!deck.slides.length||deck.slides.length>200){
  if(!resolution)throw new SaveConflict(saved,['投影片數量']);
  deck.slides=resolution==='mine'?mineSlides:savedSlides;
 }
 if(conflicts.length&&!resolution)throw new SaveConflict(saved,[...new Set(conflicts)]);
 return clone(deck);
}

export function playbackStart(deck:Deck,slideId?:string){
 const index=deck.slides.findIndex(s=>s.id===slideId);
 const forward=deck.slides.findIndex((s,i)=>i>=Math.max(index,0)&&!s.hidden);
 return forward>=0?deck.slides[forward].id:[...deck.slides].reverse().find(s=>!s.hidden)?.id;
}
