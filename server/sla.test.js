import test from 'node:test';import assert from 'node:assert/strict';
import {nextBusinessTime,addBusinessMinutes,businessMinutesBetween,deadlines} from './sla.js';
test('moves after-hours Friday to Monday morning IST',()=>assert.equal(nextBusinessTime('2026-11-20T14:00:00Z').toISOString(),'2026-11-23T04:00:00.000Z'));
test('adds business minutes across a weekend',()=>assert.equal(addBusinessMinutes('2026-11-20T12:30:00Z',120).toISOString(),'2026-11-23T05:30:00.000Z'));
test('counts working time only',()=>assert.equal(businessMinutesBetween('2026-11-20T12:30:00Z','2026-11-23T05:30:00Z'),120));
test('priorities have different deadlines',()=>assert.ok(deadlines('high',new Date('2026-11-23T04:00:00Z')).first_response_due<deadlines('low',new Date('2026-11-23T04:00:00Z')).first_response_due));
