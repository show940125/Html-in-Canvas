import type {HTMLGL} from '../../shared/html-in-canvas/texture';
import {prepareCanvas,type DrawableCanvas} from '../../shared/html-in-canvas/canvas';
import {clamp,smooth,groupBlocks,type Block,type Capture} from './model';
import {actorTexture,loadImage,texture,type ActorTexture} from './textures';
import {loadSprite,frameUV,type Sprite} from './sprites';

const vertex=`#version 300 es
in vec2 aPosition;uniform vec4 uRect;uniform vec2 uViewport;out vec2 vUV;
void main(){vUV=aPosition*.5+.5;vec2 p=uRect.xy+vUV*uRect.zw;gl_Position=vec4(p/uViewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);}`;
const flat=`#version 300 es
precision highp float;in vec2 vUV;uniform sampler2D uTexture;uniform vec4 uUV;uniform float uOpacity;out vec4 frag;
void main(){frag=texture(uTexture,uUV.xy+vUV*uUV.zw);frag.a*=uOpacity;}`;
// All gait poses come from the generated GIF's real frames. Page content is
// projected inside alpha without procedurally distorting the anatomy.
const character=`#version 300 es
precision highp float;in vec2 vUV;out vec4 frag;
uniform sampler2D uSprite,uTexture,uTextureNext,uPage;
uniform vec4 uFrame,uSource;uniform vec2 uTexel;uniform float uMorph,uOpacity,uMonster,uContentMix,uDirection;
void main(){
 vec2 maskUV=vec2(uDirection<0.?1.-vUV.x:vUV.x,vUV.y);
 vec2 at=uFrame.xy+maskUV*uFrame.zw;vec4 body=texture(uSprite,at);
 float softAlpha=(body.a*2.+texture(uSprite,at+vec2(uTexel.x,0.)).a+texture(uSprite,at-vec2(uTexel.x,0.)).a+texture(uSprite,at+vec2(0.,uTexel.y)).a+texture(uSprite,at-vec2(0.,uTexel.y)).a)/6.;body.a=smoothstep(.13,.87,softAlpha);
 vec2 pageUV=clamp(vec2((vUV.x-.5)*1.3+.5,vUV.y),vec2(.001),vec2(.999));
 vec4 content=mix(texture(uTexture,pageUV),texture(uTextureNext,pageUV),uContentMix);
 float lum=dot(content.rgb,vec3(.2126,.7152,.0722));float detail=dot(body.rgb,vec3(.2126,.7152,.0722));
 float ink=content.a*(1.-lum);
 vec3 skin=mix(vec3(.12,.15,.14),vec3(.38,.41,.37),detail);skin=mix(skin,skin*.65,uMonster);
 vec3 pageInk=mix(vec3(.85,.86,.78),vec3(.61,.67,.59),uMonster);
 vec3 color=mix(skin,pageInk,ink*mix(.78,.44,uMonster));color=mix(color,content.rgb,content.a*lum*.18);
 float alpha=body.a*mix(.90,.96,uMonster);vec4 original=texture(uPage,uSource.xy+vUV*uSource.zw);
 float m=smoothstep(0.,1.,uMorph);frag=vec4(mix(original.rgb,color,m),mix(1.,alpha,m)*uOpacity);
}`;
interface Program{program:WebGLProgram;uniforms:Map<string,WebGLUniformLocation>;}
function program(gl:HTMLGL,fs:string):Program{
 const p=gl.createProgram()!;const shaders:WebGLShader[]=[];
 try{for(const [type,source]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fs]] as const){const s=gl.createShader(type)!;shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'著色器編譯失敗');gl.attachShader(p,s);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'著色器連結失敗');return {program:p,uniforms:new Map()};}
 catch(e){gl.deleteProgram(p);throw e;}finally{for(const s of shaders)gl.deleteShader(s);}
}
export interface Actor{block:Block;regions:Block[];material:ActorTexture;targetMaterial?:ActorTexture;targetBlock?:Block;size:number;x:number;y:number;vx:number;vy:number;delay:number;direction:number;walkTime:number;}
export class Renderer{
 readonly gl:HTMLGL;private flat:Program;private character:Program;private buffer:WebGLBuffer;
 private textures:WebGLTexture[]=[];private original!:WebGLTexture;private clean!:WebGLTexture;private target?:WebGLTexture;private shadowTexture?:WebGLTexture;
 private human!:Sprite;private kaiju!:Sprite;private destruction!:Sprite;
 private lastTime=0;private lastImpact=-1;private impacts:{x:number;y:number;time:number}[]=[];
 actors:Actor[]=[];nativeCount=0;snapshotCount=0;disposed=false;
 constructor(readonly canvas:HTMLCanvasElement,readonly source:Capture,readonly host:ShadowRoot){
  prepareCanvas(canvas as DrawableCanvas);
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:true,premultipliedAlpha:false}) as HTMLGL|null;
  if(!gl)throw new Error('目前無法使用 WebGL 2，請確認 Chrome 的圖形加速已開啟。');this.gl=gl;
  this.flat=program(gl,flat);this.character=program(gl,character);this.buffer=gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
 }
 private uniform(p:Program,key:string){let u=p.uniforms.get(key);if(u===undefined){const value=this.gl.getUniformLocation(p.program,key);if(value===null)return null;p.uniforms.set(key,value);u=value;}return u;}
 private use(p:Program,rect:number[]){const g=this.gl;g.useProgram(p.program);g.bindBuffer(g.ARRAY_BUFFER,this.buffer);const at=g.getAttribLocation(p.program,'aPosition');g.enableVertexAttribArray(at);g.vertexAttribPointer(at,2,g.FLOAT,false,0,0);g.uniform4fv(this.uniform(p,'uRect'),rect);g.uniform2f(this.uniform(p,'uViewport'),this.source.width,this.source.height);}
 async init(target?:Capture){
  const g=this.gl;
  for(const name of ['human-run','godzilla-stomp','destruction'] as const){const sprite=await loadSprite(g,name);if(this.disposed){g.deleteTexture(sprite.texture);return;}this.textures.push(sprite.texture);if(name==='human-run')this.human=sprite;else if(name==='godzilla-stomp')this.kaiju=sprite;else this.destruction=sprite;}
  const im=await loadImage(this.source.screenshot),clean=await loadImage(this.source.clean);if(this.disposed)return;this.original=texture(g,im);this.clean=texture(g,clean);this.textures.push(this.original,this.clean);
  const shadow=document.createElement('canvas');shadow.width=128;shadow.height=32;const cx=shadow.getContext('2d')!;cx.scale(1,.25);const gradient=cx.createRadialGradient(64,64,0,64,64,64);gradient.addColorStop(0,'#14251b50');gradient.addColorStop(1,'#14251b00');cx.fillStyle=gradient;cx.fillRect(0,0,128,128);this.shadowTexture=texture(g,shadow);this.textures.push(this.shadowTexture);
  const groups=groupBlocks(this.source.blocks,this.source.width,this.source.height);
  for(let i=0;i<groups.length;i++){
   if(this.disposed)return;const {block:b,regions}=groups[i],material=await actorTexture(g,this.host,this.source,b,im);if(this.disposed){g.deleteTexture(material.texture);return;}this.textures.push(material.texture);if(material.mode==='native')this.nativeCount++;else this.snapshotCount++;
   const size=clamp(Math.sqrt(b.w*b.h)*.9,145,Math.min(240,this.source.height*.38));this.actors.push({block:b,regions,material,size,x:b.x+b.w/2,y:b.y+b.h/2,vx:0,vy:0,delay:i*.08,direction:1,walkTime:0});
  }
  if(target){const next=await loadImage(target.screenshot);if(this.disposed)return;this.target=texture(g,next);this.textures.push(this.target);const targetGroups=groupBlocks(target.blocks,target.width,target.height);
   for(let i=0;i<this.actors.length;i++){const a=this.actors[i],b=targetGroups[i%targetGroups.length]?.block||{x:0,y:0,w:target.width,h:target.height,text:target.title,color:'#fff',font:'system-ui',size:24,kind:'image' as const};const material=await actorTexture(g,this.host,target,b,next);if(this.disposed){g.deleteTexture(material.texture);return;}this.textures.push(material.texture);a.targetMaterial=material;a.targetBlock={...b,x:b.x*this.source.width/target.width,y:b.y*this.source.height/target.height,w:b.w*this.source.width/target.width,h:b.h*this.source.height/target.height};}
  }
 }
 resize(){const d=Math.min(devicePixelRatio,1.5),w=Math.round(this.source.width*d),h=Math.round(this.source.height*d);if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}this.gl.viewport(0,0,w,h);}
 image(t:WebGLTexture,rect:number[],uv=[0,0,1,1],opacity=1){const g=this.gl;this.use(this.flat,rect);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,t);g.uniform1i(this.uniform(this.flat,'uTexture'),0);g.uniform4fv(this.uniform(this.flat,'uUV'),uv);g.uniform1f(this.uniform(this.flat,'uOpacity'),opacity);g.drawArrays(g.TRIANGLES,0,6);}
 private spriteRect(a:Actor,monster:boolean):number[]{const data=(monster?this.kaiju:this.human).data,height=a.size*(monster?1.35:1.2),width=height*data.width/data.height;return [a.x-width*.5,a.y-height*.5,width,height];}
 private person(a:Actor,t:number,morph:number,opacity:number,monster=false,arrival=0,contentMix=0){
  const g=this.gl,b=a.block,p=this.character,sprite=monster?this.kaiju:this.human,base=this.spriteRect(a,monster);
  let rect=base.map((value,i)=>[b.x,b.y,b.w,b.h][i]+(value-[b.x,b.y,b.w,b.h][i])*morph);const target=a.targetBlock;
  if(arrival>0&&target){rect=rect.map((value,i)=>value+([target.x,target.y,target.w,target.h][i]-value)*arrival);morph=1-arrival;}
  this.use(p,rect);
  for(const [unit,key,tex]of [[0,'uTexture',a.material.texture],[1,'uPage',arrival>0&&this.target?this.target:this.original],[2,'uTextureNext',a.targetMaterial?.texture||a.material.texture],[3,'uSprite',sprite.texture]] as const){g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,tex);g.uniform1i(this.uniform(p,key),unit);}
  const source=arrival>0&&target?target:b;g.uniform4f(this.uniform(p,'uSource'),source.x/this.source.width,source.y/this.source.height,source.w/this.source.width,source.h/this.source.height);g.uniform4fv(this.uniform(p,'uFrame'),frameUV(sprite,monster?t:a.walkTime+a.delay));g.uniform2f(this.uniform(p,'uTexel'),.6/(sprite.data.width*sprite.data.columns),.6/(sprite.data.height*sprite.data.rows));
  for(const [key,value]of Object.entries({uMorph:morph,uOpacity:opacity,uMonster:monster?1:0,uContentMix:contentMix,uDirection:a.direction}))g.uniform1f(this.uniform(p,key),value);g.drawArrays(g.TRIANGLES,0,6);
 }
 private shadow(a:Actor,monster:boolean,opacity:number){if(!this.shadowTexture)return;const rect=this.spriteRect(a,monster),sprite=monster?this.kaiju:this.human,feet=rect[1]+rect[3]*sprite.data.baseline;this.image(this.shadowTexture,[a.x-a.size*.28,feet-3,a.size*.56,Math.max(10,a.size*.065)],[0,0,1,1],opacity*.55);}
 frame(t:number,duration:number,monster:Actor){
  if(this.disposed)return;this.resize();const w=this.source.width,h=this.source.height,g=this.gl;g.clearColor(.1,.12,.11,1);g.clear(g.COLOR_BUFFER_BIT);
  if(t<this.lastTime){this.impacts=[];this.lastImpact=-1;}this.lastTime=t;this.image(this.clean,[0,0,w,h]);
  for(const a of this.actors){const born=smooth(1.4+a.delay,4.8+a.delay,t);if(born<.999)for(const b of a.regions)this.image(this.original,[b.x,b.y,b.w,b.h],[b.x/w,b.y/h,b.w/w,b.h/h],1-born);}
  const step=Math.floor((t-2)/2.4);
  if(step>=0&&step!==this.lastImpact&&t<duration*.79){this.lastImpact=step;const rect=this.spriteRect(monster,true);this.impacts.push({x:monster.x+monster.direction*monster.size*.22,y:rect[1]+rect[3]*this.kaiju.data.baseline,time:2+step*2.4});if(this.impacts.length>6)this.impacts.shift();}
  for(const impact of this.impacts){const age=t-impact.time;if(age<0||age>=this.destruction.data.duration/1000)continue;const size=monster.size*.80;this.image(this.destruction.texture,[impact.x-size*.5,impact.y-size*.63,size,size],frameUV(this.destruction,age,false),.72*(1-smooth(duration-2,duration,t)));}
  if(this.target&&t>duration-1.2)this.image(this.target,[0,0,w,h],[0,0,1,1],smooth(duration-1.2,duration,t));
  const monsterOpacity=smooth(.7,2.8,t)*(1-smooth(duration-2,duration,t));this.shadow(monster,true,monsterOpacity);this.person(monster,t,1,monsterOpacity,true);
  for(const a of [...this.actors].sort((a,b)=>a.y-b.y)){const born=smooth(1.4+a.delay,4.8+a.delay,t),opacity=this.target?1:1-smooth(duration-2.2,duration-.25,t);if(born<=0||opacity<=0)continue;const arrival=this.target?smooth(duration*.80,duration,t):0;this.shadow(a,false,born*opacity*(1-arrival));this.person(a,t,born,opacity,false,arrival,this.target?smooth(duration*.71,duration*.84,t):0);}
 }
 dispose(){if(this.disposed)return;this.disposed=true;const g=this.gl;for(const t of this.textures)g.deleteTexture(t);g.deleteBuffer(this.buffer);g.deleteProgram(this.flat.program);g.deleteProgram(this.character.program);this.actors=[];g.getExtension('WEBGL_lose_context')?.loseContext();}
}
