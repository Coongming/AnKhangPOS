import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getCustomerRecency, getRecencyMonthStart, selectCustomersByRecency,
  type CustomerRecency,
} from '../src/lib/customer-recency';

const asOf = new Date('2026-09-26T12:00:00+07:00');

test('calendar-month boundaries are inclusive and mutually exclusive', () => {
  const cases: Array<[string, CustomerRecency]> = [
    ['2026-09-26', 'month_1'], ['2026-08-26', 'month_1'],
    ['2026-08-25', 'month_2'], ['2026-07-26', 'month_2'],
    ['2026-07-25', 'month_3'], ['2026-06-26', 'month_3'],
    ['2026-06-25', 'month_4'], ['2026-05-26', 'month_4'],
    ['2026-05-25', 'older'], ['2025-01-01', 'older'],
  ];
  for (const [date, expected] of cases) {
    assert.equal(getCustomerRecency(new Date(`${date}T00:00:00+07:00`), asOf).recency, expected, date);
  }
});

test('no completed purchase has no recency or day count', () => {
  assert.deepEqual(getCustomerRecency(null, asOf), { recency: 'never', daysSinceLastPurchase: null });
});

test('day counts follow Vietnam midnight, not elapsed 24-hour periods', () => {
  const now = new Date('2026-09-26T00:01:00+07:00');
  assert.equal(getCustomerRecency(new Date('2026-09-25T23:59:00+07:00'), now).daysSinceLastPurchase, 1);
  assert.equal(getCustomerRecency(new Date('2026-09-26T00:00:00+07:00'), now).daysSinceLastPurchase, 0);
  assert.equal(getCustomerRecency(new Date('2026-08-25T17:00:00Z'), asOf).recency, 'month_1');
  assert.equal(getCustomerRecency(new Date('2026-08-25T16:59:59Z'), asOf).recency, 'month_2');
});

test('calendar months clamp end-of-month without cascading the clamp', () => {
  const march = new Date('2026-03-31T10:00:00+07:00');
  assert.equal(getRecencyMonthStart(march, 1).toISOString(), '2026-02-27T17:00:00.000Z');
  assert.equal(getRecencyMonthStart(march, 2).toISOString(), '2026-01-30T17:00:00.000Z');
  assert.equal(getCustomerRecency(new Date('2026-02-28T00:00:00+07:00'), march).recency, 'month_1');
  assert.equal(getCustomerRecency(new Date('2026-02-27T23:59:59+07:00'), march).recency, 'month_2');
  const leapYear = new Date('2024-03-31T10:00:00+07:00');
  assert.equal(getRecencyMonthStart(leapYear, 1).toISOString(), '2024-02-28T17:00:00.000Z');
});

test('month boundaries cross a year correctly', () => {
  const january = new Date('2026-01-31T10:00:00+07:00');
  assert.equal(getRecencyMonthStart(january, 4).toISOString(), '2025-09-29T17:00:00.000Z');
  assert.equal(getCustomerRecency(new Date('2025-09-30T00:00:00+07:00'), january).recency, 'month_4');
  assert.equal(getCustomerRecency(new Date('2025-09-29T23:59:59+07:00'), january).recency, 'older');
});

test('future business dates cannot silently produce negative day counts', () => {
  assert.throws(() => getCustomerRecency(new Date('2026-09-27T00:00:00+07:00'), asOf));
});

const customers = [
  { code: 'KH0001', name: 'Chiến', phone: '0901234567', isActive: true, recency: 'month_1' as const },
  { code: 'KH0002', name: 'Chị An', phone: null, isActive: false, recency: 'month_2' as const },
  { code: 'KH0003', name: 'Bình', phone: '0917777777', isActive: true, recency: 'month_3' as const },
  { code: 'KH0004', name: 'Hà', phone: null, isActive: true, recency: 'month_4' as const },
  { code: 'KH0005', name: 'Minh', phone: null, isActive: true, recency: 'older' as const },
  { code: 'KH0006', name: 'Chiến mới', phone: null, isActive: true, recency: 'never' as const },
];

test('all customers are counted once, including inactive and never purchased', () => {
  const result = selectCustomersByRecency(customers, '', 'all', 'all');
  assert.equal(result.customers.length, 6);
  assert.deepEqual(result.counts, { all: 6, month_1: 1, month_2: 1, month_3: 1, month_4: 1, older: 1, never: 1 });
  assert.equal(Object.entries(result.counts).filter(([key]) => key !== 'all').reduce((sum, [, count]) => sum + count, 0), result.counts.all);
});

test('selecting a bucket does not erase the counts of other buckets', () => {
  const result = selectCustomersByRecency(customers, '', 'all', 'month_2');
  assert.deepEqual(result.customers.map(c => c.code), ['KH0002']);
  assert.equal(result.counts.all, 6);
  assert.equal(result.counts.month_1, 1);
});

test('search matches code, name or phone with trimming and case folding', () => {
  assert.deepEqual(selectCustomersByRecency(customers, ' kh0001 ', 'all', 'all').customers.map(c => c.code), ['KH0001']);
  assert.equal(selectCustomersByRecency(customers, 'CHIẾN', 'all', 'all').customers.length, 2);
  assert.equal(selectCustomersByRecency(customers, '7777', 'all', 'all').customers[0].code, 'KH0003');
  assert.equal(selectCustomersByRecency(customers, 'no-match', 'all', 'all').counts.all, 0);
});

test('search, activity and recency combine and update all counts', () => {
  const result = selectCustomersByRecency(customers, 'chiến', 'active', 'never');
  assert.equal(result.counts.all, 2);
  assert.equal(result.counts.month_1, 1);
  assert.equal(result.counts.never, 1);
  assert.deepEqual(result.customers.map(c => c.code), ['KH0006']);
  assert.equal(selectCustomersByRecency(customers, '', 'active', 'month_2').customers.length, 0);
  assert.equal(selectCustomersByRecency(customers, '', 'inactive', 'all').counts.all, 1);
});

test('empty data produces zero counts and does not change the source array', () => {
  assert.equal(selectCustomersByRecency([], '', 'all', 'all').counts.all, 0);
  const before = JSON.stringify(customers);
  selectCustomersByRecency(customers, 'chiến', 'active', 'month_1');
  assert.equal(JSON.stringify(customers), before);
});
