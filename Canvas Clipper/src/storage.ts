import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { newProject, normalizeProject, type Project } from './model';
export interface Asset { id: string; blob: Blob; mime: string; width: number; height: number; sourceUrl: string; createdAt: string }
interface ClipperDB extends DBSchema {
  projects: { key: string; value: Project };
  settings: { key: string; value: string };
  assets: { key: string; value: Asset };
  preferences: { key: string; value: unknown };
}
let connection: Promise<IDBPDatabase<ClipperDB>> | undefined;
const database = () => connection ??= openDB<ClipperDB>('canvas-clipper', 3, { upgrade(db, oldVersion, _newVersion, tx) {
  if(oldVersion<1){db.createObjectStore('projects',{keyPath:'id'});db.createObjectStore('settings');}
  if(oldVersion<2){db.createObjectStore('assets',{keyPath:'id'});db.createObjectStore('preferences');}
  if(oldVersion<3){
    void tx.objectStore('projects').openCursor().then(async cursor=>{while(cursor){await cursor.update(normalizeProject(cursor.value));cursor=await cursor.continue();}});
  }
} }).catch(error => { connection = undefined; throw error; });
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('canvas-clipper-updates') : undefined;
export async function listProjects(): Promise<Project[]> { return (await (await database()).getAll('projects')).map(normalizeProject).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
export async function saveProject(project: Project) {
  const db = await database();
  await db.put('projects', structuredClone(project));
  channel?.postMessage({ id: project.id });
}
export async function getProject(id: string): Promise<Project | undefined> { return (await database()).get('projects', id); }
export async function updateProject(id: string, edit: (project: Project) => Project): Promise<Project> {
  const db = await database();
  const tx = db.transaction('projects', 'readwrite');
  const existing = await tx.store.get(id);
  if (!existing) { tx.abort(); throw new Error('找不到專案，請重新開啟整理台。'); }
  const next = edit(normalizeProject(existing));
  next.updatedAt = new Date().toISOString();
  await tx.store.put(next);
  await tx.done;
  channel?.postMessage({ id });
  return next;
}
export async function currentProject(): Promise<Project> {
  const db = await database();
  // One read/write transaction prevents simultaneous first captures creating
  // separate default projects. All awaits inside the transaction are IDB work.
  const tx = db.transaction(['projects', 'settings'], 'readwrite');
  const id = await tx.objectStore('settings').get('current');
  let project = id ? await tx.objectStore('projects').get(id) : undefined;
  if (!project) { project = newProject(); await tx.objectStore('projects').put(project); await tx.objectStore('settings').put(project.id, 'current'); }
  await tx.done;
  return project;
}
export async function setCurrent(id: string) { await (await database()).put('settings', id, 'current'); }
export function watchProjects(callback: () => void) { const listener = () => callback(); channel?.addEventListener('message', listener); return () => channel?.removeEventListener('message', listener); }
export async function getAsset(id:string){return(await database()).get('assets',id);}
export async function putAsset(asset:Asset){await(await database()).put('assets',asset);}
export async function getPreference<T>(key:string):Promise<T|undefined>{return(await database()).get('preferences',key) as Promise<T|undefined>;}
export async function setPreference(key:string,value:unknown){await(await database()).put('preferences',value,key);}
export async function saveImported(projects:Project[],assets:Asset[]){const db=await database();const tx=db.transaction(['projects','assets'],'readwrite');for(const a of assets)await tx.objectStore('assets').put(a);for(const p of projects)await tx.objectStore('projects').put(p);await tx.done;channel?.postMessage({imported:true});}
