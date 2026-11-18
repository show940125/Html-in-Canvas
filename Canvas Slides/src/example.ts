import html from '../examples/vitamin-c-style-a/slides.html?raw';
import css from '../examples/vitamin-c-style-a/deck.css?raw';
import notes from '../examples/vitamin-c-style-a/notes.json';
import fruit from '../examples/vitamin-c-style-a/images/vitamin-c-fruits.png?url';
import meal from '../examples/vitamin-c-style-a/images/everyday-plate.png?url';
import {importHtml} from './importer';
import {template} from './vendor';

export async function openExample(){
 const t=template('magazine');
 const files=await Promise.all([['vitamin-c-fruits.png',fruit],['everyday-plate.png',meal]].map(async ([name,url])=>{
  const response=await fetch(url);
  if(!response.ok)throw new Error('無法載入範例圖片。');
  return [`images/${name}`,new Uint8Array(await response.arrayBuffer())] as const;
 }));
 const source=`<!doctype html><html lang="zh-Hant" data-family="magazine" data-medium="slide" data-theme="forest-ink">
 <title>維他命 C 的好處</title><style>${t.css}\n${css}</style>
 <body class="${t.bodyClass}"><main id="deck">${html}</main>
 <script>const SPEAKER_NOTES=${JSON.stringify(notes)};</script></body></html>`;
 return importHtml(source,new Map(files));
}
