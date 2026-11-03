import { useEffect,useLayoutEffect,useRef,useState } from 'react';
import { prepareCanvas,syncGpuGeometry,type DrawableCanvas } from '../../shared/html-in-canvas/canvas';
import { RichContent } from './RichContent';
import type { Clip } from './model';
interface HTMLGL extends WebGL2RenderingContext{texElementImage2D(target:number,internal:number,element:Element):void;texElementSubImage2D(target:number,level:number,x:number,y:number,element:Element):void;}
const vertex=`#version 300 es
in vec2 position;in vec2 uv;uniform mat4 matrix;out vec2 vuv;
void main(){vuv=uv;gl_Position=matrix*vec4(position,0.,1.);}`;
const fragment=`#version 300 es
precision mediump float;uniform sampler2D paper;uniform vec2 light;uniform float gloss;in vec2 vuv;out vec4 color;
void main(){vec4 c=texture(paper,vuv);float shine=pow(max(0.,1.-distance(vuv,light)),9.)*.48*gloss;float rim=pow(abs(vuv.x-.5)*2.,7.)*.025; color=vec4(c.rgb+(shine-rim)*c.a,c.a);}`;
export function WebGLShowcase({card,onCard}:{card?:Clip;onCard:(id:string,fields:Partial<Clip>)=>void}){
  const canvas=useRef<DrawableCanvas>(null),paper=useRef<HTMLDivElement>(null);
  const[error,setError]=useState(''),[clicks,setClicks]=useState(0),[enabled,setEnabled]=useState(true),[angle,setAngle]=useState(14),[gloss,setGloss]=useState(true),[demoNote,setDemoNote]=useState('');
  const state=useRef({angle:14,gloss:true,light:{x:.65,y:.2},tilt:{x:-5,y:14},frozen:false});
  const redraw=()=>canvas.current?.requestPaint?.();
  useEffect(()=>{state.current.angle=angle;state.current.tilt.y=angle;redraw();},[angle]);
  useEffect(()=>{state.current.gloss=gloss;redraw();},[gloss]);
  useLayoutEffect(()=>{
    const cv=canvas.current,el=paper.current;if(!cv||!el||!enabled)return;
    prepareCanvas(cv);const gl=cv.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:true}) as HTMLGL|null;
    if(!gl||typeof gl.texElementImage2D!=='function'){setError('目前環境沒有可用的 WebGL HTML 紋理 API；日常閱讀桌仍可使用。');return;}
    const shader=(type:number,source:string)=>{const shader=gl.createShader(type)!;gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||'Shader 編譯失敗');return shader;};
    let program:WebGLProgram|undefined,vs:WebGLShader|undefined,fs:WebGLShader|undefined,buffer:WebGLBuffer|undefined,texture:WebGLTexture|undefined;
    try{
      vs=shader(gl.VERTEX_SHADER,vertex);fs=shader(gl.FRAGMENT_SHADER,fragment);program=gl.createProgram()!;gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'Shader 連結失敗');
      gl.useProgram(program);buffer=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      const w=440,h=530;gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,0,0,w,0,1,0,0,h,0,1,w,h,1,1]),gl.STATIC_DRAW);
      const pos=gl.getAttribLocation(program,'position'),uv=gl.getAttribLocation(program,'uv');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,16,0);gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,16,8);
      texture=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      const matrixUniform=gl.getUniformLocation(program,'matrix'),lightUniform=gl.getUniformLocation(program,'light'),glossUniform=gl.getUniformLocation(program,'gloss');
      const paint=()=>{try{
        const width=cv.clientWidth,height=cv.clientHeight,dpr=devicePixelRatio;
        gl.viewport(0,0,cv.width,cv.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindTexture(gl.TEXTURE_2D,texture!);gl.texElementImage2D(gl.TEXTURE_2D,gl.RGBA8,el);
        const perspective=new DOMMatrix();perspective.m34=-1/1000;
        const scale=Math.min(1,(width-60)/w,(height-55)/h);
        const model=new DOMMatrix().translate(width/2,height/2).multiply(perspective).rotate(state.current.tilt.x,state.current.tilt.y,0).scale(scale).translate(-w/2,-h/2);
        const projection=new DOMMatrix([2/width,0,0,0,0,-2/height,0,0,0,0,.001,0,-1,1,0,1]);
        gl.uniformMatrix4fv(matrixUniform,false,projection.multiply(model).toFloat32Array());gl.uniform2f(lightUniform,state.current.light.x,state.current.light.y);gl.uniform1f(glossUniform,state.current.gloss?1:0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        syncGpuGeometry(cv,el,model);
        cv.dataset.frames=String(Number(cv.dataset.frames||0)+1);cv.dataset.renderer='webgl2-html-texture';cv.dataset.deviceScale=String(dpr);
      }catch(e){setError(e instanceof Error?e.message:String(e));}};
      cv.addEventListener('paint',paint);
      const resize=new ResizeObserver(()=>{const width=Math.round(cv.clientWidth*devicePixelRatio),height=Math.round(cv.clientHeight*devicePixelRatio);if(cv.width!==width||cv.height!==height){cv.width=width;cv.height=height;}cv.requestPaint();});resize.observe(cv);cv.requestPaint();
      const lost=(e:Event)=>{e.preventDefault();setError('WebGL 畫面已中斷，關閉再開啟展示可重新建立；資料已保存在閱讀桌。');};cv.addEventListener('webglcontextlost',lost);
      return()=>{resize.disconnect();cv.removeEventListener('paint',paint);cv.removeEventListener('webglcontextlost',lost);gl.deleteBuffer(buffer!);gl.deleteTexture(texture!);gl.deleteProgram(program!);gl.deleteShader(vs!);gl.deleteShader(fs!);};
    }catch(e){setError(String(e));if(program)gl.deleteProgram(program);if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);if(buffer)gl.deleteBuffer(buffer);if(texture)gl.deleteTexture(texture);}
  },[enabled]);
  useLayoutEffect(redraw,[card,clicks,demoNote]);
  return <section className="showcase" data-screen-label="原生 WebGL 紙張展示"><header className="showcase-heading"><div><p className="eyebrow">HTML × WEBGL / LIVE PAPER</p><h2>紙張會傾斜，內容依然能操作。</h2><p>移動滑鼠改變光線，點擊紙上的按鈕，或直接輸入筆記。</p></div><label className="showcase-toggle"><input type="checkbox" checked={enabled} onChange={e=>{setError('');setEnabled(e.target.checked);}}/>開啟展示</label></header><div className="showcase-controls"><label>紙張角度<input aria-label="紙張角度" type="range" min="-28" max="28" value={angle} onChange={e=>setAngle(Number(e.target.value))}/><output>{angle}°</output></label><label><input aria-label="動態高光" type="checkbox" checked={gloss} onChange={e=>setGloss(e.target.checked)}/>動態高光</label><span>輸入時紙張保持穩定 · 效果不寫入文件</span></div>
    <div className="showcase-stage" onPointerMove={e=>{const r=e.currentTarget.getBoundingClientRect();state.current.light={x:(e.clientX-r.x)/r.width,y:(e.clientY-r.y)/r.height};if(!state.current.frozen&&!matchMedia('(prefers-reduced-motion: reduce)').matches)state.current.tilt.x=((e.clientY-r.y)/r.height-.5)*-10;redraw();}}>{enabled&&!error?<canvas ref={canvas} className="webgl-canvas" aria-label="可互動 WebGL 紙張"><div drawable="" className="gpu-paper" ref={paper} onFocusCapture={()=>{state.current.frozen=true;}} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))state.current.frozen=false;}}><div className="gpu-paper-kicker"><span>CANVAS CLIPPER</span><span>LIVE DOM</span></div><h1>{card?.title||'把內容，放進新的空間。'}</h1><div className="gpu-paper-body">{card?<RichContent doc={card.editedDoc}/>:<p>這是一張真正的 HTML 紙張。文字可以選取，按鈕可以點擊，筆記可以直接輸入。</p>}</div><button className="gpu-test-button" onClick={()=>setClicks(n=>n+1)}>測試互動 · 已點擊 {clicks} 次 ↗</button><label>我的筆記<textarea aria-label="WebGL 紙張筆記" value={card?.note??demoNote} placeholder="在真正的 HTML 表單中輸入…" onChange={e=>{if(card)onCard(card.id,{note:e.target.value});else setDemoNote(e.target.value);}}/></label><footer>HTML-in-Canvas · WebGL 2 · 本機呈現</footer></div></canvas>:<div className="showcase-unavailable"><span>◇</span><h3>{error?'展示暫不可用':'展示已關閉'}</h3><p>{error||'開啟上方展示，即可測試互動式紙張。'}</p></div>}</div>
  </section>;
}
