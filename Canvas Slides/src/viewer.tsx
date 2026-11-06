import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {loadDeck,saveDeck} from './storage';
import {Stage,type StageHandle} from './StageFrame';
import type {Deck} from './model';
import './style.css';
import './viewer.css';
function Viewer(){
 const[deck,setDeck]=useState<Deck>(),[at,setAt]=useState(0),[presenter,setPresenter]=useState(false),[error,setError]=useState(''),[running,setRunning]=useState(false),[seconds,setSeconds]=useState(0),[screen,setScreen]=useState('normal');
 const stage=useRef<StageHandle>(null),id=new URLSearchParams(location.search).get('deck')||'';
 useEffect(()=>{loadDeck(id).then(d=>{if(!d)throw new Error('找不到簡報，請回到編輯器重新開啟播放。');setDeck(d);}).catch(e=>setError(String(e)));},[id]);
 useEffect(()=>{if(!running)return;const start=Date.now()-seconds*1000;const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-start)/1000)),250);return()=>clearInterval(timer);},[running]);
 function advance(){stage.current?.command('advance').catch(e=>setError(String(e)));}
 function go(n:number){stage.current?.command('goto',n).catch(e=>setError(String(e)));}
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.target as HTMLElement).closest('textarea,input'))return;if(e.key.toLowerCase()==='p')setPresenter(v=>!v);if(['ArrowRight','ArrowDown','PageDown',' '].includes(e.key)){e.preventDefault();advance();}if(e.key==='ArrowLeft')go(at-1);};addEventListener('keydown',key);return()=>removeEventListener('keydown',key);},[at]);
 if(error)return <div className="viewer-error">{error}</div>;if(!deck)return <div className="viewer-error">正在開啟簡報…</div>;
 const visible=deck.slides.filter(s=>!s.hidden),slide=visible[at]||visible[0];
 return <div className={'viewer '+(presenter?'presenter':'')}><header><b>{deck.title}</b><span>{at+1} / {visible.length}</span><button onClick={()=>setPresenter(v=>!v)}>P 講者模式</button><button onClick={()=>document.documentElement.requestFullscreen()}>全螢幕</button><button onClick={()=>setScreen(screen==='black'?'normal':'black')}>黑屏</button><button onClick={()=>setScreen(screen==='white'?'normal':'white')}>白屏</button></header><main><div className="viewer-slides"><div className="current-slide"><Stage ref={stage} deck={deck} index={0} epoch={0} zoom={1} forceDOM mode="play" onEvent={(type,payload)=>{if(type==='play-state')setAt(payload.index);if(type==='presenter-toggle')setPresenter(v=>!v);if(type==='error'||type==='failure')setError(payload);}}/>{screen!=='normal'&&<div className="screen-cover" style={{background:screen}} onClick={()=>setScreen('normal')}/>}</div>{presenter&&at+1<visible.length&&<div className="next-slide"><span>下一頁 · {visible[at+1].note.title}</span><Stage deck={{...deck,slides:visible}} index={at+1} epoch={0} zoom={1} forceDOM mode="preview" onEvent={()=>{}}/></div>}</div>{presenter&&<aside><label>本頁目的<p>{slide.note.purpose||'—'}</p></label><label>講者備註<textarea aria-label="講者備註" value={slide.note.talk.join('\n')} onChange={e=>{const next=structuredClone(deck);next.slides.find(s=>s.id===slide.id)!.note.talk=e.target.value.split('\n');setDeck(next);saveDeck(next).catch(e=>setError(String(e)));}}/></label><label>轉場<p>{slide.note.transition||'—'}</p></label><div className="timer"><strong>{Math.floor(seconds/60).toString().padStart(2,'0')}:{(seconds%60).toString().padStart(2,'0')}</strong><button onClick={()=>setRunning(v=>!v)}>{running?'暫停計時':seconds?'繼續計時':'開始計時'}</button><button onClick={()=>{setRunning(false);setSeconds(0);}}>重置計時</button></div></aside>}</main><footer><button onClick={()=>go(0)}>首頁</button><button onClick={()=>go(at-1)}>上一頁</button><span>{at+1} / {visible.length}</span><button onClick={advance}>下一步</button><button onClick={()=>go(visible.length-1)}>尾頁</button><small>點畫面／→／空白鍵 下一步 · P 講者模式 · B 靜態模式</small></footer></div>;
}
createRoot(document.getElementById('root')!).render(<Viewer/>);
