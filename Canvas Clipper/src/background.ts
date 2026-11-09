import { createClip, validateCapture, type Capture } from './model';
import { currentProject, getProject, updateProject } from './storage';
import { imageAsset, MAX_IMAGE_BYTES } from './assets';
import { putAsset } from './storage';
let captureQueue: Promise<unknown> = Promise.resolve();
async function openWorkspace(id?: string, error?: string, clipId?: string) {
  const base = chrome.runtime.getURL('index.html');
  const query = new URLSearchParams();
  if (error) query.set('error', error);
  if (clipId) query.set('clip', clipId);
  const url = base + (query.size ? '?' + query.toString() : '') + (id ? '#project=' + encodeURIComponent(id) : '');
  const existing = (await chrome.tabs.query({})).find(t => t.url?.startsWith(base));
  if (existing?.id) { await chrome.tabs.update(existing.id, { active: true, ...(existing.url === url ? {} : { url }) }); if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true }); }
  else await chrome.tabs.create({ url });
}
async function captureToProject(value: unknown, projectId?: string, openAfterCapture = true) {
  const capture = validateCapture(value);
  const work = captureQueue.then(async () => {
    const active = projectId ? await getProject(projectId) : await currentProject();
    if (!active) throw new Error('找不到目的專案，請重新選擇後再收集。');
    let clipId = '';
    const project = await updateProject(active.id, p => {const card=createClip(capture,p.cards.length);clipId=card.id;return{...p,cards:[...p.cards,card],outline:{...p.outline,cardIds:[...p.outline.cardIds,card.id]}};});
    if (openAfterCapture) await openWorkspace(project.id, undefined, clipId);
    return { ok: true, projectId: project.id, projectTitle: project.title, clipId };
  });
  captureQueue = work.catch(() => undefined);
  return work;
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'clip-selection', title: '加入 Canvas Clipper 摘錄整理台', contexts: ['selection'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
    chrome.contextMenus.create({ id: 'clip-image', title: '將圖片加入 Canvas Clipper', contexts: ['image'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
  });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'clip-image') {
    const capture:Capture={kind:'manual',title:tab?.title||'網頁圖片',text:'',url:info.pageUrl||'',capturedAt:new Date().toISOString(),doc:{type:'doc',content:[{type:'image',attrs:{sourceUrl:info.srcUrl,alt:'網頁圖片',status:'pending'}}]}};
    void captureToProject(capture).catch(error=>openWorkspace(undefined,String(error)));return;
  }
  if (info.menuItemId !== 'clip-selection') return;
  const capture: Capture = { kind: 'selection', title: tab?.title || '網頁摘錄', text: info.selectionText || '', url: info.frameUrl || info.pageUrl || '', capturedAt: new Date().toISOString() };
  void(async()=>{
    if(tab?.id&&(!info.frameId||info.frameId===0)){
      try{await chrome.scripting.executeScript({target:{tabId:tab.id},files:['selection.js']});const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{const s=globalThis as typeof globalThis&{__clipperSelection?:Capture['doc']};const result=s.__clipperSelection;delete s.__clipperSelection;return result;}});capture.doc=result[0]?.result;}catch{/* Browser-provided selectionText remains the usable capture. */}
    }
    return captureToProject(capture);
  })().catch(error => openWorkspace(undefined, String(error)));
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only our extension pages issue commands; no externally_connectable surface.
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  const task = async () => {
    if (message?.type === 'OPEN_WORKSPACE') { await openWorkspace((await currentProject()).id); return { ok: true }; }
    if (message?.type === 'OPEN_CAPTURED_CLIP') {
      const project = typeof message.projectId === 'string' ? await getProject(message.projectId) : undefined;
      if (!project || typeof message.clipId !== 'string' || !project.cards.some(card => card.id === message.clipId)) throw new Error('找不到這份材料，請開啟整理台確認。');
      await openWorkspace(project.id, undefined, message.clipId);
      return { ok: true };
    }
    if (message?.type === 'FETCH_IMAGE') {
      const url=typeof message.url==='string'?message.url:'';
      if(!/^https?:\/\//i.test(url))throw new Error('圖片網址無效。');
      if(!await chrome.permissions.contains({origins:[new URL(url).origin+'/*']}))throw new Error('請先在材料中授權這個圖片來源。');
      const response=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error('圖片下載失敗：HTTP '+response.status);
      if(Number(response.headers.get('content-length'))>MAX_IMAGE_BYTES)throw new Error('圖片超過 10 MB。');
      const reader=response.body?.getReader();if(!reader)throw new Error('圖片內容為空。');
      const chunks:Uint8Array[]= [];let size=0;
      while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_IMAGE_BYTES){await reader.cancel();throw new Error('圖片超過 10 MB。');}chunks.push(part.value);}
      const blob=new Blob(chunks.map(c=>c.slice().buffer),{type:(response.headers.get('content-type')||'').split(';')[0]});
      const asset=await imageAsset(blob,url);await putAsset(asset);return{ok:true,asset:{id:asset.id,width:asset.width,height:asset.height}};
    }
    if (message?.type === 'CAPTURE_ARTICLE') {
      if (message.projectId !== undefined && (typeof message.projectId !== 'string' || !message.projectId || !await getProject(message.projectId))) throw new Error('找不到目的專案，請重新選擇後再收集。');
      const id = message.tabId;
      if (!Number.isInteger(id)) throw new Error('找不到來源分頁。');
      const tab = await chrome.tabs.get(id);
      if (!tab.url || !/^https?:\/\//i.test(tab.url) || /\.pdf(?:[?#]|$)/i.test(tab.url)) throw new Error('請在一般 HTTP／HTTPS 文章頁使用；PDF 與瀏覽器內部頁面請改用手動貼上。');
      await chrome.scripting.executeScript({ target: { tabId: id }, files: ['extract.js'] });
      const results = await chrome.scripting.executeScript({ target: { tabId: id }, func: () => {
        const scope = globalThis as typeof globalThis & { __clipperCaptureResult?: { ok: boolean; error?: string; capture?: unknown } };
        const result = scope.__clipperCaptureResult;
        delete scope.__clipperCaptureResult;
        return result;
      } });
      const result = results[0]?.result;
      if (!result?.ok) throw new Error(result?.error || '無法讀取正文，請改用右鍵摘錄。');
      return captureToProject(result.capture, message.projectId, message.openAfterCapture !== false);
    }
    throw new Error('未知的操作。');
  };
  void task().then(respond, error => respond({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
