import 'fake-indexeddb/auto';
import {describe,expect,it} from 'vitest';
import {importHtml,mergeAssets,readZip} from '../src/importer';
import {createDeck} from '../src/vendor';
import {clone,duplicateSlide} from '../src/model';
import {mergeDeck,playbackStart,SaveConflict} from '../src/mergeDeck';
import {loadDeck,removeDeck,saveDeck,saveTalk} from '../src/storage';
import {projectZip} from '../src/exporter';

describe('Versioned project saves',()=>{
 it('merges a presenter note with a concurrent editor title, whichever transaction arrives first',async()=>{
  for(const notesFirst of [true,false]){
   const base=await saveDeck(createDeck());
   const id=base.slides[0].id;
   const changed=clone(base);
   changed.title='編輯器的新標題';
   const writeTitle=()=>saveDeck(changed,base);
   const writeNote=()=>saveTalk(base.id,id,base.slides[0].note.talk,['講者提詞']);
   await Promise.all(notesFirst?[writeNote(),writeTitle()]:[writeTitle(),writeNote()]);
   const actual=await loadDeck(base.id);
   expect(actual?.title).toBe('編輯器的新標題');
   expect(actual?.slides[0].note.talk).toEqual(['講者提詞']);
  }
 });

 it('keeps both competing versions and requires reviewing a newer conflict',async()=>{
  const base=await saveDeck(createDeck());
  const mine={...base,title:'這個分頁的標題'};
  const saved=await saveDeck({...base,title:'另一個分頁的標題'},base);
  await expect(saveDeck(mine,base)).rejects.toMatchObject({saved:{title:saved.title}});
  expect((await loadDeck(base.id))?.title).toBe(saved.title);
  await saveTalk(base.id,base.slides[0].id,[],['新的提詞']);
  await expect(saveDeck(mine,base,'mine',saved.updated)).rejects.toBeInstanceOf(SaveConflict);
  const latest=(await loadDeck(base.id))!;
  const resolved=await saveDeck(mine,base,'mine',latest.updated);
  expect(resolved.title).toBe(mine.title);
  expect(resolved.slides[0].note.talk).toEqual(['新的提詞']);
 });

 it('protects a second update to a conflicted presenter note',async()=>{
  const base=await saveDeck(createDeck());
  const id=base.slides[0].id;
  await saveTalk(base.id,id,[],['另一頁的提詞']);
  await expect(saveTalk(base.id,id,[],['我的提詞'])).rejects.toMatchObject({fields:['講者提詞']});
  await saveTalk(base.id,id,['另一頁的提詞'],['更新過的提詞']);
  await expect(saveTalk(base.id,id,[],['我的提詞'],'mine',['另一頁的提詞'])).rejects.toBeInstanceOf(SaveConflict);
  expect(await saveTalk(base.id,id,[],['我的提詞'],'saved',['更新過的提詞'])).toEqual(['更新過的提詞']);
 });

 it('does not recreate a deleted project from an older editor tab',async()=>{
  const base=await saveDeck(createDeck());
  await removeDeck(base.id);
  await expect(saveDeck({...base,title:'仍在編輯'},base)).rejects.toThrow(/刪除/);
  expect(await loadDeck(base.id)).toBeUndefined();
 });

 it('keeps edits to individual notes after reordering',()=>{
  const base=createDeck();
  base.slides.push(duplicateSlide(base.slides[0]));
  const mine=clone(base),saved=clone(base);
  mine.slides.reverse();
  saved.slides[0].note.talk=['第一頁的提詞'];
  const result=mergeDeck(base,mine,saved);
  expect(result.slides.map(slide=>slide.id)).toEqual(mine.slides.map(slide=>slide.id));
  expect(result.slides[1].note.talk).toEqual(['第一頁的提詞']);
 });
});

describe('Workshop recovery actions',()=>{
 it('resolves supplement assets relative to the entry while retaining the original',()=>{
  const photo=new Uint8Array([1,2,3]);
  const source='<section class="slide"><img src="images/fruit.png"></section>';
  const assets=mergeAssets(new Map(),new Map([['images/fruit.png',photo]]),'ppt/index.html');
  const images=new Set<string>();
  const imported=importHtml(source,assets,'ppt/index.html',undefined,images);
  expect(imported.warnings).toEqual([]);
  expect(imported.slides[0].html).toContain('data:image/png;base64,AQID');
  expect(images.size).toBe(1);
  expect(()=>mergeAssets(assets,new Map([['images/fruit.png',new Uint8Array([9])]]),'ppt/index.html')).toThrow(/images\/fruit\.png/);
  expect(assets.get('ppt/images/fruit.png')).toEqual(photo);
 });

 it('starts at the selected visible page, or forward then backward for hidden pages',()=>{
  const deck=createDeck();
  const first=deck.slides[0],second=duplicateSlide(first),third=duplicateSlide(first);
  deck.slides.push(second,third);
  expect(playbackStart(deck,second.id)).toBe(second.id);
  second.hidden=true;
  expect(playbackStart(deck,second.id)).toBe(third.id);
  third.hidden=true;
  expect(playbackStart(deck,third.id)).toBe(first.id);
  first.hidden=true;
  expect(playbackStart(deck,third.id)).toBeUndefined();
  const backup=readZip(projectZip(deck));
  expect(backup['project.json']).toBeDefined();
  expect(backup['presentation.html']).toBeUndefined();
 });
});
