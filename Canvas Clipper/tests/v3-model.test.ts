import {describe,it,expect} from 'vitest';
import {newProject,createClip,exportProject,importProject,removeCard} from '../src/model';
import {FRAME_IDS,framePath,cardAppearance} from '../src/appearance';
const fixture=()=>{const p=newProject();p.cards=[createClip({kind:'manual',title:'可變尺寸',text:'繁體中文 🧑‍💻',url:'',capturedAt:new Date().toISOString()},0)];return p;};
describe('v3 persistence and frame contracts',()=>{
 it('roundtrips dimensions, frames, colors and a remapped reading anchor',()=>{const p=fixture();Object.assign(p.cards[0],{width:420,height:520,frame:'hexagon',color:'#d9e8ed'});p.readingProgress={cardId:p.cards[0].id,nodePath:[4,1],offset:24};const result=importProject(exportProject(p));expect(result.cards[0]).toMatchObject({width:420,height:520,frame:'hexagon',color:'#d9e8ed'});expect(result.readingProgress).toEqual({...p.readingProgress,cardId:result.cards[0].id});});
 it('rejects invalid dimensions and unknown frame assets',()=>{const p=fixture();p.cards[0].width=20;expect(()=>importProject(exportProject(p))).toThrow(/尺寸/);p.cards[0].width=308;p.cards[0].frame='untrusted-svg' as never;expect(()=>importProject(exportProject(p))).toThrow(/框型/);});
 it('rejects dangling reading anchors and clears the anchor on deletion',()=>{const p=fixture();p.readingProgress={cardId:'missing',nodePath:[0],offset:0};expect(()=>importProject(exportProject(p))).toThrow(/閱讀/);p.readingProgress.cardId=p.cards[0].id;expect(removeCard(p,p.cards[0].id).readingProgress).toBeUndefined();});
 it('resolves topic style inheritance and article overrides',()=>{const p=fixture(),g={id:'g',color:'#dde8cb',cardFrame:'folder' as const,cardColor:'#d9e8ed'};p.cards[0].groupId='g';expect(cardAppearance(p.cards[0],[g])).toEqual({frame:'folder',color:'#d9e8ed'});p.cards[0].frame='note';expect(cardAppearance(p.cards[0],[g]).frame).toBe('note');});
 it('produces all six scalable shapes without invalid coordinates',()=>{for(const frame of FRAME_IDS){const path=framePath(frame,640,760);expect(path).toMatch(/^M/);expect(path).not.toMatch(/NaN|undefined/);expect(path).not.toBe(framePath(frame,308,374));}});
});
