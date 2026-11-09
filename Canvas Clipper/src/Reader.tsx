import { useEffect,useRef,useState } from 'react';
import { InteractiveSurface } from './InteractiveSurface';
import { RichContent,RichEditor } from './RichContent';
import { docText,sourceLabel,type Clip,type Project,type RichDoc } from './model';
import type {DrawableCanvas} from '../../shared/html-in-canvas/canvas';
interface Props{project:Project;ids:string[];origin?:DOMRect;forceDOM:boolean;motion?:boolean;onClose:()=>void;onCard:(id:string,fields:Partial<Clip>)=>void;onBook?:(id:string)=>void;}
export function Reader({project,ids,origin,forceDOM,motion=true,onClose,onCard,onBook}:Props){
  const dialog=useRef<HTMLDialogElement>(null),panel=useRef<HTMLDivElement>(null);
  const[selected,setSelected]=useState(ids),[editing,setEditing]=useState(false),[original,setOriginal]=useState(false);
  const animation=useRef<Animation|undefined>(undefined);
  const frames=useRef<Keyframe[]|undefined>(undefined);
  useEffect(()=>{
    const d=dialog.current,p=panel.current;if(!d||!p)return;d.showModal();
    let disposed=false,frame=0;const listeners:Array<()=>void>=[];
    p.inert=true;p.dataset.transition='opening';p.setAttribute('aria-busy','true');
    const ready=()=>{if(!disposed){p.inert=false;p.dataset.transition='idle';p.removeAttribute('aria-busy');}};
    // A compositor transform does not resize the Canvas. Repaint after the
    // animation settles so native hit geometry uses the final dialog origin.
    const refreshGeometry=()=>{frame=requestAnimationFrame(()=>{
      const canvases=Array.from(p.querySelectorAll<DrawableCanvas>('canvas')).filter(c=>typeof c.requestPaint==='function');let pending=canvases.length;
      if(!pending){ready();return;}
      for(const canvas of canvases){const painted=()=>{if(!--pending)ready();};canvas.addEventListener('paint',painted,{once:true});listeners.push(()=>canvas.removeEventListener('paint',painted));canvas.requestPaint();}
    });};
    if(motion&&origin&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const r=p.getBoundingClientRect();const start=`translate(${origin.x-r.x}px,${origin.y-r.y}px) scale(${origin.width/r.width},${origin.height/r.height})`;frames.current=[{transform:start,opacity:.5},{transform:'none',opacity:1}];animation.current=p.animate(frames.current,{duration:300,easing:'cubic-bezier(.2,.8,.2,1)'});void animation.current.finished.then(refreshGeometry,()=>{});}else refreshGeometry();
    return()=>{disposed=true;cancelAnimationFrame(frame);listeners.forEach(remove=>remove());animation.current?.cancel();d.close();};
  },[]);
  function close(){const p=panel.current;if(p&&motion&&frames.current&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const a=p.animate([...frames.current].reverse(),{duration:240,easing:'ease-in',fill:'forwards'});void a.finished.then(onClose,()=>onClose());}else onClose();}
  const cards=selected.map(id=>project.cards.find(c=>c.id===id)).filter((c):c is Clip=>!!c);
  function edit(id:string,doc:RichDoc){onCard(id,{editedDoc:doc,workingText:docText(doc)});}
  return <dialog className="reader-dialog" ref={dialog} onCancel={e=>{e.preventDefault();close();}} aria-label={ids.length===2?'雙篇比較':'全文閱讀'} onClick={e=>{if(e.target===e.currentTarget)close();}}>
    <div ref={panel} className={'reader-panel '+(ids.length===2?'compare':'')}><header className="reader-top"><div className="reader-title"><h2 title={ids.length===2?'比較 2 份材料':cards[0]?.title}>{ids.length===2?'比較 2 份材料':cards[0]?.title||'全文閱讀'}</h2></div><div className="reader-controls"><button onClick={()=>onBook?.(cards[0]?.id)}>以書本閱讀</button><button className={original?'active':''} aria-pressed={original} onClick={()=>{setOriginal(!original);setEditing(false);}}>{original?'回到編輯稿':'查看原文'}</button><button className={editing?'active':''} aria-pressed={editing} disabled={original} onClick={()=>setEditing(!editing)}>{editing?'完成編輯':'編輯圖文'}</button><button className="reader-close" aria-label="關閉閱讀" onClick={close}>×</button></div></header>
      <InteractiveSurface forceDOM={forceDOM} className="reader-surface"><div className="reading-columns">{cards.map((card,index)=><section key={card.id} className="reading-column"><div className="reading-column-tools">{ids.length===2?<select aria-label={`比較材料 ${index+1}`} value={card.id} onChange={e=>setSelected(previous=>previous.map((id,i)=>i===index?e.target.value:id))}>{project.cards.filter(c=>c.id===card.id||!selected.includes(c.id)).map(c=><option value={c.id} key={c.id}>{c.title}</option>)}</select>:<span>{sourceLabel(card.url)}</span>}<span>{original?'擷取原文':editing?'可編輯':'整理稿'}</span></div><div className="reading-scroll" tabIndex={0}><h1>{card.title}</h1>{editing?<RichEditor doc={card.editedDoc} onChange={doc=>edit(card.id,doc)} label={`全文編輯 ${index+1}`}/>:<RichContent doc={original?card.originalDoc:card.editedDoc}/>}<label className="reading-note">我的觀點與待查問題<textarea aria-label={`閱讀筆記 ${index+1}`} placeholder="讀到這裡，你想到什麼？" value={card.note} onChange={e=>onCard(card.id,{note:e.target.value})}/></label><footer className="reading-source">{card.url&&<a href={card.url} target="_blank" rel="noreferrer">回到來源 ↗</a>}<span>原文與整理稿分別保存</span></footer></div></section>)}</div></InteractiveSurface>
      <footer className="reader-bottom"><span>文字可選取 · 筆記自動保存</span><span>Esc 返回原位</span></footer>
    </div>
  </dialog>;
}
