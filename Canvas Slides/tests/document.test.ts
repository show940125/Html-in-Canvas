import {describe,it,expect} from 'vitest';
import {strToU8,zipSync} from 'fflate';
import {importHtml,readNotes,readZip,safeHtml,sanitizeDeck} from '../src/importer';
import {History,duplicateSlide,validateDeck} from '../src/model';
import {createDeck,layouts} from '../src/vendor';
import {exportHtml,projectZip} from '../src/exporter';
import {exportPrintHtml} from '../src/printing';
describe('HTML import and preservation',()=>{
 it.each(['magazine','swiss'] as const)('honors declared %s family despite shared CSS tokens',family=>{const html=exportHtml(createDeck(family));expect(html).toContain('--accent-on');expect(importHtml(html).family).toBe(family);});
 it('recognizes a legacy magazine deck without treating shared tokens as Swiss',()=>expect(importHtml('<style>:root{--accent-on:white}</style><section class="slide"><h1>雜誌</h1></section><script>window.__playSlide=function(){}</script>').family).toBe('magazine'));
 it('preserves slide structure, inline formatting, CSS and stable notes without running code',()=>{
  const d=importHtml('<title>範例</title><style>.slide{display:grid}.important{color:red}</style><div id="deck"><section class="slide" data-slide-id="one"><h1>繁體<strong class="important">中文</strong></h1></section><section class="slide" data-slide-id="two"><p>第二頁</p></section></div><script>const SPEAKER_NOTES=[{id:"one",title:"標題",purpose:"目的",talk:["說明"],transition:"下一頁"}];window.shouldNeverRun=true</script>');
  expect(d.title).toBe('範例');expect(d.slides).toHaveLength(2);expect(d.slides[0].id).toBe('one');expect(d.slides[0].html).toContain('<strong class="important">中文</strong>');expect(d.slides[0].note.talk).toEqual(['說明']);expect(d.css).toContain('display:grid');expect((window as any).shouldNeverRun).toBeUndefined();expect(d.warnings[0]).toContain('腳本');
 });
 it('rejects dynamic note expressions without evaluating them',()=>expect(readNotes('const SPEAKER_NOTES=(()=>{throw new Error("run")})()')).toEqual([]));
 it('supports nested reveal sections as one top-level page',()=>expect(importHtml('<div class="reveal"><div class="slides"><section><section>nested</section></section></div></div>').slides).toHaveLength(1));
 it('preserves root CSS variables and theme classes',()=>{const d=importHtml('<html class="dark" style="--brand:#315d93"><body><section class="slide">theme</section></body></html>');expect(d.rootStyle).toContain('--brand:#315d93');expect(d.rootAttrs.class).toBe('dark');expect(exportHtml(d)).toContain('--brand:#315d93');});
 it('resolves relative stylesheet images against the stylesheet location',()=>{
  const files=new Map([['ppt/assets/main.css',strToU8('.slide{background:url(../images/p.png)}')],['ppt/images/p.png',new Uint8Array([1,2,3])]]);
  const d=importHtml('<link rel="stylesheet" href="assets/main.css"><section class="slide">Hi</section>',files,'ppt/index.html');expect(d.css).toContain('data:image/png;base64,AQID');
 });
 it('requires a matching explicit page selector',()=>expect(()=>importHtml('<section>test</section>',new Map(),'index.html','[')).toThrow());
 it('removes executable HTML and embedded documents',()=>{const html=safeHtml('<section class="slide"><img src="x" onerror="alert(1)"><iframe srcdoc="a"></iframe><script>alert(1)</script><svg><foreignObject>bad</foreignObject></svg><p data-anim="left">safe</p></section>');expect(html).not.toMatch(/onerror|iframe|script|foreignObject/);expect(html).toContain('data-anim="left"');});
 it('normalizes backup HTML at its trust boundary',()=>{const d=createDeck();d.slides[0].html+='<img onerror="alert(1)">';expect(sanitizeDeck(d).slides[0].html).not.toContain('onerror');});
});
describe('History and identity',()=>{
 it('undo and redo retain later note changes in the snapshot',()=>{const before=createDeck();const h=new History();h.push(before);const after=structuredClone(before);after.slides[0].note.talk=['later'];expect(h.undo(after)?.slides[0].note.talk).toEqual([]);expect(h.redo(before)?.slides[0].note.talk).toEqual(['later']);});
 it('copies slide and object identities independently',()=>{const s=createDeck().slides[0];s.html+='<p data-cs-id="node">text</p>';const copy=duplicateSlide(s);expect(copy.id).not.toBe(s.id);expect(copy.html).not.toContain('data-cs-id="node"');expect(copy.note).toEqual(s.note);});
 it('rejects duplicate page ids and unsupported schemas',()=>{const d=createDeck();d.slides.push(d.slides[0]);expect(()=>validateDeck(d)).toThrow();expect(()=>validateDeck({...d,schema:2})).toThrow();});
});
describe('Export and layout integration',()=>{
 it('prints every visible slide in its own fixed viewport without playback scripts',()=>{const d=createDeck('magazine');d.slides.push(duplicateSlide(d.slides[0]));d.slides.push({...duplicateSlide(d.slides[0]),hidden:true});const doc=new DOMParser().parseFromString(exportPrintHtml(d),'text/html');const frames=[...doc.querySelectorAll('iframe')];expect(frames).toHaveLength(2);expect(doc.querySelectorAll('script')).toHaveLength(0);for(const f of frames){const inner=new DOMParser().parseFromString(f.getAttribute('srcdoc')!,'text/html');expect(inner.querySelectorAll('.slide')).toHaveLength(1);expect(inner.querySelectorAll('script')).toHaveLength(0);}expect(doc.querySelector('style')!.textContent).toContain('1280px 720px');});
 it('preserves theme, root styles and custom background across the print boundary',()=>{const d=createDeck('magazine');d.rootAttrs['data-theme']='forest-ink';d.rootStyle='--custom:#245b38';d.slides[0].html='<section class="slide dark" data-cs-background="solid" style="background:#2a543b"><h1>綠色</h1></section>';const doc=new DOMParser().parseFromString(exportPrintHtml(d),'text/html');const inner=new DOMParser().parseFromString(doc.querySelector('iframe')!.getAttribute('srcdoc')!,'text/html');expect(inner.documentElement.dataset.theme).toBe('forest-ink');expect(inner.documentElement.style.getPropertyValue('--custom')).toBe('#245b38');expect(inner.querySelector('.slide')!.getAttribute('data-cs-background')).toBe('solid');});
 it('escapes srcdoc boundaries and removes imported executable content from printing',()=>{const d=createDeck();d.slides[0].html='<section class="slide"><h1>&quot;&gt;字串</h1><script>alert(1)</script><img onerror="alert(1)"></section>';const doc=new DOMParser().parseFromString(exportPrintHtml(d),'text/html');expect(doc.querySelectorAll('iframe')).toHaveLength(1);expect(doc.querySelectorAll('script,img')).toHaveLength(0);const source=doc.querySelector('iframe')!.getAttribute('srcdoc')!;expect(source).not.toContain('onerror');expect(source).not.toContain('<script>');});
 it('rejects an all-hidden print document',()=>{const d=createDeck();d.slides[0].hidden=true;expect(()=>exportPrintHtml(d)).toThrow(/至少/);});
 it('pins two families with 32 registered choices',()=>{expect(layouts.filter(l=>l.family==='swiss')).toHaveLength(22);expect(layouts.filter(l=>l.family==='magazine')).toHaveLength(10);expect(new Set(layouts.map(l=>l.id)).size).toBe(32);});
 it('round-trips the complete project with original and notes',()=>{const d=createDeck();d.original='<script>raw source retained only</script>';d.slides[0].note.talk=['提詞'];const entries=readZip(projectZip(d));const restored=JSON.parse(new TextDecoder().decode(entries['project.json']));expect(restored.original).toBe(d.original);expect(restored.slides[0].note.talk).toEqual(['提詞']);expect(entries['presentation.html'].length).toBeGreaterThan(1000);});
 it('excludes hidden pages while preserving source project',()=>{const d=createDeck();const other=duplicateSlide(d.slides[0]);other.html='<section class="slide">UNIQUE_HIDDEN</section>';other.hidden=true;d.slides.push(other);expect(exportHtml(d)).not.toContain('UNIQUE_HIDDEN');expect(d.slides).toHaveLength(2);});
 it('escapes a note attempting to terminate a script tag',()=>{const d=createDeck();d.slides[0].note.talk=['</script><script>window.hacked=1</script>'];expect(exportHtml(d)).not.toContain('</script><script>window.hacked=1');});
 it('rejects traversing zip paths and oversized entries before decompression',()=>{expect(()=>readZip(zipSync({'../evil.html':strToU8('bad')}))).toThrow(/路徑/);});
 it('refuses an all-hidden presentation',()=>{const d=createDeck();d.slides[0].hidden=true;expect(()=>exportHtml(d)).toThrow(/至少/);});
});
