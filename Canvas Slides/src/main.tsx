import {useEffect,useLayoutEffect,useRef,useState,type ButtonHTMLAttributes} from 'react';
import {createRoot} from 'react-dom/client';
import {Stage,type StageHandle} from './StageFrame';
import {Icon} from './icons';
import {Dialog} from './Dialog';
import {Inspector,colorHex,type Layer,type Selection} from './Inspector';
import {History,clone,duplicateSlide,emptyNote,newId,type Deck} from './model';
import {createDeck,fromLayout,layouts} from './vendor';
import {importHtml,mergeAssets,readAssets,readFiles,safeHtml,type AssetMap} from './importer';
import {listDecks,loadDeck,removeDeck,saveDeck,type RecentProject} from './storage';
import {playbackStart,SaveConflict} from './mergeDeck';
import {useDeckDraft} from './useDeckDraft';
import {exportPrintHtml,waitForPrint} from './printing';
import './style.css';
import './workbench.css';
import {version as packageVersion} from '../package.json';

const extensionRuntime=(globalThis as {chrome?:{runtime?:{getManifest?:()=>{version:string}}}}).chrome?.runtime;
const appVersion=extensionRuntime?.getManifest?.().version??packageVersion;

const titles={templates:'新增投影片',projects:'專案',create:'新建簡報',import:'匯入簡報',export:'匯出簡報',overview:'投影片總覽',help:'操作與快捷鍵',remove:'刪除專案',conflict:'選擇要保留的修改'};
type DialogName=keyof typeof titles;
const familyNames={swiss:'歸藏 · 瑞士風',magazine:'歸藏 · 雜誌風',generic:'一般 HTML'};
const formats={
 zip:{label:'可再編輯專案 ZIP',icon:'open',hint:'備份、換裝置或日後繼續編輯'},
 html:{label:'獨立 HTML 簡報',icon:'play',hint:'在瀏覽器離線播放'},
 png:{label:'目前投影片 PNG',icon:'image',hint:'一張圖片，適合貼到其他文件'},
 print:{label:'列印／另存 PDF',icon:'notes',hint:'供閱讀或列印，保留可選取文字'},
};
type Format=keyof typeof formats;
type ExportState={kind:Format;phase:'busy'|'done'|'error';message:string};
type ImportDraft={name:string;assets:AssetMap;entries:string[];entry:string;source:string;selector:string;project?:Deck};
const freshImport=():ImportDraft=>({name:'',assets:new Map(),entries:[],entry:'index.html',source:'',selector:''});
const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);
const summary=(draft:ImportDraft)=>{
 if(draft.project)return {deck:draft.project,images:undefined};
 if(!draft.source.trim())return;
 const images=new Set<string>();
 return {deck:importHtml(draft.source,draft.assets,draft.entry,draft.selector.trim()||undefined,images),images:images.size};
};
function Button({icon,children,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{icon?:string}){
 return <button type="button" {...props}>{icon&&<Icon name={icon}/>} {children}</button>;
}
function InlineStatus({error=false,children}:{error?:boolean;children:React.ReactNode}){
 return <div className={'inline-status '+(error?'is-error':'')} role={error?'alert':'status'}>{children}</div>;
}
function prepareWindow(message:string){
 const view=window.open('about:blank','_blank');
 if(!view)throw new Error('瀏覽器封鎖了新視窗。請允許彈出視窗後重試。');
 view.document.title=message;
 view.document.body.textContent=message;
 return view;
}
async function printIn(view:Window,deck:Deck,showPreparing:()=>void){
 const url=URL.createObjectURL(new Blob([exportPrintHtml(deck)],{type:'text/html;charset=utf-8'}));
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  await new Promise<void>((resolve,reject)=>{
   const deadline=performance.now()+20000;
   const wait=()=>{
    if(view.closed){reject(new Error('列印視窗已關閉。'));return;}
    if(view.location.href===url&&view.document.readyState==='complete'){resolve();return;}
    if(performance.now()>=deadline){reject(new Error('列印視窗載入逾時。'));return;}
    timer=setTimeout(wait,100);
   };
   view.location.replace(url);
   wait();
  });
  showPreparing();
  await Promise.race([
   waitForPrint(view),
   new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('等待列印素材逾時，請重試。')),25000);}),
  ]);
  if(view.closed)throw new Error('列印視窗已關閉。');
  view.print();
 }finally{clearTimeout(timer);URL.revokeObjectURL(url);}
}

