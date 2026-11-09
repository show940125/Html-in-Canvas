import {describe,it,expect} from 'vitest';
import {fitBoardView,boardViewAtZoom} from '../src/Board';
import {groupRect,computeDropPreview,applyDrop} from '../src/layout';
import {newProject,createClip} from '../src/model';

describe('board viewport controls',()=>{
  it('fits all selected boundaries, including negative coordinates',()=>{
    const rects=[{x:-100,y:200,width:308,height:374},{x:1200,y:-200,width:400,height:500}];
    const view=fitBoardView(rects,900,600)!;
    for(const rect of rects){
      expect(rect.x*view.zoom+view.x).toBeGreaterThanOrEqual(23.999);
      expect(rect.y*view.zoom+view.y).toBeGreaterThanOrEqual(23.999);
      expect((rect.x+rect.width)*view.zoom+view.x).toBeLessThanOrEqual(876.001);
      expect((rect.y+rect.height)*view.zoom+view.y).toBeLessThanOrEqual(576.001);
    }
  });
  it('can fit a wide scene below the previous 50 percent limit',()=>{
    const view=fitBoardView([{x:-1000,y:0,width:2500,height:400}],900,600)!;
    expect(view.zoom).toBeGreaterThanOrEqual(.3);
    expect(view.zoom).toBeLessThan(.5);
    expect(-1000*view.zoom+view.x).toBeCloseTo(24);
  });
  it('keeps the current zoom when locating a card that already fits',()=>{
    expect(fitBoardView([{x:1600,y:-500,width:308,height:374}],900,700,.8)!.zoom).toBe(.8);
  });
  it('reduces locate zoom only enough to fit the complete selection',()=>{
    const view=fitBoardView([{x:0,y:0,width:640,height:760}],500,400,1.2)!;
    expect(view.zoom).toBeCloseTo(352/760);
    expect(view.y).toBeCloseTo(24);
  });
  it('uses only the visible lid height for a collapsed group',()=>{
    const rect=groupRect({id:'g',title:'主題',color:'#dde8cb',x:0,y:0,width:360,height:1600,collapsed:true});
    expect(fitBoardView([rect],600,300)!.zoom).toBe(1);
  });
  it('bounds controls to 30 through 200 percent and handles empty scenes',()=>{
    expect(fitBoardView([],600,400)).toBeUndefined();
    expect(fitBoardView([{x:0,y:0,width:100,height:100}],600,400,3)!.zoom).toBe(2);
    expect(fitBoardView([{x:0,y:0,width:10000,height:10000}],600,400)!.zoom).toBe(.3);
  });
  it('restores 100 percent around the current viewport center',()=>{
    const before={x:-820,y:290,zoom:.6},width=900,height=600;
    const after=boardViewAtZoom(before,width,height,1);
    expect(after.zoom).toBe(1);
    expect((width/2-after.x)/after.zoom).toBeCloseTo((width/2-before.x)/before.zoom);
    expect((height/2-after.y)/after.zoom).toBeCloseTo((height/2-before.y)/before.zoom);
  });
});

describe('keyboard card size uses the drop transaction',()=>{
  it('grows the topic, carries its neighbor and preserves the saved outline',()=>{
    const project=newProject();
    project.groups=[{id:'a',title:'主題A',color:'#dde8cb',x:24,y:0,width:356,height:478,collapsed:false},{id:'b',title:'主題B',color:'#dde8cb',x:500,y:0,width:356,height:478,collapsed:false}];
    project.cards=[0,1].map(i=>createClip({kind:'manual',title:String(i),text:'合成尺寸測試',url:'',capturedAt:'2026-11-09T00:00:00Z'},i));
    project.cards.forEach((card,i)=>Object.assign(card,{groupId:i?'b':'a',x:i?524:48,y:80}));
    const before=structuredClone(project),card=project.cards[0];
    const preview=computeDropPreview(project,{ids:[card.id],dx:0,dy:0,pointer:{x:card.x,y:card.y},zoom:1,resize:{width:640,height:500}});
    expect(project).toEqual(before);
    const after=applyDrop(project,preview);
    expect(after.cards[0]).toMatchObject({width:640,height:500,groupId:'a',x:48,y:80});
    expect(after.groups[0].width).toBe(688);
    expect(after.groups[1].x).toBeGreaterThan(before.groups[1].x);
    expect(after.cards[1].x-before.cards[1].x).toBe(after.groups[1].x-before.groups[1].x);
    expect(after.outline).toEqual(before.outline);
  });
});
