import {prepareCanvas,supportsCanvas,type DrawableCanvas,type DrawableContext} from '../../shared/html-in-canvas/canvas';
import {uploadHTML,type HTMLGL} from '../../shared/html-in-canvas/texture';
import type {Block,Capture} from './model';
export const loadImage = (src:string):Promise<HTMLImageElement> => new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('快照圖片無法解碼。'));im.src=src;});
export function texture(gl:WebGL2RenderingContext,source:TexImageSource):WebGLTexture {
  const t=gl.createTexture();if(!t)throw new Error('無法配置紋理。');gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);return t;
}
export interface ActorTexture {texture:WebGLTexture; mode:'native'|'snapshot';}
/** Freeze live HTML into a reusable texture once; walking never re-lays out text. */
export async function actorTexture(gl:HTMLGL,host:ShadowRoot,capture:Capture,block:Block,image:HTMLImageElement):Promise<ActorTexture>{
  const tile=document.createElement('canvas');tile.width=512;tile.height=640;const ctx=tile.getContext('2d')!;
  const sx=image.width/capture.width,sy=image.height/capture.height;
  if(block.kind==='image'){
    // Repeated editorial strips keep recognisable image details inside narrow limbs.
    for(let y=0;y<640;y+=210)ctx.drawImage(image,block.x*sx,block.y*sy,block.w*sx,block.h*sy,0,y,512,210);
    return {texture:texture(gl,tile),mode:'snapshot'};
  }
  const canvas=gl.canvas as DrawableCanvas;
  const paper=document.createElement('div');paper.setAttribute('drawable','');
  paper.style.cssText='box-sizing:border-box;width:512px;height:640px;overflow:hidden;padding:8px;background:transparent;line-height:1.35;word-break:break-word;';
  paper.style.fontFamily=block.font;paper.style.color=block.color;paper.style.fontSize=`${Math.max(21,Math.min(45,block.size))}px`;
  const text=block.text || capture.title;
  for(let i=0;i<Math.min(24,Math.ceil(2400/Math.max(1,text.length)));i++){const p=document.createElement('p');p.style.margin='0 0 12px';p.textContent=text;paper.append(p);}
  if(supportsCanvas()){
    prepareCanvas(canvas);canvas.append(paper);
    try{
      const t=gl.createTexture();if(!t)throw new Error('無法配置 HTML 紋理。');
      gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      try{
        await new Promise<void>((resolve,reject)=>{const id=setTimeout(()=>reject(new Error('原生 HTML 繪製逾時。')),1800);canvas.addEventListener('paint',()=>{try{gl.bindTexture(gl.TEXTURE_2D,t);uploadHTML(gl,canvas,t,paper);clearTimeout(id);resolve();}catch(e){clearTimeout(id);reject(e);}},{once:true});canvas.requestPaint();});
        return {texture:t,mode:'native'};
      }catch(e){gl.deleteTexture(t);throw e;}
    }catch(error){console.info('Runaway uses snapshot for this block:',error);}
    finally{paper.remove();}
  }
  // The captured pixels preserve actual fonts and styling in compatibility mode.
  for(let y=0;y<640;y+=Math.max(70,Math.min(240,block.h)))ctx.drawImage(image,block.x*sx,block.y*sy,block.w*sx,block.h*sy,0,y,512,Math.max(70,Math.min(240,block.h)));
  return {texture:texture(gl,tile),mode:'snapshot'};
}
