import {useEffect,useRef,useState} from 'react';
import {docText,type Clip} from './model';
export function MaterialSearch({cards,onSelect,onClose}:{cards:Clip[];onSelect:(id:string)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[query,setQuery]=useState(''),[active,setActive]=useState(0);
 const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase();
 const terms=normalize(query).trim().split(/\s+/).filter(Boolean),results=cards.filter(c=>terms.every(t=>normalize([c.title,c.url,c.note,docText(c.editedDoc)].join(' ')).includes(t)));
 const current=Math.min(active,Math.max(0,results.length-1));
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close()},[]);
 useEffect(()=>{setActive(0)},[query]);
 useEffect(()=>{document.getElementById('search-result-'+current)?.scrollIntoView({block:'nearest'})},[current]);
 return <dialog ref={dialog} className="app-dialog material-search" aria-labelledby="material-search-title" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose()}}><section className="modal"><button className="modal-close" aria-label="關閉搜尋" onClick={onClose}>×</button><h2 id="material-search-title">找一份材料</h2><input autoFocus aria-label="搜尋材料" role="combobox" aria-expanded="true" aria-controls="search-results" aria-activedescendant={results.length?'search-result-'+current:undefined} placeholder="標題、來源、全文或自己的筆記…" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(results.length)setActive(i=>(i+(e.key==='ArrowDown'?1:-1)+results.length)%results.length)}if(e.key==='Enter'&&results[current]){e.preventDefault();onSelect(results[current].id)}}}/><p role="status">{results.length} 份材料</p><div id="search-results" role="listbox" aria-label="搜尋結果">{results.map((c,i)=><div id={'search-result-'+i} role="option" aria-selected={i===current} key={c.id}><button onClick={()=>onSelect(c.id)} onPointerMove={()=>setActive(i)}><strong>{c.title}</strong><small>{c.note||c.url||'自己的筆記'}</small></button></div>)}</div>{!results.length&&<p>沒有符合的材料，試試較短的關鍵字。</p>}<p className="small">↑ ↓ 選擇 · Enter 定位 · Esc 返回</p></section></dialog>
}
