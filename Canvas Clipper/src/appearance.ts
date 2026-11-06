export const FRAME_IDS=['rounded','cut','note','folder','bubble','hexagon'] as const;
export type FrameId=typeof FRAME_IDS[number];
export const FRAME_NAMES:Record<FrameId,string>={rounded:'圓角矩形',cut:'切角',note:'折角便箋',folder:'資料夾',bubble:'對話框',hexagon:'六角框'};
export const PALETTES=[{id:'paper',name:'紙白',accent:'#52616b'},{id:'forest',name:'森林',accent:'#356348'},{id:'ocean',name:'海藍',accent:'#27658a'},{id:'apricot',name:'暖杏',accent:'#935a30'},{id:'berry',name:'莓紫',accent:'#875477'},{id:'graphite',name:'石墨',accent:'#59616e'}] as const;
export interface Appearance{palette:string;scheme:'light'|'dark'|'system';accent:string;motion:boolean;diagnostics:boolean;fontSize:number;}
export const DEFAULT_APPEARANCE:Appearance={palette:'forest',scheme:'light',accent:'',motion:true,diagnostics:false,fontSize:17};
export function isColor(value:unknown):value is string{return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);}
export function isFrame(value:unknown):value is FrameId{return FRAME_IDS.includes(value as FrameId);}
export function luminance(hex:string){const values=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;}
export function contrastingText(color:string){if(!isColor(color))return'#263f33';const l=luminance(color);return l<=.179?'#ffffff':l<.39?'#000000':'#263f33';}
export function readableAccent(color:string,dark:boolean){const bg=dark?'#202723':'#f9faf5',target=dark?'#ffffff':'#163622',channels=(v:string)=>[1,3,5].map(i=>parseInt(v.slice(i,i+2),16));for(let step=0;step<=20;step++){const a=channels(color),b=channels(target),hex='#'+a.map((v,i)=>Math.round(v+(b[i]-v)*step/20).toString(16).padStart(2,'0')).join(''),x=luminance(hex),y=luminance(bg);if((Math.max(x,y)+.05)/(Math.min(x,y)+.05)>=4.5)return hex;}return target;}
export function framePath(frame:FrameId,w:number,h:number){const r=12,c=24;switch(frame){
case'cut':return`M${c} 1H${w-1}V${h-c}L${w-c} ${h-1}H1V${c}Z`;
case'note':return`M1 1H${w-c}L${w-1} ${c}V${h-1}H1Z M${w-c} 1V${c}H${w-1}`;
case'folder':return`M1 19V9Q1 1 9 1H${Math.min(150,w*.45)}L${Math.min(170,w*.5)} 19H${w-9}Q${w-1} 19 ${w-1} 27V${h-9}Q${w-1} ${h-1} ${w-9} ${h-1}H9Q1 ${h-1} 1 ${h-9}Z`;
case'bubble':return`M${r} 1H${w-r}Q${w-1} 1 ${w-1} ${r}V${h-28}Q${w-1} ${h-16} ${w-r} ${h-16}H60L35 ${h-1}V${h-16}H${r}Q1 ${h-16} 1 ${h-28}V${r}Q1 1 ${r} 1Z`;
case'hexagon':return`M28 1H${w-28}L${w-1} ${h/2}L${w-28} ${h-1}H28L1 ${h/2}Z`;
default:return`M${r} 1H${w-r}Q${w-1} 1 ${w-1} ${r}V${h-r}Q${w-1} ${h-1} ${w-r} ${h-1}H${r}Q1 ${h-1} 1 ${h-r}V${r}Q1 1 ${r} 1Z`;}}
export function frameInsets(frame:FrameId){return{left:frame==='hexagon'?34:16,right:frame==='hexagon'?34:16,top:frame==='folder'?30:14,bottom:frame==='bubble'?30:14};}
export function cardAppearance(card:{groupId?:string;frame?:FrameId;color?:string},groups:{id:string;cardFrame?:FrameId;cardColor?:string;color:string}[]){const group=groups.find(g=>g.id===card.groupId);return{frame:(card.frame||group?.cardFrame||'rounded') as FrameId,color:card.color||group?.cardColor||group?.color||'var(--card-paper, #fffef9)'};}
