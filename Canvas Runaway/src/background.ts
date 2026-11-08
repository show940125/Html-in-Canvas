import {safeUrl,validateCapture,type Capture} from './model';
const busy=new Set<number>();
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
let screenshotQueue:Promise<unknown>=Promise.resolve();
let nextScreenshotAt=0;
function visibleShot(tab:chrome.tabs.Tab):Promise<string>{
 const work=screenshotQueue.then(async()=>{
  await delay(Math.max(0,nextScreenshotAt-Date.now()));
  const active=await chrome.tabs.query({active:true,windowId:tab.windowId});
  if(active[0]?.id!==tab.id)throw new Error('擷取期間分頁已切換，請重試。');
  try{return await chrome.tabs.captureVisibleTab(tab.windowId!,{format:'png'});}
  finally{nextScreenshotAt=Date.now()+650;}
 });
 screenshotQueue=work.then(()=>undefined,()=>undefined);return work;
}
async function message(tabId:number,payload:unknown){const response=await chrome.tabs.sendMessage(tabId,payload);if(!response?.ok)throw new Error(response?.error||'網頁沒有回應。');return response.data;}
async function capture(tab:chrome.tabs.Tab):Promise<Capture>{
 if(!tab.id||!tab.url||!tab.windowId)throw new Error('找不到目前分頁。');safeUrl(tab.url);
 if(busy.has(tab.id))throw new Error('這個分頁正在準備，請稍候。');busy.add(tab.id);
 try{
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
  const metadata=await message(tab.id,{type:'PREPARE'});
  const before=await chrome.tabs.query({active:true,windowId:tab.windowId});if(before[0]?.id!==tab.id)throw new Error('分頁已切換，請回到來源頁重試。');
  const screenshot=await visibleShot(tab);
  // Respect captureVisibleTab's rate limit BEFORE hiding content, keeping the
  // clean-plate capture's visible interruption to its actual capture frame.
  await delay(650);await message(tab.id,{type:'CLEAN'});
  const after=await chrome.tabs.query({active:true,windowId:tab.windowId});if(after[0]?.id!==tab.id)throw new Error('擷取期間分頁已切換，請重試。');
  const clean=await visibleShot(tab);
  // Navigation and scrolling invalidate the pixel-to-block mapping.
  const current=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({url:location.href,w:innerWidth,h:innerHeight})});
  if(current[0]?.result?.url!==metadata.url||current[0]?.result?.w!==metadata.width||current[0]?.result?.h!==metadata.height)throw new Error('頁面已變動，請在畫面穩定後重試。');
  return validateCapture({...metadata,screenshot,clean});
 }finally{await chrome.tabs.sendMessage(tab.id,{type:'RESTORE'}).catch(()=>{});busy.delete(tab.id);}
}
chrome.runtime.onMessage.addListener((request,sender,reply)=>{
 // Only bundled extension pages can capture, persist, or start a session.
 if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('')))return;
 const task=async()=>{
  if(request?.type==='STATUS'){const stored=await chrome.storage.local.get('target');if(!stored.target)return {target:null};try{const t=validateCapture(stored.target);return {target:{title:t.title,url:t.url,capturedAt:t.capturedAt}};}catch{return {target:null};}}
  if(request?.type==='CLEAR_TARGET'){await chrome.storage.local.remove('target');return true;}
  if(!['REMEMBER','BEGIN'].includes(request?.type))throw new Error('未知的操作。');
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id||!tab.url)throw new Error('請切到一般網頁後再使用。');
  safeUrl(tab.url);
  let target:Capture|undefined;
  if(request.type==='BEGIN'&&request.ending==='target'){const stored=await chrome.storage.local.get('target');if(!stored.target)throw new Error('請先到目標網頁，按「設為終點」。');target=validateCapture(stored.target);}
  const shot=await capture(tab);
  if(request.type==='REMEMBER'){if(shot.screenshot.length+shot.clean.length>7_000_000)throw new Error('快照太大，請縮小視窗後再設終點。');await chrome.storage.local.set({target:shot});return {title:shot.title};}
  return message(tab.id,{type:'START',source:shot,ending:target?'target':'empty',target});
 };
 void task().then(data=>reply({ok:true,data}),error=>reply({ok:false,error:error instanceof Error?error.message:String(error)}));return true;
});
