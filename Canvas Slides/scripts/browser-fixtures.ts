import {mkdirSync,writeFileSync} from 'node:fs';
import {createDeck,layouts,fromLayout} from '../src/vendor';
import {exportHtml} from '../src/exporter';
mkdirSync('output/playback',{recursive:true});
for(const family of ['swiss','magazine'] as const){const deck=createDeck(family);deck.title=`${family} 全版型播放驗收`;deck.slides=layouts.filter(l=>l.family===family).map(fromLayout);deck.slides.forEach((s,i)=>{s.note.title=`${i+1} · ${s.note.title}`;s.note.talk=['第一個講述重點','第二個講述重點'];s.note.purpose='驗證頁面與備註對應';s.note.transition='接續下一頁';});writeFileSync(`output/playback/${family}.html`,exportHtml(deck));}
