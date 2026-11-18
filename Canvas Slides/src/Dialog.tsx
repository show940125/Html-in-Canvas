import {useLayoutEffect,useRef,type ReactNode} from 'react';
import {Icon} from './icons';

export function Dialog({title,wide,busy,onClose,children}:{
 title:string;wide?:boolean;busy?:boolean;onClose:()=>void;children:ReactNode;
}){
 const ref=useRef<HTMLDialogElement>(null);
 useLayoutEffect(()=>{
  const node=ref.current!;
  const trigger=document.activeElement as HTMLElement|null;
  node.showModal();
  return()=>{
   node.close();
   if(trigger?.isConnected)trigger.focus();
  };
 },[]);
 useLayoutEffect(()=>ref.current?.querySelector<HTMLElement>('h1')?.focus(),[title]);
 return <dialog ref={ref} className={'modal '+(wide?'large':'')} aria-labelledby="dialog-title"
  onCancel={event=>{event.preventDefault();if(!busy)onClose();}}
  onKeyDown={event=>{
   if(event.key!=='Tab')return;
   const controls=[...event.currentTarget.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],summary,[tabindex="0"]')].filter(el=>{
    const closed=el.closest('details:not([open])');
    return el.tabIndex>=0&&!el.matches(':disabled')&&el.getClientRects().length>0
     &&(!closed||closed.querySelector(':scope > summary')?.contains(el));
   });
   if(!controls.length)return;
   const first=controls[0],last=controls[controls.length-1],active=document.activeElement;
   if(event.shiftKey&&(active===first||!controls.includes(active as HTMLElement))){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&(active===last||!controls.includes(active as HTMLElement))){event.preventDefault();first.focus();}
  }}>
  <header className="modal-heading">
   <h1 id="dialog-title" tabIndex={-1}>{title}</h1>
   <button type="button" onClick={onClose} aria-label="關閉對話框" disabled={busy}><Icon name="close"/></button>
  </header>
  {children}
 </dialog>;
}
