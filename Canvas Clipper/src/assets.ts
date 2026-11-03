import { useEffect, useState } from 'react';
import { getAsset, putAsset, type Asset } from './storage';
export const MAX_IMAGE_BYTES=10*1024*1024;
export const IMAGE_TYPES=['image/png','image/jpeg','image/webp'];
// Reject oversized rasters before allocating their decoded pixel buffer.
export function imageDimensions(bytes:Uint8Array,mime:string):{width:number;height:number}{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(mime==='image/png'&&bytes.length>=24&&view.getUint32(0)===0x89504e47&&view.getUint32(12)===0x49484452)return{width:view.getUint32(16),height:view.getUint32(20)};
  if(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216){
    let at=2;
    while(at+3<bytes.length){if(bytes[at++]!==255)break;while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;const size=view.getUint16(at);if(size<2||at+size>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&size>=7)return{width:view.getUint16(at+5),height:view.getUint16(at+3)};at+=size;}
  }
  if(mime==='image/webp'&&bytes.length>=20&&view.getUint32(0)===0x52494646&&view.getUint32(8)===0x57454250){
    for(let at=12;at+8<=bytes.length;){const kind=view.getUint32(at),size=view.getUint32(at+4,true),p=at+8;if(p+size>bytes.length)break;
      if(kind===0x56503858&&size>=10)return{width:1+bytes[p+4]+(bytes[p+5]<<8)+(bytes[p+6]<<16),height:1+bytes[p+7]+(bytes[p+8]<<8)+(bytes[p+9]<<16)};
      if(kind===0x5650384c&&size>=5&&bytes[p]===47){const bits=view.getUint32(p+1,true);return{width:1+(bits&16383),height:1+((bits>>>14)&16383)};}
      if(kind===0x56503820&&size>=10&&bytes[p+3]===157&&bytes[p+4]===1&&bytes[p+5]===42)return{width:view.getUint16(p+6,true)&16383,height:view.getUint16(p+8,true)&16383};
      at=p+size+(size%2);
    }
  }
  throw new Error('圖片格式或尺寸資訊無法辨識，請重新另存為 PNG、JPEG 或 WebP。');
}
export async function imageAsset(blob:Blob,sourceUrl=''):Promise<Asset>{
  if(!IMAGE_TYPES.includes(blob.type)||blob.size>MAX_IMAGE_BYTES||!blob.size)throw new Error('圖片須為 PNG、JPEG、WebP，且每張不超過 10 MB。');
  const bytes=new Uint8Array(await blob.arrayBuffer()),size=imageDimensions(bytes,blob.type);
  if(!size.width||!size.height||size.width*size.height>24_000_000)throw new Error('圖片超過 2400 萬像素，請先縮小圖片。');
  const bitmap=await createImageBitmap(blob);
  const width=bitmap.width,height=bitmap.height;bitmap.close();
  if(width*height>24_000_000)throw new Error('圖片超過 2400 萬像素，請先縮小圖片。');
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  const id=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
  return{id,blob,mime:blob.type,width,height,sourceUrl,createdAt:new Date().toISOString()};
}
export async function saveImage(blob:Blob,sourceUrl=''){const a=await imageAsset(blob,sourceUrl);await putAsset(a);return a;}
const pool=new Map<string,{promise:Promise<string|undefined>;url?:string;refs:number}>();
export function useAssetUrl(id:unknown){
  const assetId=typeof id==='string'?id:'';
  const[url,setUrl]=useState<string>();
  useEffect(()=>{
    setUrl(undefined);if(!assetId)return;
    let entry=pool.get(assetId);
    if(!entry){entry={refs:0,promise:getAsset(assetId).then(a=>a?URL.createObjectURL(a.blob):undefined)};pool.set(assetId,entry);const current=entry;void current.promise.then(url=>{current.url=url;});}
    entry.refs++;let alive=true;
    void entry.promise.then(value=>{if(alive)setUrl(value);},()=>{if(alive)setUrl(undefined);});
    return()=>{alive=false;const current=pool.get(assetId);if(current&&--current.refs===0){pool.delete(assetId);void current.promise.then(url=>{if(url)URL.revokeObjectURL(url);},()=>undefined);}};
  },[assetId]);
  return url;
}
