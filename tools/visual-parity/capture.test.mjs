import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';

test('capture retains errors emitted while the UI settles, even when pixels match', async()=>{
  const source=await fs.readFile(new URL('./capture.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function recordPair(');
  const end=source.indexOf('async function captureRouteStates(',start);
  assert.ok(start>=0&&end>start);
  // Exercise the real function with an in-memory browser/filesystem, not a product UI fixture.
  const errors=[{side:'actual',type:'http',status:500,path:'/before-settle'}];
  const results=[];
  let saved;
  const page={evaluate:async()=>{},mouse:{move:async()=>{}},screenshot:async()=>{},waitForTimeout:async()=>{}};
  const actual={...page,waitForTimeout:async()=>errors.push({side:'actual',type:'console',message:'late failure'})};
  const context=vm.createContext({
    path,out:'/memory-only',results,console:{log(){}},
    fs:{writeFile:async(_,value)=>{saved=JSON.parse(value);}},
    domSnapshot:async()=>({url:'/admin/dashboard',rects:{}}),
    appSnapshot:async()=>({route:'/admin/dashboard',rects:{}}),
    comparePNGs:async()=>({exact:true,differentPixels:0}),compareGeometry:()=>({}),
  });
  vm.runInContext(source.slice(start,end),context);
  await context.recordPair(page,actual,'/admin/dashboard',{width:1440,height:900},'default',errors);
  assert.equal(saved.status,'FAIL');
  assert.equal(saved.errors.length,2);
  assert.equal(saved.errors[1].message,'late failure');
  assert.equal(errors.length,0);
  assert.equal(results.length,1);
  await context.recordPair(page,page,'/admin/dashboard',{width:1440,height:900},'no-errors',errors);
  assert.equal(saved.status,'PASS');
  assert.equal(saved.errors.length,0);
  assert.ok(!source.split('\n').some(line=>line.includes('recordPair(')&&line.includes('errors.splice(0)')),'callers must pass the live collector, not an early snapshot');
});
