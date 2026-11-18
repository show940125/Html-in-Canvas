/**
 * Adapted from Kokonut UI Tool Dock v2.0.0 by @dorianbaffier.
 * https://kokonutui.com/r/toolbar.json · MIT, see licenses/kokonutui.txt.
 */
import {useLayoutEffect,useRef,useState,type KeyboardEvent,type ReactNode} from 'react';

export function ToolDock({children}:{children:ReactNode}){
 const dock=useRef<HTMLElement>(null);
 const [focus,setFocus]=useState<HTMLButtonElement|null>(null);
 const [plate,setPlate]=useState({x:0,y:0,width:0,height:0});
 useLayoutEffect(()=>{
  const root=dock.current!;
  const settle=()=>{
   const target=root.querySelector<HTMLButtonElement>('[data-dock-item][aria-expanded="true"]')||focus;
   if(!target?.isConnected){setPlate({x:0,y:0,width:0,height:0});return;}
   const base=root.getBoundingClientRect(),box=target.getBoundingClientRect();
   setPlate({x:box.left-base.left-root.clientLeft,y:box.top-base.top-root.clientTop,width:box.width,height:box.height});
  };
  const size=new ResizeObserver(settle);
  size.observe(root);
  const attributes=new MutationObserver(settle);
  attributes.observe(root,{subtree:true,attributes:true,attributeFilter:['aria-expanded','disabled']});
  settle();
  return()=>{size.disconnect();attributes.disconnect();};
 },[focus]);
 function move(event:KeyboardEvent<HTMLElement>){
  const target=event.target as HTMLButtonElement;
  if(!target.matches('[data-dock-item]'))return;
  const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-dock-item]:not(:disabled)'));
  const index=items.indexOf(target);
  if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
   event.preventDefault();
   const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowRight'?1:-1)+items.length)%items.length;
   items[next]?.focus();
  }
  // The arrow across the dock opens the flyout; arrows along it rove.
  if((event.key==='ArrowUp'||event.key==='ArrowDown')&&target.hasAttribute('aria-expanded')){
   event.preventDefault();
   if(target.getAttribute('aria-expanded')==='false')target.click();
   requestAnimationFrame(()=>target.parentElement?.querySelector<HTMLButtonElement>('.menu-panel button:not(:disabled)')?.focus());
  }
 }
 return <nav ref={dock} className="studio-dock" aria-label="編輯工具" onFocus={event=>{
  if((event.target as Element).matches('[data-dock-item]'))setFocus(event.target as HTMLButtonElement);
 }} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setFocus(null);}} onKeyDown={move}>
  <span aria-hidden="true" className="dock-plate" style={{width:plate.width,height:plate.height,transform:'translate('+plate.x+'px,'+plate.y+'px)',opacity:plate.width?1:0}}/>
  {children}
 </nav>;
}

export function DockHint({label,keys}:{label:string;keys?:string}){
 return <span className="dock-hint" aria-hidden="true">{label}{keys&&<kbd>{keys}</kbd>}</span>;
}

/**
 * Adapted from Kokonut UI Save Status v1.0.0 by @kokonutui.
 * https://kokonutui.com/r/save-status.json · MIT, see licenses/kokonutui.txt.
 */
function pillLook(phase:'saving'|'saved'|'failed'){
 switch(phase){
  case 'saved':return {key:'saved',label:'已存到此瀏覽器',path:'m3 8 3 3 7-7'};
  case 'saving':return {key:'saving',label:'正在保存…',path:'M13 8a5 5 0 1 1-5-5'};
  default:return {key:'failed',label:'儲存出現問題',path:'M8 4v5m0 3h.01M15 8a7 7 0 1 1-14 0 7 7 0 0 1 14 0'};
 }
}

export function SaveStatus({phase,message,children}:{phase:'saving'|'saved'|'failed';message?:string;children?:ReactNode}){
 const look=pillLook(phase);
 return <div className="studio-save" role={phase==='failed'?'alert':undefined}>
  <div className="save-pill" data-phase={phase} title={look.label} role={phase==='failed'?undefined:'status'}>
   <span key={look.key}><svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={look.path}/></svg>{look.label}</span>
  </div>
  {phase==='failed'&&<div className="studio-save-issue"><p>{message}</p>{children}</div>}
 </div>;
}
