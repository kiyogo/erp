import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRGBA, compareGeometry } from './compare.mjs';

test('one changed alpha/channel pixel fails exact comparison without a tolerance',()=>{
  const a=Buffer.from([255,255,255,255, 0,0,0,255]);
  const b=Buffer.from(a); b[0]=254;
  const {metrics}=compareRGBA(a,b,2,1);
  assert.equal(metrics.differentPixels,1); assert.equal(metrics.exact,false);
  assert.equal(metrics.exactMatchPercentage,50);
  b[0]=255; b[7]=254;
  assert.equal(compareRGBA(a,b,2,1).metrics.differentPixels,1);
});

test('exact image and incompatible buffer dimensions are distinguished',()=>{
  const a=Buffer.alloc(16,255);
  assert.equal(compareRGBA(a,a,2,2).metrics.exact,true);
  assert.throws(()=>compareRGBA(a,Buffer.alloc(8),2,2),/dimensions/);
});

test('geometry reports fractional pixel deviations and missing elements',()=>{
  const g=compareGeometry({header:[220,0,1220,48],sidebar:[0,0,220,900]}, {header:[220.5,0,1219.5,50]});
  assert.equal(g.maximumElementPositionDeviation,.5);
  assert.equal(g.maximumElementSizeDeviation,2);
  assert.equal(g.unmeasured,1);
});
