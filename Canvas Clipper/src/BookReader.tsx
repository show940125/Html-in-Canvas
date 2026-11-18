import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RichContent, RichEditor } from './RichContent';
import { BookSurface, type BookTurn } from './BookSurface';
import { BookStatus, type BookPhase } from './BookStatus';
import { findPage, paginate, type BookPage } from './pagination';
import { docText, orderedCards, orderedGroups, type Clip, type Project } from './model';

export type ReadingAnchor = NonNullable<Project['readingProgress']>;
interface Props {
  project: Project;
  initialCardId?: string;
  onClose: () => void;
  onRead: (anchor: ReadingAnchor) => void;
  onProgress: (anchor: ReadingAnchor) => void;
  onCard: (id: string, fields: Partial<Clip>) => void;
  motion: boolean;
  forceDOM: boolean;
}

function imageReady(host: HTMLElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const ready = () => Array.from(host.querySelectorAll('[data-asset-id]')).every(element => element.querySelector('img'));
    if (ready()) { resolve(); return; }
    function finish(error?: Error) {
      observer.disconnect();
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    }
    const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
    const observer = new MutationObserver(() => { if (ready()) finish(); });
    const timer = setTimeout(() => finish(new Error('有本機圖片尚未載入。')), 10000);
    observer.observe(host, {childList:true, subtree:true});
    signal.addEventListener('abort', abort, {once:true});
  });
}

