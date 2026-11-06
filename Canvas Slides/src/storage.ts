import {openDB} from 'idb';
import type {Deck} from './model';
import {sanitizeDeck} from './importer';
const db=openDB('canvas-slides',1,{upgrade(database){database.createObjectStore('decks',{keyPath:'id'});}});
let queue=Promise.resolve();
export function saveDeck(deck:Deck){const snapshot=structuredClone(deck);const task=queue.catch(()=>{}).then(async()=>{await(await db).put('decks',snapshot);});queue=task;return task;}
export async function listDecks():Promise<Deck[]>{return(await(await db).getAll('decks')).sort((a,b)=>b.updated-a.updated);}
export async function loadDeck(id:string){const value=await(await db).get('decks',id);return value?sanitizeDeck(value):undefined;}
export async function removeDeck(id:string){await(await db).delete('decks',id);}
