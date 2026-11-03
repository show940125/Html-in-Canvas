import { zipSync, unzipSync, strFromU8, strToU8 } from 'fflate';
import { importProject, validateProject, walkImages, type Project } from './model';
import { getAsset, getPreference, listProjects, saveImported, setPreference, type Asset } from './storage';
import { imageAsset, MAX_IMAGE_BYTES } from './assets';
const MAX_BACKUP=250*1024*1024;
export async function makeBackup(projects:Project[]):Promise<Blob>{
  const ids=new Set(projects.flatMap(p=>p.cards.flatMap(c=>[...walkImages(c.originalDoc),...walkImages(c.editedDoc)].map(n=>String(n.attrs?.assetId||'')).filter(Boolean))));
  const assets:Asset[]=[];
  for(const id of ids){const asset=await getAsset(id);if(!asset)throw new Error('備份缺少圖片資源：'+id.slice(0,12));assets.push(asset);}
  const manifest={format:'canvas-clipper-workspace',version:3,exportedAt:new Date().toISOString(),projects:projects.map(p=>({...p,title:p.title.trim()||'未命名專案'})),assets:assets.map(({blob,...info})=>info)};
  const manifestBytes=strToU8(JSON.stringify(manifest));
  if(manifestBytes.length>30_000_000)throw new Error('專案文字總量超過單份備份限制，請分開備份。');
  const entries:Parameters<typeof zipSync>[0]={'manifest.json':[manifestBytes,{level:6}]};
  let total=manifestBytes.length;
  for(const asset of assets){total+=asset.blob.size;if(total>MAX_BACKUP)throw new Error('圖片總量超過 250 MB，請分別備份各專案。');entries['assets/'+asset.id]=[new Uint8Array(await asset.blob.arrayBuffer()),{level:0}];}
  const zipped=zipSync(entries);if(zipped.length>MAX_BACKUP)throw new Error('備份總量超過 250 MB，請分開備份。');
  return new Blob([zipped.slice().buffer],{type:'application/zip'});
}
export async function restoreBackup(file:Blob):Promise<Project[]>{
  if(file.size>MAX_BACKUP)throw new Error('備份檔超過 250 MB，請使用分開的專案備份。');
  const bytes=new Uint8Array(await file.arrayBuffer());
  let raw:unknown,files:Record<string,Uint8Array>={};
  if(bytes[0]===80&&bytes[1]===75){let total=0,count=0;files=unzipSync(bytes,{filter:entry=>{
    if(++count>5000||!/^manifest\.json$|^assets\/[a-f0-9]{64}$/.test(entry.name))throw new Error('備份含無效路徑或過多檔案。');
    total+=entry.originalSize;if(total>MAX_BACKUP||entry.originalSize>(entry.name==='manifest.json'?30_000_000:MAX_IMAGE_BYTES))throw new Error('備份解壓大小超過限制。');return true;
  }});if(!files['manifest.json'])throw new Error('備份缺少 manifest。');raw=JSON.parse(strFromU8(files['manifest.json']));}
  else {if(bytes.length>30_000_000)throw new Error('JSON 備份過大。');raw=JSON.parse(strFromU8(bytes));}
  if(!raw||typeof raw!=='object')throw new Error('備份格式不正確。');
  const doc=raw as {format:string;version:number;projects?:unknown[];assets?:Omit<Asset,'blob'>[]};
  let projects:Project[];
  if(doc.format==='canvas-clipper')projects=[importProject(JSON.stringify(raw))];
  else if(doc.format==='canvas-clipper-workspace'&&[1,2,3].includes(doc.version)&&Array.isArray(doc.projects)&&doc.projects.length<=1000)projects=doc.projects.map(p=>validateProject(p));
  else throw new Error('這不是支援的備份版本。');
  const assets:Asset[]=[];
  if(doc.version>=2&&doc.format==='canvas-clipper-workspace'){
    if(!Array.isArray(doc.assets))throw new Error('備份缺少圖片清單。');
    for(const info of doc.assets){if(!/^[a-f0-9]{64}$/.test(info.id)||!files['assets/'+info.id])throw new Error('備份遺失圖片。');const blob=new Blob([files['assets/'+info.id].slice().buffer],{type:info.mime});const a=await imageAsset(blob,info.sourceUrl);if(a.id!==info.id)throw new Error('圖片雜湊不符，備份可能損壞。');assets.push(a);}
  }
  const included=new Set(assets.map(a=>a.id));
  for(const p of projects)for(const c of p.cards)for(const n of [...walkImages(c.originalDoc),...walkImages(c.editedDoc)]){const id=String(n.attrs?.assetId||'');if(id&&!included.has(id)&&!await getAsset(id))throw new Error('備份遺失卡片使用的圖片。');}
  await saveImported(projects,assets);return projects;
}
export async function chooseBackupFolder(){if(!('showDirectoryPicker'in window))throw new Error('這個瀏覽器未提供資料夾選擇，請使用下載備份。');const handle=await(window as unknown as {showDirectoryPicker:(options:unknown)=>Promise<FileSystemDirectoryHandle>}).showDirectoryPicker({mode:'readwrite',id:'canvas-clipper-backups'});await setPreference('backupFolder',handle);return handle.name;}
export async function backupToFolder(projects?:Project[]){
  const handle=await getPreference<FileSystemDirectoryHandle&{queryPermission:(o:unknown)=>Promise<string>;requestPermission:(o:unknown)=>Promise<string>}>('backupFolder');
  if(!handle)throw new Error('請先選定備份資料夾。');
  if(await handle.queryPermission({mode:'readwrite'})!=='granted'&&await handle.requestPermission({mode:'readwrite'})!=='granted')throw new Error('備份資料夾尚未授權，請重新選取或下載備份。');
  const blob=await makeBackup(projects||await listProjects());
  const name='canvas-clipper-'+new Date().toISOString().replace(/[:.]/g,'-')+'.zip';
  const file=await handle.getFileHandle(name,{create:true});const writer=await file.createWritable();try{await writer.write(blob);await writer.close();}catch(error){await writer.abort().catch(()=>undefined);throw error;}
  const result={name,folder:handle.name,time:new Date().toISOString()};await setPreference('lastBackup',result);return result;
}
export function downloadBackup(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