function App({initial,recents}:{initial?:Deck;recents:RecentProject[]}){
 const history=useRef(new History());
 const project=useDeckDraft(initial,(draft,saved)=>{
  // A presenter tab can save new notes while an older editor history remains open.
  const nextById=new Map(saved.slides.map(item=>[item.id,item]));
  for(const item of draft.slides){
   const next=nextById.get(item.id);
   if(!next||item.note.talk.join('\n')===next.note.talk.join('\n'))continue;
   for(const snapshot of [...history.current.past,...history.current.future]){
    const previous=snapshot.slides.find(s=>s.id===item.id);
    if(previous&&previous.note.talk.join('\n')===item.note.talk.join('\n'))previous.note.talk=next.note.talk.slice();
   }
  }
 }),{deck}=project;
 const [activeId,setActiveId]=useState(initial?.slides[0].id);
 const [epoch,setEpoch]=useState(0);
 const [stageReady,setStageReady]=useState(false);
 const [native,setNative]=useState<boolean>();
 const [forceDOM,setForceDOM]=useState(false);
 const [zoom,setZoom]=useState<number>();
 const [scale,setScale]=useState(1);
 const [dialog,setDialog]=useState<DialogName>();
 const [menu,setMenu]=useState<'shape'|'slide'|'play'|'zoom'>();
 const [side,setSide]=useState<'slides'|'inspector'>();
 const [focusMode,setFocusMode]=useState(false);
 const [compact,setCompact]=useState(()=>matchMedia('(max-width: 1099px)').matches);
 const [tab,setTab]=useState<'properties'|'layers'>('properties');
 const [layers,setLayers]=useState<Layer[]>([]);
 const [selection,setSelection]=useState<Selection[]>([]);
 const [background,setBackground]=useState('#ffffff');
 const [notesOpen,setNotesOpen]=useState(false);
 const [previews,setPreviews]=useState<Record<string,string>>({});
 const [projects,setProjects]=useState(recents);
 const [deleting,setDeleting]=useState<RecentProject>();
 const [dragSlide,setDragSlide]=useState<string>();
 const [draft,setDraft]=useState<ImportDraft>(freshImport);
 const [importCheck,setImportCheck]=useState<ReturnType<typeof summary>>();
 const [importError,setImportError]=useState('');
 const [importBusy,setImportBusy]=useState(false);
 const [draggingFile,setDraggingFile]=useState(false);
 const [exportState,setExportState]=useState<ExportState>();
 const [toast,setToast]=useState('');
 const [projectError,setProjectError]=useState('');
 const [opening,setOpening]=useState(false);
 const stage=useRef<StageHandle>(null);
 const files=useRef<HTMLInputElement>(null),folders=useRef<HTMLInputElement>(null),assets=useRef<HTMLInputElement>(null),image=useRef<HTMLInputElement>(null);
 const firstSlide=useRef<HTMLButtonElement>(null);
 const importLock=useRef(false),imageIntent=useRef<{deckId:string;slideId:string;objectId?:string}|undefined>(undefined);
 const noteBefore=useRef<Deck|undefined>(undefined);
 const toastTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const focusFirst=useRef(false);
 const activeTransition=useRef(false);
 const exportLock=useRef(false);
 const playLock=useRef(false);
 const lastStage=useRef<{id:string;slide:string;html:string;design:string}|undefined>(undefined);
 const index=Math.max(0,deck?.slides.findIndex(s=>s.id===activeId)??0);
 const slide=deck?.slides[index];
 const visible=deck?.slides.filter(s=>!s.hidden).length??0;
 const design=deck?JSON.stringify([deck.width,deck.height,deck.rootAttrs,deck.rootStyle,deck.bodyStyle]):'';

 useEffect(()=>{
  const query=matchMedia('(max-width: 1099px)');
  const resize=()=>{setCompact(query.matches);setSide(undefined);};
  query.addEventListener('change',resize);
  return()=>query.removeEventListener('change',resize);
 },[]);
 useLayoutEffect(()=>{
  if(deck&&slide)lastStage.current={id:deck.id,slide:slide.id,html:slide.html,design};
 },[deck?.id,slide?.id,epoch,forceDOM]);
 useEffect(()=>{
  const rendered=lastStage.current;
  if(!deck||!slide||!rendered||project.held.current)return;
  if(rendered.id===deck.id&&rendered.slide===slide.id&&(rendered.html!==slide.html||rendered.design!==design)){
   setStageReady(false);
   setEpoch(value=>value+1);
  }
 },[deck,slide,design]);
 useLayoutEffect(()=>{
  if(focusFirst.current&&!dialog&&stageReady){
   focusFirst.current=false;
   firstSlide.current?.focus();
  }
 },[dialog,deck?.id,stageReady]);

 function notify(message:string){
  setToast(message);
  clearTimeout(toastTimer.current);
  toastTimer.current=setTimeout(()=>setToast(''),5000);
 }
 function finishNote(){
  if(noteBefore.current){
   history.current.push(noteBefore.current);
   noteBefore.current=undefined;
   // The current draft may already have finished saving while the field has focus.
   setHistoryDisplay(value=>value+1);
  }
 }
 const [,setHistoryDisplay]=useState(0);
 async function flush(){
  finishNote();
  if(stage.current&&stageReady)await stage.current.command('flush');
  else if(project.held.current)throw new Error('舞台尚未準備完成，請稍後重試。');
 }
 async function checkpoint(){
  await flush();
  return project.current.current?project.persist():undefined;
 }
 function update(next:Deck,record=true){
  const before=project.current.current;
  if(record&&before)history.current.push(before);
  project.replace(next);
 }
 function change(mutate:(draft:Deck)=>void){
  if(!project.current.current)return;
  const next=clone(project.current.current);
  mutate(next);
  update(next);
 }
 async function withSlideBoundary(task:()=>void|Promise<void>){
  if(activeTransition.current)return;
  activeTransition.current=true;
  try{await flush();await task();}
  catch(error){notify(errorText(error));}
  finally{activeTransition.current=false;}
 }
 function setSlide(id:string){
  if(id!==slide?.id){
   setSelection([]);setStageReady(false);setActiveId(id);
  }
  if(compact)setSide(undefined);
 }
 function switchSlide(id:string){return withSlideBoundary(()=>setSlide(id));}
 function navigateHistory(redo=false){
  return withSlideBoundary(()=>{
   const current=project.current.current;
   if(!current)return;
   const next=redo?history.current.redo(current):history.current.undo(current);
   if(next){
    // Current persistence baseline continues to be the latest stored revision.
    update(next,false);
    setStageReady(false);setEpoch(value=>value+1);
    if(!next.slides.some(s=>s.id===activeId))setSlide(next.slides[Math.min(index,next.slides.length-1)].id);
   }
  });
 }
 function onEvent(type:string,payload:any){
  if(type==='mounted'&&payload.deckId===project.current.current?.id){
   setNative(payload.native);setStageReady(true);setSelection([]);project.hold(false);
  }
  if(type==='dirty')project.hold(payload);
  if(type==='selection'){
   setLayers(payload.layers);setSelection(payload.selection);
   if(payload.pageBackground)setBackground(colorHex(payload.pageBackground));
  }
  if(type==='commit'&&payload.deckId===project.current.current?.id){
   const next=clone(project.current.current!);
   const changed=next.slides.find(s=>s.id===payload.slideId);
   if(changed){
    const html=safeHtml(payload.html);
    if(changed.html!==html){
     changed.html=html;
     if(lastStage.current?.slide===changed.id)lastStage.current.html=html;
     update(next);
    }
   }
  }
  if(type==='preview'&&payload.deckId===project.current.current?.id)setPreviews(current=>({...current,[payload.slideId]:payload.url}));
  if(['error','failure','notice'].includes(type))notify(String(payload));
  if(type==='shortcut'){
   if(payload.key==='s')void checkpoint().catch(error=>notify(errorText(error)));
   else void navigateHistory(payload.key==='y'||payload.shift);
  }
 }
 useEffect(()=>{
  function keyboard(event:KeyboardEvent){
   if(event.isComposing||project.held.current||dialog)return;
   if(event.key==='Escape'){setMenu(undefined);setSide(undefined);return;}
   const target=(event.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]');
   if(!(event.ctrlKey||event.metaKey))return;
   const key=event.key.toLowerCase();
   if(key==='s'&&deck){event.preventDefault();void checkpoint().catch(error=>notify(errorText(error)));}
   if(!target&&(key==='z'||key==='y')){event.preventDefault();void navigateHistory(key==='y'||event.shiftKey);}
  }
  addEventListener('keydown',keyboard);
  return()=>removeEventListener('keydown',keyboard);
 });
 function showProject(next:Deck,saved=false){
  history.current=new History();noteBefore.current=undefined;project.hold(false);
  setStageReady(false);setSelection([]);setPreviews({});setLayers([]);setZoom(undefined);setNative(undefined);
  setFocusMode(false);setSide(compact?'slides':undefined);setTab('properties');setNotesOpen(false);
  setActiveId(next.slides[0].id);
  focusFirst.current=true;
  project.open(next,saved);
  setEpoch(value=>value+1);
  setDialog(undefined);
  localStorage.setItem('canvas-slides-last',next.id);
 }
 async function openProject(next:Deck,saved=false){
  // Commit and save the current draft before changing the editor's project identity.
  if(project.current.current)await checkpoint();
  if(saved&&next.id===project.current.current?.id){setDialog(undefined);return;}
  showProject(next,saved);
 }
 async function openingProject(task:()=>Promise<void>){
  if(opening)return;
  setOpening(true);setProjectError('');
  try{await task();}
  catch(error){setProjectError(errorText(error));}
  finally{setOpening(false);}
 }
 async function keepCopy(){
  if(opening)return;
  setOpening(true);
  try{
   await flush();
   const current=project.current.current;
   if(!current)return;
   const saved=await saveDeck({...current,id:newId(),title:current.title+' · 本機副本'});
   showProject(saved,true);
  }catch(error){notify(errorText(error));}
  finally{setOpening(false);}
 }
 function showImport(){
  setDraft(freshImport());setImportCheck(undefined);setImportError('');setDialog('import');
 }
 function inspectImport(next:ImportDraft){
  setDraft(next);
  try{setImportCheck(summary(next));setImportError('');}
  catch(error){setImportCheck(undefined);setImportError(errorText(error));}
 }
 async function pickFiles(list:FileList|null,supplement=false){
  if(!list?.length||importLock.current)return;
  importLock.current=true;
  setImportBusy(true);setImportError('');setDialog('import');
  try{
   if(supplement){
    const added=await readAssets([...list]);
    inspectImport({...draft,assets:mergeAssets(draft.assets,added,draft.entry)});
    return;
   }
   const read=await readFiles([...list]);
   inspectImport({name:list.length===1?list[0].name:('已選擇 '+list.length+' 個檔案'),assets:read.files,entries:read.entries??[],entry:read.entry??'index.html',
    source:read.source??'',selector:'',project:read.deck});
  }catch(error){setImportError(errorText(error));}
  finally{
   importLock.current=false;setImportBusy(false);
   for(const input of [files.current,folders.current,assets.current])if(input)input.value='';
  }
 }
 async function acceptImport(){
  if(importLock.current||!importCheck)return;
  importLock.current=true;setImportBusy(true);setImportError('');
  try{
   const incoming=importCheck.deck;
   await openProject(draft.project?{...incoming,id:newId(),title:incoming.title+' · 匯入副本'}:incoming);
   notify('已匯入 '+incoming.slides.length+' 頁');
  }catch(error){setImportError(errorText(error));}
  finally{importLock.current=false;setImportBusy(false);}
 }
 async function perform(command:string,payload?:unknown){
  try{if(stageReady)await stage.current?.command(command,payload);}
  catch(error){notify(errorText(error));}
 }
 function addLayout(layoutId?:string){
  void withSlideBoundary(()=>{
   const current=project.current.current;
   if(!current||current.slides.length>=200)return;
   const layout=layouts.find(item=>item.id===layoutId&&item.family===current.family);
   const id=newId();
   const inserted=layout?fromLayout(layout):{id,html:'<section class="slide" data-slide-id="'+id+'"><h1>新增投影片</h1></section>',note:emptyNote('新增投影片'),hidden:false};
   change(next=>next.slides.splice(index+1,0,inserted));
   setSlide(inserted.id);setDialog(undefined);
  });
 }
 function moveSlide(from:string,to:string){
  void withSlideBoundary(()=>{
   const list=project.current.current?.slides;
   const source=list?.findIndex(s=>s.id===from)??-1,target=list?.findIndex(s=>s.id===to)??-1;
   if(source<0||target<0||source===target)return;
   change(next=>{const [item]=next.slides.splice(source,1);next.slides.splice(target,0,item);});
   setSlide(from);setEpoch(value=>value+1);
   notify('已移至第 '+(target+1)+' 頁');
  });
 }
 function slideAction(action:'copy'|'delete'|'hide'|'up'|'down'){
  if(!slide||!deck)return;
  setMenu(undefined);
  if(action==='up'||action==='down'){
   const target=deck.slides[index+(action==='up'?-1:1)];if(target)moveSlide(slide.id,target.id);
   return;
  }
  void withSlideBoundary(()=>{
   const current=project.current.current!;
   if(action==='hide'){change(next=>{next.slides[index].hidden=!next.slides[index].hidden;});return;}
   if(action==='copy'&&current.slides.length<200){
    const copy=duplicateSlide(current.slides[index]);change(next=>next.slides.splice(index+1,0,copy));setSlide(copy.id);
   }
   if(action==='delete'&&current.slides.length>1){
    change(next=>next.slides.splice(index,1));setSlide(project.current.current!.slides[Math.min(index,current.slides.length-2)].id);notify('已刪除投影片，可按「復原」。');
   }
  });
 }
 async function play(first=false){
  if(!deck||!visible||playLock.current)return;
  playLock.current=true;setMenu(undefined);
  let view:Window|undefined;
  try{
   view=prepareWindow('正在準備播放…');
   const next=await checkpoint();
   if(!next)throw new Error('找不到簡報。');
   const start=playbackStart(next,first?undefined:slide?.id);
   if(!start)throw new Error('請先恢復至少一頁的顯示。');
   if(view.closed)throw new Error('播放視窗已關閉。');
   view.location.replace('viewer.html?'+new URLSearchParams({deck:next.id,slide:start}));
  }catch(error){view?.close();notify(errorText(error));}
  finally{playLock.current=false;}
 }
 async function exportAs(kind:Format){
  if(exportLock.current||!deck)return;
  exportLock.current=true;
  setExportState({kind,phase:'busy',message:'正在整理投影片…'});
  let printer:Window|undefined;
  try{
   if(kind==='print')printer=prepareWindow('正在準備列印…');
   await flush();
   let next=project.current.current!;
   // A backup must remain available even when local storage is full or in conflict.
   try{if(kind!=='png')next=await project.persist()??next;}
   catch(error){if(kind!=='zip')throw error;}
   const {download,exportHtml,projectZip}=await import('./exporter');
   const name=next.title.replace(/[\\/:*?"<>|]/g,'_')||'未命名簡報';
   let message='檔案已交給瀏覽器下載。';
   if(kind==='zip')download(new Blob([projectZip(next) as Uint8Array<ArrayBuffer>],{type:'application/zip'}),name+'.canvas-slides.zip');
   if(kind==='html')download(new Blob([exportHtml(next)],{type:'text/html;charset=utf-8'}),name+'.html');
   if(kind==='png'){
    const png=await stage.current?.command('png');
    if(!png?.url)throw new Error('畫布還沒準備完成，請重試。');
    download(png.url,name+'-'+(index+1)+'.png');
   }
   if(printer){
    await printIn(printer,next,()=>setExportState({kind,phase:'busy',message:'正在等待各頁的字型與圖片…'}));
    message='列印畫面已就緒，可在瀏覽器選擇另存 PDF。';
   }
   setExportState({kind,phase:'done',message});
  }catch(error){
   printer?.close();
   setExportState({kind,phase:'error',message:errorText(error)});
  }finally{exportLock.current=false;}
 }
 function pickImage(objectId?:string){
  if(!deck||!slide)return;
  imageIntent.current={deckId:deck.id,slideId:slide.id,objectId};
  image.current?.click();
 }
 async function imagePicked(file?:File){
  const intent=imageIntent.current;
  if(image.current)image.current.value='';
  if(!file||!intent)return;
  try{
   if(!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)||file.size>20*1024*1024)throw new Error('請選擇 20 MiB 以內的 PNG、JPEG、WebP、GIF 或 AVIF。');
   const bitmap=await createImageBitmap(file);const pixels=bitmap.width*bitmap.height;bitmap.close();
   if(pixels>24_000_000)throw new Error('圖片超過 2400 萬像素。');
   const url=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('無法讀取圖片。'));reader.readAsDataURL(file);
   });
   if(project.current.current?.id!==intent.deckId||lastStage.current?.slide!==intent.slideId)throw new Error('已切換投影片，請在要放置圖片的那一頁重新選擇。');
   if(intent.objectId)await stage.current?.command('replace-image',{id:intent.objectId,src:url});
   else await perform('insert',{kind:'image',src:url});
  }catch(error){notify(errorText(error));}
 }
 function updateNote(field:string,value:string){
  const current=project.current.current;
  if(!current)return;
  if(!noteBefore.current)noteBefore.current=clone(current);
  const next=clone(current);
  const note=next.slides.find(s=>s.id===slide?.id)?.note;
  if(!note)return;
  note[field]=field==='talk'?value.split('\n'):field==='minutes'?(value?Math.max(0,Number(value)):undefined):value;
  update(next,false);
 }
 function openDialog(next:DialogName){
  setMenu(undefined);setProjectError('');setDialog(next);
  if(next==='export')setExportState(undefined);
  if(next==='projects')listDecks().then(setProjects).catch(error=>setProjectError(errorText(error)));
 }
 function closeDialog(){setDialog(undefined);}
 function openSample(){
  void openingProject(async()=>{const {openExample}=await import('./example');await openProject(await openExample());});
 }
 const toggleMenu=(which:typeof menu)=>setMenu(current=>current===which?undefined:which);
 const note=slide?.note;
 const compactSide=compact||focusMode;
 const canEdit=!!deck&&stageReady;
 return <div className={'app slides-workbench'+(focusMode?' is-focused':'')} onClick={event=>{
  if(menu&&!(event.target as Element).closest('.action-menu'))setMenu(undefined);
 }}>
  <header className="app-header">
   <div className="brand" aria-label="Canvas Slides"><span className="brand-mark"><i/><i/><i/><i/></span><span>Canvas <b>Slides</b></span></div>
   <Button className="project-button" onClick={()=>openDialog('projects')}>專案</Button>
   {deck&&<div className="document-name">
    <input aria-label="簡報名稱" value={deck.title} onChange={event=>{const value=event.target.value;change(next=>{next.title=value;});}}/>
    <div className={'saved '+(project.status==='failed'?'error':'')} role={project.status==='failed'?'alert':'status'}>
     {project.status==='saving'?'正在保存…':project.status==='saved'?'已存到此瀏覽器':project.issue?.message}
     {project.issue instanceof SaveConflict?<button onClick={()=>openDialog('conflict')}>查看兩份修改</button>:project.issue&&<button onClick={()=>void project.persist(undefined,true).catch(()=>{})}>重試</button>}
     {project.issue&&<><button onClick={()=>openDialog('export')}>匯出備份</button><button disabled={opening} onClick={()=>void keepCopy()}>另存副本</button></>}
    </div>
   </div>}
   <div className="header-actions">
    <Button onClick={showImport}>匯入</Button>
    {deck&&<>
     <div className="action-menu split"><Button aria-label="播放" title={visible?'從目前投影片播放':'沒有可見的投影片'} disabled={!canEdit||!visible} onClick={()=>void play()}>播放</Button>
      <button aria-label="播放選項" aria-expanded={menu==='play'} onClick={()=>toggleMenu('play')}>▾</button>
      {menu==='play'&&<div className="menu-panel">
       {visible?<button disabled={!canEdit} onClick={()=>void play(true)}>從首頁播放</button>:<p>請先恢復至少一頁的顯示。</p>}
      </div>}
     </div>
     <Button className="primary" onClick={()=>openDialog('export')}>匯出</Button>
    </>}
   </div>
  </header>
  {!deck?<main className="welcome">
   <div>
    <h1>開始一份簡報</h1>
    <p>匯入自己的 HTML，或先開啟範例試著改一行字。</p>
    <div className="project-actions">
     <Button className="primary" icon="open" onClick={showImport}>匯入簡報</Button>
     <Button icon="play" disabled={opening} onClick={openSample}>{opening?'正在開啟範例…':'開啟範例'}</Button>
     <Button icon="plus" onClick={()=>openDialog('create')}>新建簡報</Button>
    </div>
    {projectError&&<InlineStatus error>{projectError}</InlineStatus>}
    {projects.length>0&&<><h2>近期專案</h2><div className="recent-list">{projects.map(item=><button key={item.id} onClick={()=>void openingProject(async()=>{const value=await loadDeck(item.id);if(!value)throw new Error('找不到這份專案。');await openProject(value,true);})}>{item.title} · {item.slideCount} 頁</button>)}</div></>}
   </div>
  </main>:<>
   <nav className="toolbar" aria-label="編輯工具">
    <div className="tool-group">
     <Button icon="undo" aria-label="復原 Ctrl+Z" title="復原（Ctrl+Z）" disabled={!history.current.past.length||!canEdit} onClick={()=>void navigateHistory()}>復原</Button>
     <Button icon="redo" aria-label="重做 Ctrl+Shift+Z" title="重做（Ctrl+Shift+Z）" disabled={!history.current.future.length||!canEdit} onClick={()=>void navigateHistory(true)}>重做</Button>
    </div>
    <div className="tool-group">
     <Button icon="plus" disabled={!canEdit||deck.slides.length>=200} onClick={()=>openDialog('templates')}>新增投影片</Button>
     <Button icon="text" disabled={!canEdit} onClick={()=>void perform('insert',{kind:'text'})}>文字</Button>
     <Button icon="image" disabled={!canEdit} onClick={()=>pickImage()}>圖片</Button>
     <div className="action-menu"><Button icon="shape" disabled={!canEdit} aria-expanded={menu==='shape'} onClick={()=>toggleMenu('shape')}>形狀 ▾</Button>
      {menu==='shape'&&<div className="menu-panel">{[['rect','新增矩形'],['circle','新增圓形'],['line','新增線條']].map(([kind,label])=><button key={kind} onClick={()=>{setMenu(undefined);void perform('insert',{kind});}}>{label}</button>)}</div>}
     </div>
    </div>
    <div className="tool-group"><Button icon="grid" onClick={()=>openDialog('overview')}>總覽</Button></div>
    <div className="toolbar-end">
     {compactSide&&<><Button aria-expanded={side==='slides'} aria-controls="slide-rail" onClick={()=>setSide(side==='slides'?undefined:'slides')}>投影片欄</Button>
      <Button aria-expanded={side==='inspector'} aria-controls="slide-inspector" onClick={()=>setSide(side==='inspector'?undefined:'inspector')}>屬性與圖層</Button></>}
     <Button aria-pressed={focusMode} onClick={()=>{setSide(undefined);setFocusMode(!focusMode);}}>{focusMode?'恢復面板':'專注畫布'}</Button>
     <Button aria-label="操作說明" icon="help" onClick={()=>openDialog('help')}>快捷鍵</Button>
    </div>
   </nav>
   <main className="workspace" data-panels={compactSide?'drawer':'pinned'}>
    {compactSide&&side&&<button className="drawer-shade" aria-label="關閉側欄" onClick={()=>setSide(undefined)}/>}
    <aside className="slide-rail" id="slide-rail" aria-label="投影片" hidden={compactSide&&side!=='slides'}>
     <div className="rail-heading"><span>投影片</span><span>{deck.slides.length} 頁</span></div>
     <div className="slide-list">
      {deck.slides.map((item,i)=><button key={item.id} className={'slide-thumb'+(i===index?' active':'')+(item.hidden?' hidden-slide':'')}
       ref={i===0?firstSlide:undefined} aria-current={i===index?'page':undefined} draggable
       onDragStart={event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.id);setDragSlide(item.id);}}
       onDragEnd={()=>setDragSlide(undefined)} onDragOver={event=>{if(dragSlide)event.preventDefault();}}
       onDrop={event=>{event.preventDefault();if(dragSlide)moveSlide(dragSlide,item.id);setDragSlide(undefined);}}
       onClick={()=>void switchSlide(item.id)} onKeyDown={event=>{
        if(event.altKey&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const other=deck.slides[i+(event.key==='ArrowDown'?1:-1)];if(other)moveSlide(item.id,other.id);}
       }}
       aria-label={'投影片 '+(i+1)+' '+(item.note.title||'未命名')+(item.hidden?'，已隱藏':'')}>
       <span className="slide-number">{i+1}</span>
       <div className="thumb-paper">{previews[item.id]?<img src={previews[item.id]} alt=""/>:<div className="thumb-placeholder"><b>{item.note.title||'未命名投影片'}</b></div>}</div>
       <span className="thumb-title" title={item.note.title}>{item.note.title||'未命名投影片'}{item.hidden?' · 已隱藏':''}</span>
      </button>)}
     </div>
    </aside>
    <section className="editor" aria-label="編輯工作台">
     <div className="canvas-heading">
      <span><strong title={note?.title}>{note?.title||'未命名投影片'}</strong><small>第 {index+1} 頁／共 {deck.slides.length} 頁{slide?.hidden?' · 已隱藏':''}</small></span>
      <div className="action-menu"><Button aria-expanded={menu==='slide'} onClick={()=>toggleMenu('slide')}>投影片動作 ▾</Button>
       {menu==='slide'&&<div className="menu-panel">
        <button disabled={deck.slides.length>=200} onClick={()=>slideAction('copy')}>複製投影片</button>
        <button onClick={()=>slideAction('hide')}>{slide?.hidden?'恢復顯示':'播放及輸出時隱藏'}</button>
        <button disabled={index===0} onClick={()=>slideAction('up')}>往前移一頁</button>
        <button disabled={index===deck.slides.length-1} onClick={()=>slideAction('down')}>往後移一頁</button>
        <button disabled={deck.slides.length===1} className="danger" onClick={()=>slideAction('delete')}>刪除投影片</button>
       </div>}
      </div>
     </div>
     <Stage ref={stage} deck={deck} index={index} epoch={epoch} zoom={zoom} forceDOM={forceDOM} onEvent={onEvent} onScale={setScale}/>
     <div className={'speaker-notes '+(notesOpen?'expanded':'')}>
      <button className="notes-toggle" aria-expanded={notesOpen} aria-controls="slide-notes" onClick={()=>setNotesOpen(!notesOpen)}>
       <Icon name="notes" size={16}/><span>講者備註</span><small>{note?.talk.some(Boolean)?'本頁已有提詞':'加入講述重點與轉場'}</small><Icon name="chevron" size={14}/>
      </button>
      {notesOpen&&note&&<div className="notes-fields" id="slide-notes" key={slide!.id}>
       <label>頁面標題<input value={note.title} onChange={event=>updateNote('title',event.target.value)} onBlur={finishNote}/></label>
       <label>本頁目的<input value={note.purpose} onChange={event=>updateNote('purpose',event.target.value)} onBlur={finishNote}/></label>
       <label className="wide">講者提詞（每行一點）<textarea aria-label="講者提詞" value={note.talk.join('\n')} onChange={event=>updateNote('talk',event.target.value)} onBlur={finishNote}/></label>
       <label>轉場<input value={note.transition} onChange={event=>updateNote('transition',event.target.value)} onBlur={finishNote}/></label>
       <label>預計分鐘<input type="number" min="0" step=".1" value={note.minutes??''} onChange={event=>updateNote('minutes',event.target.value)} onBlur={finishNote}/></label>
      </div>}
     </div>
    </section>
    <aside className="inspector" id="slide-inspector" aria-label="屬性與圖層" hidden={compactSide&&side!=='inspector'}>
     <Inspector deck={deck} layers={layers} selection={selection} tab={tab} setTab={setTab} background={background}
      resize={(width,height)=>void withSlideBoundary(()=>change(next=>{next.width=width;next.height=height;}))}
      setTheme={name=>void withSlideBoundary(()=>change(next=>{next.rootAttrs['data-theme']=name;}))}
      replaceImage={()=>pickImage(selection[0]?.id)} perform={(command,payload)=>void perform(command,payload)}/>
    </aside>
   </main>
   <footer className="statusbar">
    <div><span className={'mode-dot '+(native?'native':'')}/>{native===undefined?'舞台載入中':native?'原生畫布':'HTML 相容模式'}
     <button onClick={()=>void withSlideBoundary(()=>{setStageReady(false);setForceDOM(value=>!value);})}>{forceDOM?'切回原生':'使用 HTML'}</button>
     {deck.warnings.length>0&&<button className="warning" onClick={()=>openDialog('help')}>{deck.warnings.length} 項匯入提示</button>}
    </div>
    <div>
     <span className="deck-dimensions">{deck.width} × {deck.height}</span>
     <button aria-label="縮小" onClick={()=>setZoom(Math.max(.15,Number((scale-.1).toFixed(2))))}>−</button>
     <div className="action-menu"><button aria-expanded={menu==='zoom'} onClick={()=>toggleMenu('zoom')}>{zoom===undefined?'適合視窗 · ':''}{Math.round(scale*100)}%</button>
      {menu==='zoom'&&<div className="menu-panel opens-up"><button onClick={()=>{setZoom(undefined);setMenu(undefined);}}>適合視窗</button><button onClick={()=>{setZoom(1);setMenu(undefined);}}>100%</button></div>}
     </div>
     <button aria-label="放大" onClick={()=>setZoom(Math.min(2,Number((scale+.1).toFixed(2))))}>＋</button>
    </div>
   </footer>
  </>}
  <input ref={files} type="file" hidden multiple accept=".html,.htm,.zip,image/*,.css,.woff,.woff2,.ttf" onChange={event=>void pickFiles(event.target.files)}/>
  <input ref={folders} type="file" hidden multiple {...({webkitdirectory:''} as any)} onChange={event=>void pickFiles(event.target.files)}/>
  <input ref={image} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={event=>void imagePicked(event.target.files?.[0])}/>
  <input ref={assets} type="file" hidden multiple {...({webkitdirectory:''} as any)} onChange={event=>void pickFiles(event.target.files,true)}/>
  {toast&&<div className="toast" role="status"><span>{toast}</span><button onClick={()=>setToast('')} aria-label="關閉提示"><Icon name="close" size={15}/></button></div>}
  {dialog&&<Dialog title={titles[dialog]} wide={dialog==='templates'||dialog==='overview'} busy={importBusy||opening||exportState?.phase==='busy'} onClose={closeDialog}>
   {dialog==='create'&&<div className="project-actions">
    <Button disabled={opening} className="primary" onClick={()=>void openingProject(()=>openProject(createDeck('swiss')))}>新建瑞士風簡報</Button>
    <Button disabled={opening} onClick={()=>void openingProject(()=>openProject(createDeck('magazine')))}>新建雜誌風簡報</Button>
   </div>}
   {dialog==='projects'&&<>
    <div className="project-actions"><Button className="primary" icon="plus" onClick={()=>openDialog('create')}>新建簡報</Button><Button onClick={showImport}>匯入簡報</Button><Button disabled={opening} onClick={openSample}>開啟範例</Button></div>
    <h2 className="recent-title">近期專案</h2>
    {!projects.length&&<p className="quiet">還沒有已保存的簡報。</p>}
    <div className="recent-list">{projects.map(item=><div key={item.id}>
     <button disabled={opening} onClick={()=>void openingProject(async()=>{const value=await loadDeck(item.id);if(!value)throw new Error('找不到這份專案。');await openProject(value,true);})}>
      <Icon name="layers"/><span><strong>{item.title||'未命名簡報'}</strong><small>{item.slideCount} 頁 · {new Date(item.updated).toLocaleString('zh-TW')}</small></span>
     </button>
     {item.id!==deck?.id&&<button title="刪除專案" aria-label={'刪除 '+item.title} onClick={()=>{setDeleting(item);openDialog('remove');}}><Icon name="delete" size={16}/></button>}
    </div>)}</div>
   </>}
   {dialog==='remove'&&deleting&&<>
    <p>要刪除「{deleting.title}」的本機副本嗎？</p>
    <div className="modal-bottom"><button onClick={()=>openDialog('projects')}>取消</button><button className="danger" disabled={opening} onClick={()=>void openingProject(async()=>{await removeDeck(deleting.id);openDialog('projects');notify('已刪除本機專案。');})}>刪除專案</button></div>
   </>}
   {dialog==='import'&&<>
    <ol className="import-steps" aria-label="匯入進度">
     <li aria-current={!importCheck?'step':undefined}>{importCheck?'✓':'1'}　選擇來源</li>
     <li aria-current={importCheck?'step':undefined}>2　檢查內容</li>
     <li>3　開始編輯</li>
    </ol>
    {!draft.name&&<div className={'file-drop '+(draggingFile?'is-dragging':'')} onDragOver={event=>{event.preventDefault();if(!importBusy)setDraggingFile(true);}}
     onDragLeave={()=>setDraggingFile(false)} onDrop={event=>{event.preventDefault();setDraggingFile(false);void pickFiles(event.dataTransfer.files);}}>
     <Icon name="open" size={28}/><strong>將 HTML 或 ZIP 拖到這裡</strong>
     <div className="project-actions"><button disabled={importBusy} onClick={()=>files.current?.click()}>選擇檔案</button><button disabled={importBusy} onClick={()=>folders.current?.click()}>選擇資料夾</button></div>
    </div>}
    {draft.name&&<div className="import-file"><Icon name="open"/><strong>{draft.name}</strong></div>}
    {importCheck&&<dl className="import-summary">
     <dt>辨識到的頁數</dt><dd>{importCheck.deck.slides.length} 頁</dd>
     <dt>簡報風格</dt><dd>{familyNames[importCheck.deck.family]}</dd>
     {importCheck.images!==undefined&&<><dt>圖片</dt><dd>{importCheck.images} 張已納入</dd></>}
    </dl>}
    {importCheck?.deck.warnings.length? <details className="import-warnings" open><summary>{importCheck.deck.warnings.length} 項匯入提示</summary>
     <ul>{importCheck.deck.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul>
    </details>:null}
    {importError&&<InlineStatus error>{importError}</InlineStatus>}
    {importBusy&&<InlineStatus>正在檢查檔案與素材…</InlineStatus>}
    {!draft.project&&<details className="advanced-import">
     <summary>{draft.name?'進階設定':'貼上 HTML 或進階設定'}</summary>
     <fieldset disabled={importBusy}>
      {draft.entries.length>1&&<label className="field-label">入口檔案<select value={draft.entry} onChange={event=>{
       const entry=event.target.value,bytes=draft.assets.get(entry);
       if(bytes)inspectImport({...draft,entry,source:new TextDecoder().decode(bytes)});
      }}>{draft.entries.map(entry=><option key={entry}>{entry}</option>)}</select></label>}
      <label className="field-label">頁面容器（留空自動辨識）<input aria-label="頁面容器" placeholder=".slide" value={draft.selector} onChange={event=>{
       setDraft({...draft,selector:event.target.value});setImportCheck(undefined);
      }} onBlur={event=>inspectImport({...draft,selector:event.target.value})}/></label>
      <label className="field-label">HTML 原始碼<textarea className="code-preview" aria-label="匯入 HTML 原始碼" value={draft.source} onChange={event=>{
       setDraft({...draft,source:event.target.value});setImportCheck(undefined);
      }}/></label>
      <button disabled={!draft.source.trim()} onClick={()=>inspectImport({...draft,name:draft.name||'貼上的 HTML'})}>重新檢查內容</button>
     </fieldset>
    </details>}
    {draft.name&&<div className="modal-bottom">
     <div className="project-actions">
      <button disabled={importBusy} onClick={()=>files.current?.click()}>重新選擇</button>
      {!draft.project&&<button disabled={importBusy} onClick={()=>assets.current?.click()}>補入素材資料夾</button>}
     </div>
     <button className="primary" disabled={!importCheck||importBusy} onClick={()=>void acceptImport()}>匯入並開始編輯</button>
    </div>}
   </>}
   {dialog==='templates'&&deck&&<>
    <div className="template-context"><strong>加入到第 {index+1} 頁之後</strong><span>{familyNames[deck.family]}</span></div>
    {deck.family==='generic'?<button onClick={()=>addLayout()}>新增基本投影片</button>:<div className="template-grid">
     {layouts.filter(item=>item.family===deck.family).map(item=><button key={item.id} className="template-card" onClick={()=>addLayout(item.id)}>
      <img src={'previews/'+item.id+'.png'} alt=""/><strong>{item.title.replace(/^\d+\.\s*/,'')}</strong>
     </button>)}
    </div>}
   </>}
   {dialog==='overview'&&deck&&<div className="overview-grid">
    {deck.slides.map((item,i)=><button key={item.id} aria-current={i===index?'page':undefined} onClick={()=>void withSlideBoundary(()=>{
     setSlide(item.id);setDialog(undefined);
     requestAnimationFrame(()=>document.querySelector<HTMLElement>('.canvas-heading .action-menu>button')?.focus());
    })}>
     {previews[item.id]?<img src={previews[item.id]} alt=""/>:<div className="overview-placeholder">{item.note.title}</div>}
     <span>{i+1}　{item.note.title||'未命名投影片'}{item.hidden?' · 已隱藏':''}</span>
    </button>)}
   </div>}
   {dialog==='export'&&deck&&<>
    <div className="export-options">{(Object.keys(formats) as Format[]).map(kind=>{
     const info=formats[kind],scope=kind==='zip'?('全部 '+deck.slides.length+' 頁，含隱藏頁'):kind==='png'?('第 '+(index+1)+' 頁，'+deck.width+' × '+deck.height):visible+' 個可見頁';
     return <button key={kind} disabled={exportState?.phase==='busy'||(kind==='png'&&(!native||!stageReady))||(['html','print'].includes(kind)&&!visible)} onClick={()=>void exportAs(kind)}>
      <span className="export-icon"><Icon name={info.icon} size={22}/></span>
      <span><strong>{info.label}</strong><small>{info.hint} · {scope}</small>{kind==='png'&&!native&&<small>需使用原生畫布。</small>}</span>
      <Icon name="arrow"/>
     </button>;
    })}</div>
    {!visible&&<InlineStatus>所有投影片都已隱藏。恢復至少一頁即可輸出 HTML 或 PDF。</InlineStatus>}
    {exportState&&<InlineStatus error={exportState.phase==='error'}><strong>{formats[exportState.kind].label}</strong>　{exportState.message}
     {exportState.phase==='error'&&<button onClick={()=>void exportAs(exportState.kind)}>重試</button>}
    </InlineStatus>}
   </>}
   {dialog==='help'&&<div className="help-content">
    <p className="app-version">Canvas Slides v{appVersion}</p>
    <p>單擊選取物件，雙擊可編輯文字。按 Shift 可多選，Esc 結束編輯。</p>
    <dl><dt>Ctrl+Z／Ctrl+Shift+Z</dt><dd>復原／重做</dd><dt>Ctrl+S</dt><dd>立即保存</dd><dt>方向鍵／Shift+方向鍵</dt><dd>移動選取物件 1／10 像素</dd><dt>Alt+↑／↓</dt><dd>在縮圖列移動投影片</dd><dt>Delete</dt><dd>刪除選取物件</dd></dl>
    <p>原始排版會隨版型變動。要單獨調整位置，可在屬性欄轉成自由物件。</p>
    {deck?.warnings.length? <><h2>匯入提示</h2><ul>{deck.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul></>:null}
   </div>}
   {dialog==='conflict'&&deck&&project.issue instanceof SaveConflict&&<>
    <p>這些內容在另一個分頁也有修改。選擇後會合併其餘各自的修改。</p>
    <ul>{project.issue.fields.map(field=><li key={field}>{field}</li>)}</ul>
    <div className="version-choices">
     <details><summary>這個分頁 · {deck.title}</summary><ul>{deck.slides.map(item=><li key={item.id}>{item.note.title}<pre>{item.note.talk.join('\n')}</pre></li>)}</ul></details>
     <details><summary>已保存版本 · {project.issue.saved.title}</summary><ul>{project.issue.saved.slides.map(item=><li key={item.id}>{item.note.title}<pre>{item.note.talk.join('\n')}</pre></li>)}</ul></details>
    </div>
    <div className="modal-bottom"><button onClick={()=>openDialog('export')}>備份這個分頁的版本</button><button onClick={()=>void project.persist('saved',true).then(closeDialog).catch(()=>{})}>保留已保存內容</button><button className="primary" onClick={()=>void project.persist('mine',true).then(closeDialog).catch(()=>{})}>保留這個分頁的修改</button></div>
   </>}
   {projectError&&['create','projects','remove'].includes(dialog)&&<InlineStatus error>{projectError}</InlineStatus>}
  </Dialog>}
 </div>;
}

function Bootstrap(){
 const [initial,setInitial]=useState<{deck?:Deck;recent:RecentProject[]}>();
 const [error,setError]=useState('');
 function load(){
  const last=localStorage.getItem('canvas-slides-last');
  setError('');
  Promise.all([last?loadDeck(last):Promise.resolve(undefined),listDecks()]).then(([deck,recent])=>setInitial({deck,recent})).catch(error=>setError(errorText(error)));
 }
 useEffect(load,[]);
 if(error)return <main className="welcome"><div><h1>無法讀取專案</h1><p role="alert">{error}</p><button onClick={load}>重試</button></div></main>;
 return initial?<App initial={initial.deck} recents={initial.recent}/>:<div className="viewer-error" role="status">正在開啟工作室…</div>;
}
createRoot(document.getElementById('root')!).render(<Bootstrap/>);
