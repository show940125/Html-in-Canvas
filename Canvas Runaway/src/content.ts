import {collect,hideForCleanPlate,restoreCapture} from './capture';
import {safeUrl,validateCapture,type RunOptions} from './model';
import {Stage} from './stage';
const scope=globalThis as typeof globalThis&{__canvasRunawayInstalled?:boolean};
if(!scope.__canvasRunawayInstalled){
 scope.__canvasRunawayInstalled=true;let stage:Stage|undefined;let watchdog=0;
 chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id)return;
  const task=async()=>{
   switch(message?.type){
    case 'PREPARE':stage?.close();restoreCapture();clearTimeout(watchdog);watchdog=window.setTimeout(restoreCapture,6000);return collect();
    case 'CLEAN':hideForCleanPlate();await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));return true;
    case 'RESTORE':restoreCapture();clearTimeout(watchdog);return true;
    case 'START':{
     restoreCapture();clearTimeout(watchdog);stage?.close();const source=validateCapture(message.source);
     const options:RunOptions={ending:message.ending==='target'?'target':'empty'};
     if(options.ending==='target')options.target=validateCapture(message.target);
     stage=new Stage(source,options,url=>{location.href=safeUrl(url);});await stage.init();return {native:stage.root.dataset.nativeCount,snapshot:stage.root.dataset.snapshotCount};
    }
    default:throw new Error('未知的演出操作。');
   }
  };
  void task().then(data=>reply({ok:true,data}),error=>{restoreCapture();clearTimeout(watchdog);reply({ok:false,error:error instanceof Error?error.message:String(error)});});return true;
 });
}
