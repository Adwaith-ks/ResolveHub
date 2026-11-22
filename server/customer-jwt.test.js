import test from 'node:test';
import assert from 'node:assert/strict';
import {issueCustomerJwt,verifyCustomerJwt,issueStaffJwt,verifyStaffJwt} from './customer-jwt.js';

test('customer JWT verifies and rejects tampering',()=>{
 const previous=process.env.SESSION_SECRET;
 process.env.SESSION_SECRET='test-only-session-secret-replaced-in-production-123456';
 try{
  const {token}=issueCustomerJwt(42,60000);
  assert.equal(verifyCustomerJwt(token).sub,'42');
  assert.equal(verifyStaffJwt(token),null);
  assert.equal(verifyCustomerJwt(token.slice(0,-2)+'aa'),null);
  assert.equal(verifyCustomerJwt('not-a-jwt'),null);
 }finally{if(previous===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=previous;}
});
test('staff JWT distinguishes administrators from customers',()=>{
 const previous=process.env.SESSION_SECRET;
 process.env.SESSION_SECRET='test-only-session-secret-replaced-in-production-123456';
 try{
  const {token}=issueStaffJwt(7,'admin',60000);
  assert.equal(verifyStaffJwt(token).role,'admin');
  assert.equal(verifyCustomerJwt(token),null);
  assert.throws(()=>issueStaffJwt(7,'customer',60000));
  const expired=issueStaffJwt(7,'agent',-1000);
  assert.equal(verifyStaffJwt(expired.token),null);
 }finally{if(previous===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=previous;}
});
