import { htmlToDoc } from './rich';
const selection=getSelection();
const container=document.createElement('div');
if(selection?.rangeCount)container.append(selection.getRangeAt(0).cloneContents());
(globalThis as typeof globalThis&{__clipperSelection?:unknown}).__clipperSelection=container.textContent?.trim()?htmlToDoc(container.innerHTML,location.href):undefined;
