import test from 'node:test';import assert from 'node:assert/strict';import {newToken,digest,safeEqual} from './security.js';
test('random tokens are unique and not stored raw',()=>{const a=newToken(),b=newToken();assert.notEqual(a,b);assert.notEqual(a,digest(a));});
test('constant-time comparison rejects different values',()=>{assert.equal(safeEqual(digest('abc'),digest('abc')),true);assert.equal(safeEqual(digest('abc'),digest('def')),false);});
