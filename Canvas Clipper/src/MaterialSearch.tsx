import { useEffect, useMemo, useRef, useState } from 'react';
import { docText, sourceLabel, type Clip, type Group } from './model';

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase();

function excerpt(value: string, term: string) {
  const original = value.replace(/\s+/g,' ');
  const matching = normalize(original);
  const text = matching.length === original.length ? original : original.normalize('NFKC');
  const match = Math.max(0,matching.indexOf(term));
  const start = Math.max(0,match-22);
  const end = Math.min(text.length,Math.max(match+term.length+28,start+65));
  return (start ? '…' : '') + text.slice(start,end).trim() + (end<text.length ? '…' : '');
}

export function MaterialSearch({cards,groups,onSelect,onClose}:{
  cards: Clip[]; groups: Group[]; onSelect: (id:string)=>void; onClose:()=>void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query,setQuery] = useState('');
  const [active,setActive] = useState(0);
  const composing = useRef(false);
  const documents = useMemo(() => cards.map(card => {
    const body = docText(card.editedDoc);
    const fields = [['標題',card.title],['筆記',card.note],['全文',body],['來源',card.url]]
      .map(([label,value])=>({label,value,key:normalize(value.replace(/\s+/g,' '))}));
    return {card,fields,body};
  }),[cards]);
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const results = documents.filter(({fields}) => terms.every(term => fields.some(field => field.key.includes(term))));
  const current = Math.min(active,Math.max(0,results.length-1));
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current!;
    element.showModal();
    element.querySelector('input')?.focus();
    return () => {
      element.close();
      requestAnimationFrame(() => { if (!document.querySelector('dialog[open]') && previous instanceof HTMLElement && previous.isConnected) previous.focus({preventScroll:true}); });
    };
  }, []);
  useEffect(() => {
    const option = document.getElementById('search-result-'+current);
    const list = option?.parentElement;
    if (!option || !list) return;
    const item = option.getBoundingClientRect(), bounds = list.getBoundingClientRect();
    if (item.bottom > bounds.bottom) list.scrollTop += item.bottom-bounds.bottom;
    if (item.top < bounds.top) list.scrollTop += item.top-bounds.top;
  }, [current,query]);
  return <dialog ref={dialog} className="app-dialog material-search" aria-labelledby="material-search-title"
    onCancel={e=>{e.preventDefault();if(!composing.current)onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="modal">
      <button className="modal-close" aria-label="關閉搜尋" onClick={onClose}>×</button>
      <h2 id="material-search-title">找一份材料</h2>
      <form onSubmit={e=>{e.preventDefault();}}>
        <input aria-label="搜尋材料" role="combobox" aria-expanded={results.length>0} aria-autocomplete="list"
          aria-controls="search-results" aria-activedescendant={results.length?'search-result-'+current:undefined}
          placeholder="標題、來源、全文或自己的筆記…" value={query}
          onChange={e=>{setQuery(e.target.value);setActive(0);}}
          onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}}
          onKeyDown={e=>{
            if(composing.current||e.nativeEvent.isComposing||e.keyCode===229)return;
            if(e.key==='ArrowDown'||e.key==='ArrowUp'){
              e.preventDefault();
              if(results.length)setActive(i=>(i+(e.key==='ArrowDown'?1:-1)+results.length)%results.length);
            }
            if(e.key==='Enter'&&results[current]){e.preventDefault();onSelect(results[current].card.id);}
          }}/>
      </form>
      <p role="status">{results.length ? results.length+' 份材料' : '沒有符合的材料，試試較短的關鍵字。'}</p>
      <div id="search-results" role="listbox" aria-label="搜尋結果" hidden={!results.length}>
        {results.map(({card,fields,body},index)=>{
          const hit = fields.find(field => terms.some(term=>field.key.includes(term)));
          const group = groups.find(item=>item.id===card.groupId)?.title ?? '未分組';
          const preview = hit ? hit.label+' · '+excerpt(hit.value,terms.find(term=>hit.key.includes(term))??'') : excerpt(card.note||body||sourceLabel(card.url),'');
          return <div className="search-option" id={'search-result-'+index} role="option" aria-selected={index===current} key={card.id}
            onPointerMove={e=>{if(e.pointerType==='mouse')setActive(index);}} onClick={()=>onSelect(card.id)}>
            <strong>{card.title}</strong><span className="search-topic">{group}</span><small>{preview}</small>
          </div>;
        })}
      </div>
      <p className="small">↑ ↓ 選擇 · Enter 定位 · Esc 返回</p>
    </section>
  </dialog>;
}