export function BookReader({project,initialCardId,onClose,onRead,onProgress,onCard,motion,forceDOM}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const source = useRef<HTMLDivElement>(null);
  const anchor = useRef<Project['readingProgress']>(initialCardId
    ? {cardId:initialCardId, nodePath:[0], offset:0}
    : project.readingProgress);
  const [pages,setPages] = useState<BookPage[]>([]);
  const [index,setIndex] = useState(0);
  const [turn,setTurn] = useState<BookTurn>();
  const [dimensions,setDimensions] = useState({width:innerWidth-96,height:innerHeight-220});
  const [phase,setPhase] = useState<BookPhase>('fonts');
  const [busy,setBusy] = useState(true);
  const [error,setError] = useState('');
  const [attempt,setAttempt] = useState(0);
  const [renderer,setRenderer] = useState('正在準備…');
  const [notes,setNotes] = useState(false);
  const [editing,setEditing] = useState(false);
  const ordered = orderedCards(project);
  const cards = [...orderedGroups(project).flatMap(g => ordered.filter(c => c.groupId===g.id)), ...ordered.filter(c => !c.groupId)];
  const spread = dimensions.width >= 1100 ? 2 : 1;
  const width = Math.max(260,Math.floor(Math.min((dimensions.width-24)/spread,(dimensions.height-16)/Math.SQRT2)));
  const height = Math.floor(width*Math.SQRT2);
  const docKey = JSON.stringify(cards.map(c => [c.id,c.title,c.editedDoc]));
  const current = project.cards.find(c => c.id === pages[index]?.cardId);
  const blocked = busy || !!error;

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([e]) => setDimensions(previous =>
      previous.width === e.contentRect.width && previous.height === e.contentRect.height
        ? previous : {width:e.contentRect.width,height:e.contentRect.height}));
    if (stage.current) observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (editing) return;
    const abort = new AbortController();
    setBusy(true);
    setError('');
    setTurn(undefined);
    setPhase('fonts');
    async function prepare() {
      await document.fonts.ready;
      if (abort.signal.aborted) return;
      const host = source.current!;
      setPhase('images');
      await imageReady(host, abort.signal);
      if (abort.signal.aborted) return;
      try { await Promise.all(Array.from(host.querySelectorAll('img')).map(image => image.decode())); }
      catch { throw new Error('有圖片無法解碼。可以重試，或先繼續閱讀文字。'); }
      if (abort.signal.aborted) return;
      setPhase('pages');
      const elements = Array.from(host.querySelectorAll<HTMLElement>('[data-source-card]')).map(element => ({
        cardId:element.dataset.sourceCard!,title:element.dataset.title!,element:element.querySelector<HTMLElement>('.rich-content')!,
      }));
      const next = await paginate(elements,host,width-64,height-112,abort.signal);
      if (abort.signal.aborted) return;
      const found = findPage(next,anchor.current);
      setIndex(Math.floor(found/spread)*spread);
      setPages(next);
      setRenderer('正在準備…');
      setBusy(false);
    }
    void prepare().catch(cause => {
      if (abort.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : '這份材料暫時無法排頁。');
      setBusy(false);
    });
    return () => abort.abort();
  }, [docKey,width,height,spread,editing,attempt]);
  useEffect(() => {
    const page = pages[index];
    const segment = page?.segments[0];
    if (!page || !segment || blocked) return;
    const previous = anchor.current;
    const spreadPages = pages.slice(index, index + spread);
    if (previous && spreadPages.some(item => item.cardId === previous.cardId && item.segments.some(s =>
      s.nodePath[0] === previous.nodePath[0] && s.start <= previous.offset && (s.end > previous.offset || s.start === s.end)
    ))) {
      const saved = project.readingProgress;
      if (!saved || saved.cardId !== previous.cardId || saved.offset !== previous.offset ||
          saved.nodePath.join('.') !== previous.nodePath.join('.')) onProgress(previous);
      return;
    }
    const next = {cardId:page.cardId,nodePath:segment.nodePath,offset:segment.start};
    anchor.current = next;
    onProgress(next);
  }, [pages,index,blocked]);

  function readNormally() {
    const saved = anchor.current;
    const first = cards[0];
    if (saved && cards.some(card => card.id === saved.cardId)) onRead(saved);
    else if (first) onRead({cardId:first.id,nodePath:[0],offset:0});
  }
  function navigate(direction: number) {
    if (turn || blocked || editing) return;
    const next = Math.max(0,Math.min(Math.floor((pages.length-1)/spread)*spread,index+direction*spread));
    if (next === index) return;
    if (!motion || forceDOM || matchMedia('(prefers-reduced-motion: reduce)').matches || !renderer.startsWith('WebGL')) setIndex(next);
    else setTurn({from:index,to:next,direction,started:performance.now()});
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.isComposing || (e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]')) return;
      if (e.key==='ArrowRight') { e.preventDefault(); navigate(1); }
      if (e.key==='ArrowLeft') { e.preventDefault(); navigate(-1); }
    };
    window.addEventListener('keydown',key);
    return () => window.removeEventListener('keydown',key);
  });
  return <dialog ref={dialog} className="book-dialog" aria-label="書本閱讀" onCancel={onClose}>
    <div className="book-shell" data-book-state={busy ? phase : error ? 'error' : 'ready'}>
      <header className="book-top"><div><h2>{project.title}</h2></div><div>
        <button disabled={!current||blocked} onClick={()=>setNotes(v=>!v)} aria-pressed={notes}>閱讀筆記</button>
        <button disabled={!current||blocked||!!turn} onClick={()=>setEditing(v=>!v)}>{editing?'完成編輯':'編輯這篇'}</button>
        <button aria-label="關閉書本閱讀" onClick={onClose}>×</button>
      </div></header>
      <div className={'book-main '+(notes?'with-notes':'')}>
        <div className="book-stage" ref={stage}>{blocked
          ? <BookStatus phase={phase} error={error} onRetry={()=>{setBusy(true);setError('');setAttempt(n=>n+1);}} onRead={readNormally}/>
          : editing && current
          ? <div className="book-editing"><h2>{current.title}</h2><RichEditor doc={current.editedDoc} onChange={doc=>onCard(current.id,{editedDoc:doc,workingText:docText(doc)})} label="書本文章編輯"/></div>
          : pages.length
          ? <BookSurface pages={pages} index={index} width={width} height={height} spread={spread} turn={turn} forceDOM={forceDOM}
              onFinished={()=>{if(turn){setIndex(turn.to);setTurn(undefined);}}} onRenderer={setRenderer}/>
          : <p>目前沒有可閱讀的材料。</p>}</div>
        {notes&&current&&<aside className="book-notes"><h3>{current.title}</h3><label>我的觀點與待查問題<textarea aria-label="書本閱讀筆記" value={current.note} onCompositionStart={()=>setTurn(undefined)} onChange={e=>onCard(current.id,{note:e.target.value})}/></label><p>筆記自動保存</p></aside>}
      </div>
      <footer className="book-bottom"><span className="book-renderer">{error?'等待重試':busy?'正在準備…':renderer}</span><div inert={blocked}>
        <button aria-label="上一頁" disabled={!index||blocked||!!turn||editing} onClick={()=>navigate(-1)}>← 上一頁</button>
        <output aria-label="閱讀頁碼">{pages.length?index+1:0}{spread===2&&pages[index+1]?'–'+(index+2):''} / {pages.length}</output>
        <button aria-label="下一頁" disabled={index+spread>=pages.length||blocked||!!turn||editing} onClick={()=>navigate(1)}>下一頁 →</button>
      </div><span>選字、連結與筆記皆為真實 HTML</span></footer>
    </div>
    <div ref={source} className="book-measure" aria-hidden="true" inert>{cards.map(c=><section key={c.id} data-source-card={c.id} data-title={(project.groups.find(g=>g.id===c.groupId)?.title||'材料')+' / '+c.title}><RichContent doc={c.editedDoc}/></section>)}</div>
  </dialog>;
}
