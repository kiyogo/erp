import test from 'node:test';
import assert from 'node:assert/strict';
import { inventory } from './inventory.mjs';

test('insurance regex dispatch resolves the real module instead of falling through to NotFound',()=>{
  const routes=inventory().routes;
  for(const name of ['overview','labor','adjustments','regimes','card','voluntary','contributions','expenses']){
    const route=routes.find(r=>r.route==='/admin/insurance/'+name);
    assert.equal(route?.legacyComponent,'InsuranceModule',name);
    assert.equal(route?.legacyFile,'legacy/web/src/modules/insurance/InsuranceModule.tsx');
  }
});
