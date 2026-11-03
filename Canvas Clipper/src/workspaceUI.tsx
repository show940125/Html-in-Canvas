import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {getPreference,setPreference} from './storage';
import {DEFAULT_APPEARANCE,PALETTES,isColor,contrastingText,readableAccent,type Appearance} from './appearance';
interface Panels{left:boolean;top:boolean;right:boolean;}
export function useWorkspaceUI(){
 const[panels,setPanels]=useState<Panels>({left:innerWidth>900,top:true,right:innerWidth>900}),[appearance,setAppearance]=useState<Appearance>(DEFAULT_APPEARANCE),[loaded,setLoaded]=useState(false),[systemDark,setSystemDark]=useState(matchMedia('(prefers-color-scheme: dark)').matches),[settings,setSettings]=useState(false);
 const previous=useRef<Panels|undefined>(undefined),narrow=useRef(innerWidth<=900);
 useEffect(()=>{const resize=()=>{const next=innerWidth<=900;if(next&&!narrow.current)setPanels(p=>({...p,left:false,right:false}));narrow.current=next;};window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 useEffect(()=>{void getPreference<{panels:Panels;appearance:Appearance}>('workspaceUI').then(value=>{if(value){if(value.panels)setPanels({...value.panels,...(innerWidth<=900?{left:false,right:false}:{})});if(value.appearance)setAppearance({...DEFAULT_APPEARANCE,...value.appearance,accent:isColor(value.appearance.accent)?value.appearance.accent:''});}setLoaded(true);});const media=matchMedia('(prefers-color-scheme: dark)'),changed=()=>setSystemDark(media.matches);media.addEventListener('change',changed);return()=>media.removeEventListener('change',changed);},[]);
 useEffect(()=>{if(loaded)void setPreference('workspaceUI',{panels,appearance});},[panels,appearance,loaded]);
 const toggle=(side:keyof Panels)=>setPanels(p=>({...p,[side]:!p[side],...(innerWidth<=900&&side!=='top'&&!p[side]?{[side==='left'?'right':'left']:false}:{})}));
 const focus=()=>{if(previous.current){setPanels(previous.current);previous.current=undefined;}else{previous.current={...panels};setPanels({left:false,top:false,right:false});}};
 const dark=appearance.scheme==='dark'||appearance.scheme==='system'&&systemDark;
 const accent=appearance.accent||PALETTES.find(p=>p.id===appearance.palette)?.accent||PALETTES[1].accent;
 const style={'--accent':accent,'--accent-ink':contrastingText(accent),'--pine':readableAccent(accent,dark),'--pine-deep':readableAccent(accent,dark)} as CSSProperties;
 return{panels,setPanels,toggle,focus,focused:!!previous.current,appearance,setAppearance,dark,style,settings,setSettings};
}
export function AppearanceDialog({value,onChange,onClose}:{value:Appearance;onChange:(v:Appearance)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 return <dialog ref={dialog} className="app-dialog appearance-dialog" aria-label="主題與介面" onCancel={onClose}><section className="modal"><button className="modal-close" aria-label="關閉主題設定" onClick={onClose}>×</button><p className="eyebrow">MAKE ROOM FOR YOUR THOUGHTS</p><h2>主題與介面</h2><div className="palette-options">{PALETTES.map(p=><button key={p.id} aria-pressed={value.palette===p.id} onClick={()=>onChange({...value,palette:p.id,accent:''})}><span style={{background:p.accent}}/>{p.name}</button>)}</div><label>明暗<select aria-label="明暗模式" value={value.scheme} onChange={e=>onChange({...value,scheme:e.target.value as Appearance['scheme']})}><option value="light">淺色</option><option value="dark">深色</option><option value="system">跟隨系統</option></select></label><label>自訂重點色<input aria-label="自訂重點色" type="color" value={value.accent||PALETTES.find(p=>p.id===value.palette)?.accent||'#356348'} onChange={e=>onChange({...value,accent:e.target.value})}/></label><label className="check-row"><input type="checkbox" checked={value.motion} onChange={e=>onChange({...value,motion:e.target.checked})}/>操作動效</label><label className="check-row"><input type="checkbox" checked={value.diagnostics} onChange={e=>onChange({...value,diagnostics:e.target.checked})}/>技術檢視：繪製、DOM 與命中幾何</label><p className="modal-hint">主題色作用於工作區；文章與主題框另有自己的樣式。列印使用清晰的淺色版面。</p><button className="button-primary" onClick={onClose}>完成</button></section></dialog>;
}
