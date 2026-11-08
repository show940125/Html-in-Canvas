import {texture,loadImage} from './textures';
export interface SpriteData {width:number;height:number;columns:number;rows:number;frameCount:number;durations:number[];duration:number;baseline:number;}
export interface Sprite {data:SpriteData;texture:WebGLTexture;}
type Embedded={image:string;data:SpriteData};
declare global {interface Window {runawayAssets?:Record<string,Embedded>;}}
export function assetUrl(path:string):string{
  return typeof chrome!=='undefined'&&chrome.runtime?.id?chrome.runtime.getURL(path):new URL(path,location.href).href;
}
export async function loadSprite(gl:WebGL2RenderingContext,name:string):Promise<Sprite>{
  const embedded=window.runawayAssets?.[name];
  let data:SpriteData;
  if(embedded)data=embedded.data;
  else{const response=await fetch(assetUrl(`assets/${name}.json`));if(!response.ok)throw new Error('動畫素材缺少，請重新建置或更新插件。');data=await response.json();}
  if(!Number.isInteger(data.frameCount)||data.frameCount<2||data.frameCount>64||!Array.isArray(data.durations)||data.durations.length!==data.frameCount||data.width<1||data.height<1||data.width*data.columns>gl.getParameter(gl.MAX_TEXTURE_SIZE)||data.height*data.rows>gl.getParameter(gl.MAX_TEXTURE_SIZE))throw new Error('動畫素材格式無效。');
  return {data,texture:texture(gl,await loadImage(embedded?.image||assetUrl(`assets/${name}.png`)))};
}
export function frameUV(sprite:Sprite,seconds:number,loop=true):number[]{
  const d=sprite.data;let ms=loop?((seconds*1000%d.duration)+d.duration)%d.duration:Math.min(d.duration-1,Math.max(0,seconds*1000));let frame=0;
  while(frame<d.frameCount-1&&ms>=d.durations[frame]){ms-=d.durations[frame];frame++;}
  // Half-texel inset prevents neighbouring frame edges from leaking under scaling.
  const aw=d.width*d.columns,ah=d.height*d.rows;
  return [(frame%d.columns)/d.columns+.5/aw,Math.floor(frame/d.columns)/d.rows+.5/ah,(d.width-1)/aw,(d.height-1)/ah];
}
