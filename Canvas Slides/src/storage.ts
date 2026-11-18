import {openDB} from 'idb';
import {clone,type Deck} from './model';
import {sanitizeDeck} from './importer';
import {mergeDeck,SaveConflict,type Resolution} from './mergeDeck';

const db=openDB('canvas-slides',1,{upgrade(database){database.createObjectStore('decks',{keyPath:'id'});}});

export async function saveDeck(draft:Deck,base?:Deck,resolution?:Resolution,conflictVersion?:number){
 const transaction=(await db).transaction('decks','readwrite');
 try{
  const saved=await transaction.store.get(draft.id) as Deck|undefined;
  if(!saved&&base)throw new Error('此專案已從另一個分頁刪除。請匯出備份或另存副本。');
  if(saved&&!base)throw new SaveConflict(saved,['專案']);
  if(saved&&resolution&&conflictVersion!==undefined&&conflictVersion!==saved.updated)
   throw new SaveConflict(saved,['專案在選擇期間又有修改']);
  const result=saved&&base&&saved.updated!==base.updated?mergeDeck(base,draft,saved,resolution):clone(draft);
  result.updated=Math.max(Date.now(),(saved?.updated??0)+1);
  await transaction.store.put(result);
  await transaction.done;
  return result;
 }catch(error){
  await transaction.done.catch(()=>{});
  throw error;
 }
}

export async function saveTalk(deckId:string,slideId:string,before:string[],talk:string[],resolution?:Resolution,conflictTalk?:string[]){
 const transaction=(await db).transaction('decks','readwrite');
 try{
  const saved=await transaction.store.get(deckId) as Deck|undefined;
  const slide=saved?.slides.find(s=>s.id===slideId);
  if(!saved||!slide)throw new Error('找不到原投影片。請先複製這段提詞。');
  if(resolution&&JSON.stringify(conflictTalk)!==JSON.stringify(slide.note.talk))
   throw new SaveConflict(saved,['講者提詞在選擇期間又有修改']);
  if(JSON.stringify(before)!==JSON.stringify(slide.note.talk)&&JSON.stringify(talk)!==JSON.stringify(slide.note.talk)&&!resolution)
   throw new SaveConflict(saved,['講者提詞']);
  if(resolution!=='saved'){
   slide.note.talk=talk;
   saved.updated=Math.max(Date.now(),saved.updated+1);
   await transaction.store.put(saved);
  }
  await transaction.done;
  return slide.note.talk;
 }catch(error){
  await transaction.done.catch(()=>{});
  throw error;
 }
}

export type RecentProject={id:string;title:string;updated:number;slideCount:number};
export async function listDecks():Promise<RecentProject[]>{
 const rows:RecentProject[]=[];
 let cursor=await (await db).transaction('decks').store.openCursor();
 while(cursor){
  const {id,title,updated,slides}=cursor.value as Deck;
  rows.push({id,title,updated,slideCount:slides.length});
  cursor=await cursor.continue();
 }
 return rows.sort((a,b)=>b.updated-a.updated);
}
export async function loadDeck(id:string){
 const value=await(await db).get('decks',id);
 return value?sanitizeDeck(value):undefined;
}
export async function removeDeck(id:string){await(await db).delete('decks',id);}
