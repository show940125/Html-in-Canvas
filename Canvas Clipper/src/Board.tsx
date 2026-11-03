import { Fragment,useEffect,useLayoutEffect,useRef,useState,type PointerEvent as PEvent } from 'react';
import { prepareCanvas,supportsCanvas,syncGeometry,type DrawableCanvas,type DrawableContext } from '../../shared/html-in-canvas/canvas';
import { sourceLabel,walkImages,type Clip,type Group,type Project } from './model';
import { useAssetUrl } from './assets';
export const CARD_W=308,CARD_H=374;
interface Position{id:string;x:number;y:number;}
interface Props{
  project:Project;selectedIds:string[];activeTags:string[];forceDOM:boolean;
  onSelect:(id:string,multi?:boolean)=>void;onOpen:(id:string)=>void;
  onCard:(id:string,fields:Partial<Clip>)=>void;onView:(view:Project['view'])=>void;
  onMove:(cards:Position[],groups:Position[],assignments:{id:string;groupId?:string}[])=>void;
  onGroup:(id:string,fields:Partial<Group>)=>void;onLink:(from:string,to:string)=>void;
  onRelationSelect:(id:string)=>void;onMode:(mode:string)=>void;
}
interface Drag{kind:'cards'|'group'|'pan'|'link';px:number;py:number;cards:Position[];groups:Position[];from?:string;view:Project['view'];}
interface Motion{cards:Position[];groups:Position[];link?:{from:string;x:number;y:number};}
function CardThumbnail({card}:{card:Clip}){const image=walkImages(card.editedDoc)[0],url=useAssetUrl(image?.attrs?.assetId);return url?<img className="card-thumbnail" src={url} alt={String(image?.attrs?.alt||'文章圖片')}/>:image?<div className="card-image-pending">▧ 圖片待載入</div>:null;}
export function Board(props:Props){
  const{project,selectedIds,activeTags,forceDOM,onSelect,onOpen,onCard,onView,onMove,onGroup,onLink,onRelationSelect,onMode}=props;
  const root=useRef<HTMLDivElement>(null),canvas=useRef<DrawableCanvas>(null);
  const[failed,setFailed]=useState(''),[view,setView]=useState(project.view),[motion,setMotion]=useState<Motion>({cards:[],groups:[]});
  const native=supportsCanvas()&&!forceDOM&&!failed;
  const drag=useRef<Drag|undefined>(undefined),viewRef=useRef(view);viewRef.current=view;
  const drawState=useRef({project,view,motion,selectedIds,activeTags});drawState.current={project,view,motion,selectedIds,activeTags};
  const arrivals=useRef(new Map<string,number>());
  useEffect(()=>setView(project.view),[project.id,project.view.x,project.view.y,project.view.zoom]);
  useEffect(()=>onMode(native?'原生 Canvas':failed?'HTML 模式 · Canvas 錯誤':'HTML 模式'),[native,failed,onMode]);
  const matches=(c:Clip)=>!activeTags.length||c.tagIds.some(id=>activeTags.includes(id));
  const visibleCard=(c:Clip)=>matches(c)&&!project.groups.find(g=>g.id===c.groupId)?.collapsed;
  const filtered=project.cards.filter(visibleCard);
  const pos=(card:Clip|Group,kind:'cards'|'groups')=>motion[kind].find(p=>p.id===card.id)||card;
  useLayoutEffect(()=>{
    const cv=canvas.current;if(!native||!cv)return;
    prepareCanvas(cv);const ctx=cv.getContext('2d') as DrawableContext|null;
    if(!ctx){setFailed('無法建立畫布');return;}
    const paint=()=>{
      try{
        const s=drawState.current,v=s.view,dpr=cv.width/Math.max(1,cv.clientWidth);ctx.reset();
        let animate=false;
        const visible=s.project.cards.filter(c=>(!s.activeTags.length||c.tagIds.some(t=>s.activeTags.includes(t)))&&!s.project.groups.find(g=>g.id===c.groupId)?.collapsed);
        const eligible=new Set(visible.map(c=>c.id));
        const groups=s.project.groups.filter(g=>!s.activeTags.length||s.project.cards.some(c=>c.groupId===g.id&&c.tagIds.some(t=>s.activeTags.includes(t))));
        groups.forEach(g=>{eligible.add(g.id);eligible.add(g.id+'-header');});
        for(const el of cv.querySelectorAll<HTMLElement>('[data-scene-id]'))if(!eligible.has(el.dataset.sceneId!))cv.clearElementGeometry(el);
        const ordered=[...groups.map(g=>({item:g,kind:'groups' as const,header:false})),...visible.filter(c=>!s.selectedIds.includes(c.id)).map(c=>({item:c,kind:'cards' as const,header:false})),...visible.filter(c=>s.selectedIds.includes(c.id)).map(c=>({item:c,kind:'cards' as const,header:false})),...groups.map(g=>({item:g,kind:'groups' as const,header:true}))];
        for(const{item,kind,header}of ordered){
          const el=cv.querySelector<HTMLElement>(`[data-scene-id="${item.id}${header?'-header':''}"]`);if(!el)continue;
          const p=s.motion[kind].find(p=>p.id===item.id)||item;
          const w=kind==='cards'?CARD_W:(item as Group).width,h=kind==='cards'?CARD_H:(item as Group).collapsed?48:(item as Group).height;
          if((p.x+w)*v.zoom+v.x<0||p.x*v.zoom+v.x>cv.clientWidth||(p.y+h)*v.zoom+v.y<0||p.y*v.zoom+v.y>cv.clientHeight){cv.clearElementGeometry(el);continue;}
          if(!arrivals.current.has(item.id))arrivals.current.set(item.id,performance.now()+220);
          const progress=Math.min(1,1-((arrivals.current.get(item.id)||0)-performance.now())/220);
          const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
          if(progress<1&&!reduced)animate=true;
          ctx.setTransform(dpr*v.zoom,0,0,dpr*v.zoom,dpr*v.x,dpr*v.y);
          ctx.globalAlpha=reduced?1:.5+.5*progress;
          // Explicit CSS dimensions avoid Chrome 156's default device-pixel
          // snapshot size multiplying the card a second time at high DPI.
          const matrix=ctx.drawElementImage(el,p.x,p.y,el.offsetWidth,el.offsetHeight);syncGeometry(cv,el,matrix);
        }
        cv.dataset.paints=String(Number(cv.dataset.paints||0)+1);if(animate)cv.requestPaint();
      }catch(error){setFailed(error instanceof Error?error.message:String(error));}
    };
    cv.addEventListener('paint',paint);
    const resize=new ResizeObserver(([entry])=>{const w=Math.round(entry.contentRect.width*devicePixelRatio),h=Math.round(entry.contentRect.height*devicePixelRatio);if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}cv.requestPaint();});
    resize.observe(cv,{box:'device-pixel-content-box'});cv.requestPaint();return()=>{resize.disconnect();cv.removeEventListener('paint',paint);};
  },[native]);
  useLayoutEffect(()=>{if(native)canvas.current?.requestPaint();},[project,view,motion,selectedIds,activeTags,native]);
  function begin(e:PEvent,kind:Drag['kind'],id?:string){
    if(e.button!==0)return;
    if(kind==='pan'&&e.target!==e.currentTarget&&e.target!==canvas.current)return;
    e.preventDefault();e.stopPropagation();
    let cards:Position[]=[],groups:Position[]=[];
    if(kind==='cards'){
      const ids=selectedIds.includes(id!)?selectedIds:[id!];if(!selectedIds.includes(id!))onSelect(id!,e.ctrlKey||e.metaKey||e.shiftKey);
      cards=project.cards.filter(c=>ids.includes(c.id)).map(({id,x,y})=>({id,x,y}));
    }
    if(kind==='group'){const g=project.groups.find(g=>g.id===id)!;groups=[{id:g.id,x:g.x,y:g.y}];cards=project.cards.filter(c=>c.groupId===id).map(({id,x,y})=>({id,x,y}));}
    drag.current={kind,px:e.clientX,py:e.clientY,cards,groups,from:kind==='link'?id:undefined,view:{...view}};
    root.current?.setPointerCapture(e.pointerId);
  }
  function world(e:PEvent){const r=root.current!.getBoundingClientRect();return{x:(e.clientX-r.x-view.x)/view.zoom,y:(e.clientY-r.y-view.y)/view.zoom};}
  function moved(e:PEvent){const d=drag.current;if(!d)return;const dx=(e.clientX-d.px)/d.view.zoom,dy=(e.clientY-d.py)/d.view.zoom;
    if(d.kind==='pan')setView({...d.view,x:d.view.x+e.clientX-d.px,y:d.view.y+e.clientY-d.py});
    else if(d.kind==='link'){const p=world(e);setMotion({cards:[],groups:[],link:{from:d.from!,...p}});}
    else setMotion({cards:d.cards.map(p=>({...p,x:p.x+dx,y:p.y+dy})),groups:d.groups.map(p=>({...p,x:p.x+dx,y:p.y+dy}))});
  }
  function finish(e:PEvent,cancel=false){
    const d=drag.current;if(!d)return;drag.current=undefined;
    if(root.current?.hasPointerCapture(e.pointerId))root.current.releasePointerCapture(e.pointerId);
    if(!cancel){
      const dx=(e.clientX-d.px)/d.view.zoom,dy=(e.clientY-d.py)/d.view.zoom;
      if(d.kind==='pan')onView(viewRef.current);
      else if(d.kind==='link'){const w=world(e);const target=[...filtered].reverse().find(c=>{const p=pos(c,'cards');return w.x>=p.x&&w.x<=p.x+CARD_W&&w.y>=p.y&&w.y<=p.y+CARD_H;});if(target)onLink(d.from!,target.id);}
      else if(Math.abs(dx)+Math.abs(dy)>2){
        const cards=d.cards.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
        const groups=d.groups.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
        const assignments=d.kind==='cards'?cards.map(c=>{const group=[...project.groups].reverse().find(g=>!g.collapsed&&c.x+CARD_W/2>=g.x&&c.x+CARD_W/2<=g.x+g.width&&c.y+CARD_H/2>=g.y+48&&c.y+CARD_H/2<=g.y+g.height);return{id:c.id,groupId:group?.id};}):[];
        onMove(cards,groups,assignments);
      }
    }else if(d.kind==='pan')setView(d.view);
    setMotion({cards:[],groups:[]});
  }
  function zoom(delta:number){const next=Math.max(.5,Math.min(2,Math.round((view.zoom+delta)*10)/10));const w=root.current?.clientWidth||600,h=root.current?.clientHeight||500,ratio=next/view.zoom;const v={zoom:next,x:w/2-(w/2-view.x)*ratio,y:h/2-(h/2-view.y)*ratio};setView(v);onView(v);}
  const sceneStyle=(p:{x:number;y:number})=>native?undefined:{transform:`translate(${view.x+p.x*view.zoom}px,${view.y+p.y*view.zoom}px) scale(${view.zoom})`};
  const groups=project.groups.filter(g=>!activeTags.length||project.cards.some(c=>c.groupId===g.id&&matches(c))).map(g=>{
    const p=pos(g,'groups'),members=project.cards.filter(c=>c.groupId===g.id),internal=project.relations.filter(r=>members.some(c=>c.id===r.from)&&members.some(c=>c.id===r.to)).length;
    return <Fragment key={g.id}><section data-scene-id={g.id} data-group-id={g.id} drawable={native?'':undefined} className={'group-frame '+(g.collapsed?'collapsed':'')} style={{...sceneStyle(p),width:g.width,height:g.collapsed?48:g.height,background:g.color}}>{!g.collapsed&&!members.length&&<p className="group-drop-hint">把材料拖進這個主題框</p>}</section>
      <header data-scene-id={g.id+'-header'} drawable={native?'':undefined} className="group-handle group-topbar" style={{...sceneStyle(p),width:g.width,background:g.color}} onPointerDown={e=>begin(e,'group',g.id)}><span className="group-title">{g.title}</span><small>{members.filter(matches).length}/{members.length}{g.collapsed&&internal?` · ${internal} 條內部關係`:''}</small><button aria-label={`編輯主題 ${g.title}`} onPointerDown={e=>e.stopPropagation()} onClick={()=>onGroup(g.id,{})}>⋯</button><button aria-label={`${g.collapsed?'展開':'收合'}主題 ${g.title}`} onPointerDown={e=>e.stopPropagation()} onClick={()=>onGroup(g.id,{collapsed:!g.collapsed})}>{g.collapsed?'＋':'−'}</button></header></Fragment>;
  });
  const cards=project.cards.map((card,index)=>{
    const p=pos(card,'cards'),visible=visibleCard(card),image=walkImages(card.editedDoc).length>0;
    return <article key={card.id} data-scene-id={card.id} data-card-id={card.id} drawable={native?'':undefined} hidden={!visible} className={`clip-card ${selectedIds.includes(card.id)?'selected':''} ${motion.cards.some(c=>c.id===card.id)?'moving':''} ${image?'has-image':''}`} style={sceneStyle(p)} onPointerDown={e=>onSelect(card.id,e.ctrlKey||e.metaKey||e.shiftKey)} onDoubleClick={e=>{if(!(e.target instanceof HTMLTextAreaElement)&&!(e.target instanceof HTMLButtonElement))onOpen(card.id);}}>
      <header className="card-handle" onPointerDown={e=>begin(e,'cards',card.id)}><span className="card-kind">{card.kind==='article'?'文章':card.kind==='manual'?'筆記':'摘錄'}</span><div className="card-tag-dots">{card.tagIds.slice(0,4).map(id=>{const t=project.tags.find(t=>t.id===id);return t?<span key={id} style={{background:t.color}} title={t.title}/>:null;})}</div><button className="link-handle" aria-label={`從卡片 ${index+1} 建立關係`} onPointerDown={e=>begin(e,'link',card.id)} title="拖曳到另一張卡片建立關係">↗</button><span className="grip" aria-hidden="true">⠿</span></header>
      <div className="card-content"><h2>{card.title}</h2>{image&&<CardThumbnail card={card}/>}<p className="card-excerpt">{card.workingText.slice(0,220)||'圖片材料'}</p><label className="card-note-label">我的筆記<textarea aria-label={`卡片筆記 ${index+1}`} value={card.note} placeholder="留下觀點與待查問題…" maxLength={500000} onChange={e=>onCard(card.id,{note:e.target.value})}/></label></div>
      <footer className="card-source"><span className="source-dot"/><span>{sourceLabel(card.url)}</span><button onClick={()=>onOpen(card.id)} aria-label={`閱讀卡片 ${index+1}`}>閱讀全文 ↗</button></footer>
    </article>;
  });
  function endpoint(id:string){const c=project.cards.find(c=>c.id===id);if(!c||!matches(c))return undefined;const g=project.groups.find(g=>g.id===c.groupId);if(g?.collapsed){const p=pos(g,'groups');return{id:g.id,x:p.x,y:p.y,width:g.width,height:48};}const p=pos(c,'cards');return{id:c.id,x:p.x,y:p.y,width:CARD_W,height:CARD_H};}
  const edges=new Map<string,{id:string;from:NonNullable<ReturnType<typeof endpoint>>;to:NonNullable<ReturnType<typeof endpoint>>;label:string;kind:string;count:number}>();
  for(const r of project.relations){const a=endpoint(r.from),b=endpoint(r.to);if(!a||!b||a.id===b.id)continue;const key=[a.id,b.id,r.kind].join(':');const existing=edges.get(key);if(existing)existing.count++;else edges.set(key,{id:r.id,from:a,to:b,label:r.label||r.kind,kind:r.kind,count:1});}
  const edgeGeometry=(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number})=>{const right=b.x>=a.x,x1=a.x+(right?a.width:0),x2=b.x+(right?0:b.width),y1=a.y+a.height/2,y2=b.y+b.height/2,bend=Math.max(60,Math.abs(x2-x1)/2),sign=right?1:-1;return{d:`M ${x1} ${y1} C ${x1+sign*bend} ${y1},${x2-sign*bend} ${y2},${x2} ${y2}`,x:(x1+x2)/2,y:(y1+y2)/2};};
  return <div className="board-shell" data-screen-label="互動閱讀桌"><div className="board-surface" ref={root} data-mode={native?'native':'dom'} onPointerDown={e=>begin(e,'pan')} onPointerMove={moved} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)}>
    {native?<canvas ref={canvas} className="native-canvas" aria-label="可互動摘錄卡片板">{groups}{cards}</canvas>:<>{groups}{cards}</>}
    <svg className="relations-layer" aria-label="材料關係線"><defs><marker id="relation-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#708167"/></marker></defs><g transform={`translate(${view.x},${view.y}) scale(${view.zoom})`}>{[...edges.values()].map(edge=>{const g=edgeGeometry(edge.from,edge.to);return <g key={edge.id} className={'relation '+(edge.kind==='質疑'?'question':'')}><path className="relation-hit" d={g.d} tabIndex={0} role="button" aria-label={`${edge.label}關係`} onPointerDown={e=>e.stopPropagation()} onClick={()=>onRelationSelect(edge.id)} onKeyDown={e=>{if(e.key==='Enter')onRelationSelect(edge.id);}}/><path className="relation-line" d={g.d} markerEnd="url(#relation-arrow)"/><text x={g.x} y={g.y-7} textAnchor="middle" onPointerDown={e=>e.stopPropagation()} onClick={()=>onRelationSelect(edge.id)}>{edge.label}{edge.count>1?' · '+edge.count:''}</text></g>;})}{motion.link&&(()=>{const a=endpoint(motion.link.from);if(!a)return null;const g=edgeGeometry(a,{...motion.link,width:0,height:0});return <path className="relation-preview" d={g.d}/>;})()}</g></svg>
    {!project.cards.length&&<div className="empty-board"><span className="empty-mark" aria-hidden="true">＋</span><p className="eyebrow">YOUR READING DESK</p><h2>把材料攤開，讓想法連起來。</h2><p>從網頁收集圖文，並排閱讀、分組與建立關係。<br/>按「新增卡片」開始，或匯入你的舊版備份。</p><span className="empty-caption">閱讀 → 比較 → 連結 → 成稿</span></div>}
    {activeTags.length>0&&project.cards.length>0&&!filtered.length&&<div className="empty-filter">目前標籤沒有可見卡片；主題框可能已收合。</div>}
  </div><div className="board-bottom"><span>{failed||'拖曳頂端移動 · Ctrl / Shift 多選 · ↗ 拖曳建立關係'}</span><div className="zoom-controls"><button aria-label="縮小" disabled={view.zoom<=.5} onClick={()=>zoom(-.1)}>−</button><output>{Math.round(view.zoom*100)}%</output><button aria-label="放大" disabled={view.zoom>=2} onClick={()=>zoom(.1)}>＋</button><button className="reset-view" onClick={()=>{const v={x:0,y:0,zoom:1};setView(v);onView(v);}}>重設</button></div></div></div>;
}
