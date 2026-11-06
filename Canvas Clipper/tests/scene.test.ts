import {describe,it,expect} from 'vitest';
import {createClip,newProject} from '../src/model';
import {sceneOrder,sceneUnit} from '../src/scene';
function fixture(){const p=newProject();p.groups=['a','b'].map(id=>({id,title:id,color:'#dde8cb',x:0,y:0,width:360,height:480,collapsed:false}));p.cards=[0,1,2].map(i=>createClip({kind:'manual',title:String(i),text:'文字',url:'',capturedAt:'2026-11-06T00:00:00Z'},i));p.cards[0].groupId='a';p.cards[1].groupId='b';return p;}
describe('topic stacking units',()=>{
 it('keeps each lid adjacent to its own members',()=>{const p=fixture();expect(sceneOrder(p,[],[])).toEqual(['a',p.cards[0].id,'a-header','b',p.cards[1].id,'b-header',p.cards[2].id]);});
 it('raises the whole topic when a member is selected',()=>{const p=fixture(),unit=sceneUnit(p,p.cards[0].id);expect(unit).toBe('g:a');expect(sceneOrder(p,[unit],[p.cards[0].id]).slice(-3)).toEqual(['a',p.cards[0].id,'a-header']);});
 it('selection never paints a card across a higher topic lid',()=>{const p=fixture(),order=sceneOrder(p,['g:b'],[p.cards[0].id]);expect(order.indexOf(p.cards[0].id)).toBeLessThan(order.indexOf('b'));});
 it('retains orphaned and ungrouped articles as independent units',()=>{const p=fixture();p.cards[0].groupId='deleted';expect(sceneUnit(p,p.cards[0].id)).toBe('c:'+p.cards[0].id);expect(sceneOrder(p,[],[])).toContain(p.cards[0].id);});
 it('does not mutate saved outline or data while changing stacking',()=>{const p=fixture(),before=JSON.stringify(p);sceneOrder(p,['g:b','removed'],[]);expect(JSON.stringify(p)).toBe(before);});
});
