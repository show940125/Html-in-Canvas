import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {Icon} from './icons';
import './appearance.css';

const colors=[
 {id:'amber',label:'琥珀',chip:'#f2bd73'},
 {id:'indigo',label:'靛藍',chip:'#a4b9ff'},
 {id:'forest',label:'森林',chip:'#8ad8af'},
 {id:'berry',label:'莓紫',chip:'#e4a9d4'},
] as const;
type Color=typeof colors[number]['id'];
type Appearance={mode:'day'|'night';accent:Color};
const key='canvas-slides-appearance';
const defaults:Appearance={mode:'night',accent:'amber'};

function readAppearance():Appearance{
 try{
  const value=JSON.parse(localStorage.getItem(key)??'null');
  return {
   mode:value?.mode==='day'?'day':'night',
   accent:colors.find(color=>color.id===value?.accent)?.id??defaults.accent,
  };
 }catch{return defaults;}
}
function applyAppearance({mode,accent}:Appearance){
 document.documentElement.dataset.studioMode=mode;
 document.documentElement.dataset.studioAccent=accent;
}
applyAppearance(readAppearance());

/**
 * End-aligned, expanding panel adapted from Kokonut UI Morph Popover 1.0.0
 * by @dorianbaffier (MIT, licenses/kokonutui.txt).
 * https://kokonutui.com/r/morph-popover.json
 */
export function AppearanceControl(){
 const id=useId();
 const panel=useRef<HTMLDivElement>(null);
 const [appearance,setAppearance]=useState(readAppearance);
 const [expanded,setExpanded]=useState(false);

 useLayoutEffect(()=>applyAppearance(appearance),[appearance]);
 useEffect(()=>{
  function sync(event:StorageEvent){
   if(event.key===key||event.key===null)setAppearance(readAppearance());
  }
  window.addEventListener('storage',sync);
  return()=>window.removeEventListener('storage',sync);
 },[]);
 function change(next:Appearance){
  setAppearance(next);
  try{localStorage.setItem(key,JSON.stringify(next));}
  catch{/* Use the chosen appearance in this tab if storage is unavailable. */}
 }
 return <div className="appearance">
  <button className="appearance-trigger" type="button" aria-label="介面外觀" title="介面外觀"
   aria-expanded={expanded} popoverTarget={id} aria-controls={id}>
   <Icon name={appearance.mode==='day'?'sun':'moon'} size={17}/><span>外觀</span>
   <i className="appearance-dot" aria-hidden="true"/>
  </button>
  <div ref={panel} id={id} popover="auto" className="appearance-panel" role="group" aria-labelledby={id+'-title'}
   onToggle={event=>{
    const open=event.newState==='open';
    setExpanded(open);
    if(open)panel.current?.querySelector<HTMLInputElement>('.appearance-modes input:checked')?.focus();
   }}>
   <div className="appearance-title">
    <h2 id={id+'-title'}>介面外觀</h2>
    <button className="appearance-close" type="button" aria-label="關閉外觀" popoverTarget={id} popoverTargetAction="hide"><Icon name="close" size={15}/></button>
   </div>
   <fieldset>
    <legend>模式</legend>
    <div className="appearance-modes">
     <label><input type="radio" name={id+'-mode'} checked={appearance.mode==='day'} onChange={()=>change({...appearance,mode:'day'})}/><Icon name="sun" size={16}/>日間</label>
     <label><input type="radio" name={id+'-mode'} checked={appearance.mode==='night'} onChange={()=>change({...appearance,mode:'night'})}/><Icon name="moon" size={16}/>夜間</label>
    </div>
   </fieldset>
   <fieldset>
    <legend>介面配色</legend>
    <div className="appearance-colors">{colors.map(color=><label key={color.id}>
     <input type="radio" name={id+'-accent'} checked={appearance.accent===color.id} onChange={()=>change({...appearance,accent:color.id})}/>
     <span className="appearance-chip" style={{background:color.chip}} aria-hidden="true"><Icon name="check" size={14}/></span>{color.label}
    </label>)}</div>
   </fieldset>
  </div>
 </div>;
}
