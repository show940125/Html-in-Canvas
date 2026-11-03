import { Readability } from '@mozilla/readability';
import { MAX_TEXT, docText, type Capture } from './model';
import { htmlToDoc } from './rich';
// Programmatically injected only after the user's article-import gesture.
(globalThis as typeof globalThis & { __clipperCaptureResult?: unknown }).__clipperCaptureResult = (() => {
  try {
    const clone = document.cloneNode(true) as Document;
    clone.querySelectorAll('script,style,noscript,iframe,form').forEach(el => el.remove());
    const article = new Readability(clone, { serializer: element => element, maxElemsToParse: 100_000 }).parse();
    if (!article?.content) return { ok: false, error: '找不到文章正文。請選取需要的文字，使用右鍵加入整理台。' };
    const root = article.content as unknown as HTMLElement;
    const doc=htmlToDoc(root.innerHTML,location.href);
    const text = docText(doc);
    if (!text || text.length > MAX_TEXT) return { ok: false, error: '文章為空或超過 50 萬字元，請改用選取文字摘錄。' };
    const capture: Capture = { kind: 'article', title: article.title || document.title || '網頁文章', text, doc, url: location.href, capturedAt: new Date().toISOString() };
    return { ok: true, capture };
  } catch (error) { return { ok: false, error: '文章擷取失敗：' + String(error) }; }
})();
