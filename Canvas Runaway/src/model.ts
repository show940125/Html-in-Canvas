export interface Block {
  x: number; y: number; w: number; h: number;
  text: string; color: string; font: string; size: number; kind: 'text' | 'image';
}
export interface Capture {
  version: 1; width: number; height: number; dpr: number;
  url: string; title: string; background: string; blocks: Block[];
  screenshot: string; clean: string; capturedAt: string;
}
export type Ending = 'empty' | 'target';
export interface RunOptions { ending: Ending; target?: Capture; duration?: number; }
export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export function safeUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 8192) throw new Error('請使用一般 HTTP／HTTPS 網址。');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('請使用一般 HTTP／HTTPS 網址。');
  return url.href;
}
/** Stored snapshots are untrusted: bound both memory use and rendering inputs. */
export function validateCapture(value: unknown): Capture {
  if (!value || typeof value !== 'object') throw new Error('終點快照無效。');
  const c = value as Capture;
  const num = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  if (c.version !== 1 || !num(c.width, 1, 10000) || !num(c.height, 1, 10000) || !num(c.dpr, .1, 8) || !Array.isArray(c.blocks) || c.blocks.length > 160) throw new Error('快照尺寸或區塊無效。');
  safeUrl(c.url);
  if (typeof c.title !== 'string' || c.title.length > 1000 || typeof c.background !== 'string' || c.background.length > 100 || typeof c.capturedAt !== 'string') throw new Error('快照內容無效。');
  for (const image of [c.screenshot, c.clean]) if (typeof image !== 'string' || image.length > 5_500_000 || !image.startsWith('data:image/png;base64,')) throw new Error('快照圖片無效或過大。');
  for (const b of c.blocks) {
    if (!b || !num(b.x, -10000, 10000) || !num(b.y, -10000, 10000) || !num(b.w, 1, 10000) || !num(b.h, 1, 10000) || !num(b.size, 1, 500) || !['text', 'image'].includes(b.kind)) throw new Error('快照區塊無效。');
    if (typeof b.text !== 'string' || b.text.length > 5000 || typeof b.font !== 'string' || b.font.length > 500 || typeof b.color !== 'string' || b.color.length > 100) throw new Error('區塊文字無效。');
  }
  return c;
}
export function phaseAt(seconds: number, duration = 15): string {
  const t = seconds / duration;
  return t < .12 ? '察覺異常' : t < .36 ? '正在成形' : t < .78 ? '全員逃難' : t < 1 ? '最後離場' : '演出結束';
}
export interface BlockGroup {block:Block;regions:Block[];}
/** Capture coverage and actor count are separate: every detected region belongs
 * to a nearby actor, so small posts/comments do not disappear at the 16-actor cap. */
export function groupBlocks(blocks:Block[],width:number,height:number):BlockGroup[]{
  const images=blocks.filter(b=>b.kind==='image').sort((a,b)=>b.w*b.h-a.w*a.h).slice(0,4),text=blocks.filter(b=>!images.includes(b));
  const slots=16-images.length,columns=4,rows=Math.ceil(slots/columns),buckets=new Map<number,Block[]>();
  for(const b of text){const cell=Math.min(slots-1,Math.floor(clamp((b.y+b.h/2)/height)*rows)*columns+Math.min(columns-1,Math.floor(clamp((b.x+b.w/2)/width)*columns)));const bucket=buckets.get(cell)||[];bucket.push(b);buckets.set(cell,bucket);}
  return [...images.map(b=>[b]),...[...buckets.values()]].map(regions=>{
    const x=Math.min(...regions.map(b=>b.x)),y=Math.min(...regions.map(b=>b.y)),right=Math.max(...regions.map(b=>b.x+b.w)),bottom=Math.max(...regions.map(b=>b.y+b.h));
    const first=regions.find(b=>b.kind==='text')||regions[0];
    return {regions,block:{...first,x,y,w:right-x,h:bottom-y,text:regions.map(b=>b.text).filter(Boolean).join('\n\n').slice(0,5000)}};
  });
}
