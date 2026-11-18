import {useEffect,useRef,useState} from 'react';
import type {Deck} from './model';
import {mergeDeck,SaveConflict,type Resolution} from './mergeDeck';
import {loadDeck,saveDeck} from './storage';

export function useDeckDraft(initial:Deck|undefined,onSync:(draft:Deck,saved:Deck)=>void){
 const [deck,setDeck]=useState(initial);
 const [status,setStatus]=useState<'saved'|'saving'|'failed'>('saved');
 const [issue,setIssue]=useState<Error>();
 const [stageDirty,setStageDirty]=useState(false);
 const current=useRef(initial),base=useRef(initial),pending=useRef<Error|undefined>(undefined);
 const queue=useRef<Promise<unknown>>(Promise.resolve());
 const held=useRef(false);
 function hold(value:boolean){held.current=value;setStageDirty(value);}

 function replace(value:Deck){
  current.current=value;
  setDeck(value);
  if(!pending.current)setStatus(value===base.current?'saved':'saving');
 }
 function report(error:Error){
  pending.current=error;
  setIssue(error);
  setStatus('failed');
 }
 function open(value:Deck,saved:boolean){
  base.current=saved?value:undefined;
  pending.current=undefined;
  setIssue(undefined);
  replace(value);
 }
 function persist(resolution?:Resolution,retry=false){
  const id=current.current?.id,expected=retry?pending.current:undefined;
  const task=queue.current.catch(()=>{}).then(async()=>{
   const draft=current.current;
   if(!draft||draft.id!==id)return undefined;
   if(held.current)return draft;
   if(pending.current&&(!retry||pending.current!==expected))throw pending.current;
   const before=base.current;
   try{
    if(draft===before){
     const latest=await loadDeck(draft.id);
     if(!latest)throw new Error('此專案已從另一個分頁刪除。');
     if(!held.current&&current.current===draft&&latest.updated!==draft.updated){
      base.current=latest;
      onSync(draft,latest);
      replace(latest);
     }
     return current.current;
    }
    setStatus('saving');
    const saved=await saveDeck(draft,before,resolution,expected instanceof SaveConflict?expected.saved.updated:undefined);
    if(current.current?.id!==id)return saved;
    if(held.current){
     // Another edit has already started in the iframe. Keep its original baseline
     // until its DOM commits, so a same-slide remote edit is still detected.
     base.current={...draft,updated:before?.updated??-1};
     pending.current=undefined;
     setIssue(undefined);
     return current.current;
    }
    onSync(draft,saved);
    const latest=current.current!;
    // Rebase edits entered while IndexedDB was saving the earlier snapshot.
    if(latest!==draft){
     try{
      const rebased=mergeDeck(draft,latest,saved);
      base.current=saved;
      pending.current=undefined;
      setIssue(undefined);
      replace(rebased);
     }catch(error){
      base.current={...draft,updated:before?.updated??-1};
      throw error;
     }
    }else{
     base.current=saved;
     pending.current=undefined;
     setIssue(undefined);
     replace(saved);
    }
    return current.current;
   }catch(error){
    if(current.current?.id===id)report(error instanceof Error?error:new Error(String(error)));
    throw error;
   }
  });
  queue.current=task;
  return task;
 }
 useEffect(()=>{
  if(!deck||deck===base.current||issue||held.current)return;
  const timer=setTimeout(()=>{void persist().catch(()=>{});},350);
  return()=>clearTimeout(timer);
 },[deck,issue,stageDirty]);
 useEffect(()=>{
  function protect(event:BeforeUnloadEvent){
   if(current.current!==base.current||held.current)event.preventDefault();
  }
  addEventListener('beforeunload',protect);
  return()=>removeEventListener('beforeunload',protect);
 },[]);
 return {deck,current,base,held,hold,status:stageDirty&&status!=='failed'?'saving' as const:status,issue,replace,open,persist};
}
