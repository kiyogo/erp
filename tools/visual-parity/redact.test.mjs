import test from 'node:test';
import assert from 'node:assert/strict';
import {redactDiagnostics} from './redact.mjs';

test('fixture diagnostics retain failures without passwords or bearer tokens',()=>{
  const value='ECONNRESET\nauthorization: Bearer eyJfixture.payload.signature\nJWT: eyJfixture.payload.signature\npassword=fixture-secret';
  const result=redactDiagnostics(value,['fixture-secret','']);
  assert.ok(result.includes('ECONNRESET'));
  assert.ok(!result.includes('eyJfixture')&&!result.includes('fixture-secret'));
  assert.equal(redactDiagnostics('HTTP 403 /api/v1/employees'),'HTTP 403 /api/v1/employees');
});
