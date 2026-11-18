import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from './phone.js';
import { normalizeEmail } from './email.js';
import { isQuietHours, nextAllowedTime, fromIst, istParts } from './time.js';

test('normalizePhone handles Indian formats', () => {
  for (const raw of ['098450 00001', '91-9845000001', '+91 98450 00001', '9845000001', '0091 9845000001']) {
    assert.equal(normalizePhone(raw), '+919845000001', raw);
  }
  assert.equal(normalizePhone('+1 408 555 0100'), '+14085550100');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone('+91 12345'), null);
});

test('normalizeEmail collapses gmail aliases', () => {
  assert.equal(normalizeEmail(' A.Rjun+ads@GMAIL.com '), 'arjun@gmail.com');
  assert.equal(normalizeEmail('a.b@example.com'), 'a.b@example.com');
  assert.equal(normalizeEmail('bad'), null);
});

test('quiet hours 21:00-09:00 IST', () => {
  assert.equal(isQuietHours(fromIst(2026, 10, 17, 22, 0)), true);
  assert.equal(isQuietHours(fromIst(2026, 10, 17, 8, 59)), true);
  assert.equal(isQuietHours(fromIst(2026, 10, 17, 9, 0)), false);
  const next = nextAllowedTime(fromIst(2026, 10, 17, 23, 30));
  assert.deepEqual(istParts(next), { y: 2026, m: 10, day: 18, hour: 9, minute: 0 });
});

import { parseBudgetInr, parseBhk } from './budget.js';
import { scoreLead } from './scoring.js';
import { checkPromotionalContent } from './compliance-rules.js';

test('parseBudgetInr', () => {
  assert.deepEqual(parseBudgetInr('1.1 - 1.3 Cr'), { min: 11_000_000, max: 13_000_000 });
  assert.deepEqual(parseBudgetInr('80 lakhs to 1 crore'), { min: 8_000_000, max: 10_000_000 });
  assert.deepEqual(parseBudgetInr('under 90L'), { max: 9_000_000 });
  assert.deepEqual(parseBudgetInr('₹90,00,000'), { min: 8_100_000, max: 9_900_000 });
  assert.equal(parseBudgetInr('hello'), null);
});

test('parseBhk', () => {
  assert.deepEqual(parseBhk('3BHK'), [3]);
  assert.deepEqual(parseBhk('2/3 BHK'), [2, 3]);
  assert.deepEqual(parseBhk('2.5 bhk'), [2.5]);
});

test('scoreLead hot lead', () => {
  const r = scoreLead({
    answers: { budgetMinInr: 1e7, budgetMaxInr: 1.3e7, bhk: [3], timeline: 'within_3_months', loanNeed: 'yes' },
    hasValidPhone: true, hasEmail: true, projectPriceMinInr: 8.9e6, projectPriceMaxInr: 1.65e7, repliedOnWhatsApp: true,
  });
  assert.equal(r.temperature, 'hot');
});

test('promotional content needs RERA', () => {
  assert.equal(checkPromotionalContent('Lake view homes', 'PRM/KA/RERA/1').allowed, false);
  assert.equal(checkPromotionalContent('Lake view homes. RERA: PRM/KA/RERA/1', 'PRM/KA/RERA/1').allowed, true);
  assert.equal(checkPromotionalContent('Assured returns! RERA PRM/KA/RERA/1', 'PRM/KA/RERA/1').allowed, false);
});
