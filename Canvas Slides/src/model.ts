export type Family = 'swiss' | 'magazine' | 'generic';
export type Note = { title: string; purpose: string; talk: string[]; transition: string; minutes?: number; [key: string]: unknown };
export interface Slide { id: string; html: string; note: Note; hidden: boolean }
export interface Deck {
  schema: 1; id: string; title: string; family: Family; width: number; height: number;
  css: string; rootAttrs: Record<string,string>; rootStyle?:string; bodyClass: string; bodyStyle: string;
  slides: Slide[]; original: string; warnings: string[]; updated: number;
}
export interface Layout { id: string; family: 'swiss'|'magazine'; title: string; html: string }
export interface VendorTemplate { css: string; bodyClass: string; rootAttrs: Record<string,string>; before: string; after: string; runtime: string[]; motion: string }
export type Bridge = { protocol: 'canvas-slides/1'; session: string; type: string; request?: string; payload?: any };
export const emptyNote = (title=''): Note => ({title,purpose:'',talk:[],transition:''});
export const newId = () => crypto.randomUUID();
export function clone<T>(value:T):T {return structuredClone(value);}
export function duplicateSlide(slide:Slide):Slide {
  const copy=clone(slide);copy.id=newId();
  copy.html=copy.html.replace(/data-cs-id="[^"]*"/g,()=>`data-cs-id="${newId()}"`).replace(/data-slide-id="[^"]*"/g,`data-slide-id="${copy.id}"`);
  return copy;
}
export class History {
  past: Deck[]=[]; future: Deck[]=[];
  push(deck:Deck){this.past.push(clone(deck));if(this.past.length>60)this.past.shift();this.future=[];}
  undo(current:Deck){const previous=this.past.pop();if(previous)this.future.push(clone(current));return previous;}
  redo(current:Deck){const next=this.future.pop();if(next)this.past.push(clone(current));return next;}
}
export function validateDeck(value:unknown):asserts value is Deck {
  const d=value as Deck;
  if(!d||d.schema!==1||typeof d.id!=='string'||typeof d.title!=='string'||!['swiss','magazine','generic'].includes(d.family)||!Number.isFinite(d.width)||!Number.isFinite(d.height)||d.width<320||d.width>4096||d.height<180||d.height>4096||typeof d.css!=='string'||!d.rootAttrs||typeof d.rootAttrs!=='object'||Array.isArray(d.rootAttrs)||typeof d.bodyClass!=='string'||typeof d.bodyStyle!=='string'||typeof d.original!=='string'||!Array.isArray(d.warnings)||!d.warnings.every(x=>typeof x==='string')||!Array.isArray(d.slides)||d.slides.length<1||d.slides.length>200)throw new Error('無效的 Canvas Slides 專案。');
  const ids=new Set<string>();
  for(const s of d.slides){if(!s||typeof s.id!=='string'||ids.has(s.id)||typeof s.html!=='string'||typeof s.hidden!=='boolean'||!s.note||typeof s.note.title!=='string'||typeof s.note.purpose!=='string'||typeof s.note.transition!=='string'||!Array.isArray(s.note.talk)||!s.note.talk.every(x=>typeof x==='string'))throw new Error('投影片或備註資料不完整。');ids.add(s.id);}
}
