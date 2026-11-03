import { describe,expect,it } from 'vitest';
import { imageDimensions } from '../src/assets';
describe('raster header bounds before decode',()=>{
  it('reads PNG dimensions without decoding pixels',()=>{const b=new Uint8Array(24),v=new DataView(b.buffer);v.setUint32(0,0x89504e47);v.setUint32(12,0x49484452);v.setUint32(16,12000);v.setUint32(20,10000);expect(imageDimensions(b,'image/png')).toEqual({width:12000,height:10000});});
  it('reads JPEG SOF dimensions after metadata',()=>{const b=new Uint8Array([255,216,255,224,0,4,0,0,255,194,0,7,8,1,44,2,88]);expect(imageDimensions(b,'image/jpeg')).toEqual({width:600,height:300});});
  it('reads lossless WebP dimensions',()=>{const b=new Uint8Array(26),v=new DataView(b.buffer);v.setUint32(0,0x52494646);v.setUint32(8,0x57454250);v.setUint32(12,0x5650384c);v.setUint32(16,5,true);b[20]=47;v.setUint32(21,319|(139<<14),true);expect(imageDimensions(b,'image/webp')).toEqual({width:320,height:140});});
  it('rejects truncated and mislabeled headers',()=>{expect(()=>imageDimensions(new Uint8Array([255,216,255]),'image/jpeg')).toThrow();expect(()=>imageDimensions(new Uint8Array(24),'image/png')).toThrow();});
});
