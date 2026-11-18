import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {loadDeck,saveTalk} from './storage';
import {playbackStart,SaveConflict,type Resolution} from './mergeDeck';
import {Stage,type StageHandle} from './StageFrame';
import type {Deck,Slide} from './model';
import './style.css';
import './viewer.css';

type Draft={text:string;before:string[];phase:'pending'|'saving'|'saved'|'error';error?:string;other?:string[]};
const message=(error:unknown)=>error instanceof Error?error.message:String(error);

function Viewer(){
 const [deck,setDeck]=useState<Deck>();
 const [start,setStart]=useState(0);
 const [at,setAt]=useState(0);
 const [ready,setReady]=useState(false);
 const [presenter,setPresenter]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [running,setRunning]=useState(false);
 const [seconds,setSeconds]=useState(0);
 const [screen,setScreen]=useState<'normal'|'black'|'white'>('normal');
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const notes=useRef<Record<string,Draft>>({});
 const timers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
 const writes=useRef(new Set<string>());
 const stage=useRef<StageHandle>(null);
 const query=new URLSearchParams(location.search);
 const id=query.get('deck')||'';
 const slideId=query.get('slide')??undefined;
 const visible=deck?.slides.filter(s=>!s.hidden)??[];
 const slide=visible[at]??visible[0];

 useEffect(()=>{
  let active=true;
  loadDeck(id).then(loaded=>{
   if(!active)return;
   if(!loaded)throw new Error('找不到簡報，請回到編輯器重新開啟播放。');
   const target=playbackStart(loaded,slideId);
   if(!target)throw new Error('沒有可播放的投影片。請回到編輯器恢復至少一頁。');
   const index=loaded.slides.filter(s=>!s.hidden).findIndex(s=>s.id===target);
   setStart(index);setAt(index);setDeck(loaded);
  }).catch(error=>{if(active)setError(message(error));});
  return()=>{active=false;};
 },[id,slideId]);

 useEffect(()=>{
  if(!running)return;
  const began=Date.now()-seconds*1000;
  const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-began)/1000)),250);
  return()=>clearInterval(timer);
 },[running]);

 useEffect(()=>{
  const protect=(event:BeforeUnloadEvent)=>{if(Object.values(notes.current).some(draft=>draft.phase!=='saved'))event.preventDefault();};
  addEventListener('beforeunload',protect);
  return()=>{removeEventListener('beforeunload',protect);for(const timer of timers.current.values())clearTimeout(timer);};
 },[]);

 function noteState(page:string,draft:Draft){
  notes.current={...notes.current,[page]:draft};
  setDrafts(notes.current);
 }
 function schedule(page:string){
  clearTimeout(timers.current.get(page));
  timers.current.set(page,setTimeout(()=>void persistNote(page),400));
 }
 async function persistNote(page:string,resolution?:Resolution){
  clearTimeout(timers.current.get(page));
  const draft=notes.current[page];
  if(!draft||draft.phase==='saved'||writes.current.has(page)||(draft.other&&!resolution))return;
  writes.current.add(page);
  noteState(page,{...draft,phase:'saving',error:undefined});
  try{
   const saved=await saveTalk(id,page,draft.before,draft.text.split('\n'),resolution,draft.other);
   const latest=notes.current[page];
   if(latest.text===draft.text){
    noteState(page,{text:saved.join('\n'),before:saved,phase:'saved'});
   }else{
    noteState(page,{...latest,before:saved,phase:'pending',other:undefined});
    schedule(page);
   }
  }catch(error){
   const other=error instanceof SaveConflict?error.saved.slides.find(s=>s.id===page)?.note.talk:undefined;
   noteState(page,{...notes.current[page],phase:'error',error:message(error),other});
  }finally{writes.current.delete(page);}
 }
 function changeNote(page:Slide,text:string){
  const previous=notes.current[page.id];
  noteState(page.id,{text,before:previous?.before??page.note.talk,phase:previous?.other?'error':'pending',error:previous?.other?previous.error:undefined,other:previous?.other});
  if(!previous?.other)schedule(page.id);
 }
 function send(command:string,payload?:number){
  if(!ready)return;
  setNotice('');
  stage.current?.command(command,payload).catch(error=>setNotice(message(error)));
 }
 const advance=()=>send('advance');
 const go=(index:number)=>send('goto',index);
 useEffect(()=>{
  function keyboard(event:KeyboardEvent){
   if(event.isComposing||event.altKey||event.ctrlKey||event.metaKey)return;
   if((event.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]'))return;
   if(event.key==='Escape'&&screen!=='normal'){setScreen('normal');return;}
   if(event.key.toLowerCase()==='p'){setPresenter(value=>!value);return;}
   if(event.key===' '&&(event.target as HTMLElement).closest('button,a'))return;
   if(['ArrowRight','ArrowDown','PageDown',' '].includes(event.key)){event.preventDefault();advance();}
   if(['ArrowLeft','ArrowUp','PageUp'].includes(event.key)){event.preventDefault();go(at-1);}
   if(event.key==='Home')go(0);
   if(event.key==='End')go(visible.length-1);
  }
  addEventListener('keydown',keyboard);
  return()=>removeEventListener('keydown',keyboard);
 });

 if(error)return <div className="viewer-error" role="alert">{error}<p><a href="index.html">回到編輯器</a></p></div>;
 if(!deck||!slide)return <div className="viewer-error" role="status">正在開啟簡報…</div>;
 const draft=drafts[slide.id],next=visible[at+1];
 return <div className={'viewer '+(presenter?'presenter':'')}>
  <header>
   <b title={deck.title}>{deck.title}</b>
   <button aria-pressed={presenter} onClick={()=>setPresenter(value=>!value)}>P 講者模式</button>
   <button onClick={()=>document.documentElement.requestFullscreen().catch(error=>setNotice(message(error)))}>全螢幕</button>
  </header>
  <main>
   <div className="viewer-slides">
    <div className="current-slide">
     <Stage ref={stage} deck={deck} index={start} epoch={0} forceDOM mode="play" onEvent={(type,payload)=>{
      if(type==='mounted')setReady(true);
      if(type==='play-state')setAt(payload.index);
      if(type==='presenter-toggle')setPresenter(value=>!value);
      if(type==='error'||type==='failure')setError(payload);
     }}/>
     {screen!=='normal'&&<button className="screen-cover" style={{background:screen}} onClick={()=>setScreen('normal')} aria-label="恢復播放畫面"/>}
    </div>
    {presenter&&next&&<div className="next-slide">
     <span>下一頁 · {next.note.title}</span>
     <Stage deck={{...deck,slides:visible}} index={at+1} epoch={0} forceDOM mode="preview" onEvent={()=>{}}/>
    </div>}
   </div>
   {presenter&&<aside aria-label="講者提詞">
    <h2>{slide.note.title||'未命名投影片'}</h2>
    <label>講者備註<textarea aria-label="講者備註" value={draft?.text??slide.note.talk.join('\n')} onChange={e=>changeNote(slide,e.target.value)} onBlur={()=>void persistNote(slide.id)}/></label>
    {draft&&<div className="viewer-note-status" role={draft.phase==='error'?'alert':'status'}>
     {draft.phase==='saved'?'提詞已保存':draft.phase==='error'?draft.error:'正在保存提詞…'}
     {draft.other?<div className="viewer-note-conflict">
      <details><summary>查看已保存的提詞</summary><pre>{draft.other.join('\n')}</pre></details>
      <button onClick={()=>void persistNote(slide.id,'saved')}>保留已保存提詞</button>
      <button onClick={()=>void persistNote(slide.id,'mine')}>保留這個分頁的提詞</button>
     </div>:draft.phase==='error'&&<button onClick={()=>void persistNote(slide.id)}>重試</button>}
    </div>}
    {slide.note.purpose&&<label>本頁目的<p>{slide.note.purpose}</p></label>}
    {slide.note.transition&&<label>轉場<p>{slide.note.transition}</p></label>}
    <div className="timer">
     <strong>{Math.floor(seconds/60).toString().padStart(2,'0')}:{(seconds%60).toString().padStart(2,'0')}</strong>
     <button onClick={()=>setRunning(value=>!value)}>{running?'暫停計時':seconds?'繼續計時':'開始計時'}</button>
     <button onClick={()=>{setRunning(false);setSeconds(0);}}>重置計時</button>
    </div>
   </aside>}
  </main>
  {notice&&<div className="viewer-notice" role="alert">{notice} <button onClick={()=>setNotice('')}>關閉</button></div>}
  <footer aria-label="播放控制">
   <button disabled={!ready||at===0} onClick={()=>go(0)}>首頁</button>
   <button disabled={!ready||at===0} onClick={()=>go(at-1)}>上一頁</button>
   <span>{at+1} / {visible.length}</span>
   <button disabled={!ready} onClick={advance}>下一步</button>
   <button disabled={!ready||at===visible.length-1} onClick={()=>go(visible.length-1)}>尾頁</button>
   <button aria-pressed={screen==='black'} onClick={()=>setScreen(screen==='black'?'normal':'black')}>黑屏</button>
   <button aria-pressed={screen==='white'} onClick={()=>setScreen(screen==='white'?'normal':'white')}>白屏</button>
   <small>點畫面／→／空白鍵 下一步</small>
  </footer>
 </div>;
}
createRoot(document.getElementById('root')!).render(<Viewer/>);
