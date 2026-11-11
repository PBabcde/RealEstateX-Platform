import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCircleOne, circleOneExample } from '../src/lib/circle-one.ts';
import { parseCircleOneNumber } from '../src/lib/circle-one-form.ts';

test('includes acquisition, renovation and both kit costs exactly once', () => {
  const r = calculateCircleOne(circleOneExample);
  assert.equal(r.valid, true);
  assert.equal(r.totalInvestment, 256000);
  assert.equal(r.kitInvestment, 16000);
  assert.equal(r.grossAnnualRent, 22800);
  assert.equal(r.vacancyLoss, 1140);
  assert.equal(r.netAnnualRent, 19260);
  assert.equal(r.pvKwp, 4.5);
  assert.equal(r.eligible, true);
  assert.ok(Math.abs(r.netYieldPercent - 7.5234375) < 1e-10);
});

test('7.5% is inclusive; just below the threshold fails without display rounding', () => {
  const base = { ...circleOneExample, purchasePrice: 150000, acquisitionCosts: 10000,
    renovationCosts: 28000, heatPumpCosts: 5000, pvCosts: 7000,
    vacancyPercent: 0, annualOperatingCosts: 0, monthlyRent: 1250 };
  assert.equal(calculateCircleOne(base).yieldEligible, true);
  assert.equal(calculateCircleOne({ ...base, monthlyRent: 1249.99 }).yieldEligible, false);
});

test('radius is inclusive and adjustable from 50 to 60; closer properties qualify', () => {
  for (const radiusKm of [50, 55, 60]) {
    assert.equal(calculateCircleOne({ ...circleOneExample, radiusKm, distanceKm: radiusKm }).regionEligible, true);
    assert.equal(calculateCircleOne({ ...circleOneExample, radiusKm, distanceKm: radiusKm + 0.01 }).regionEligible, false);
  }
  assert.equal(calculateCircleOne({ ...circleOneExample, distanceKm: 0 }).regionEligible, true);
});

test('Het Gooi qualifies separately, while outside-region properties fail', () => {
  assert.equal(calculateCircleOne({ ...circleOneExample, region: 'gooi', distanceKm: 100 }).regionEligible, true);
  assert.equal(calculateCircleOne({ ...circleOneExample, region: 'outside' }).eligible, false);
});

test('vacancy affects net yield, never the gross BAR gate or gross required rent', () => {
  const r = calculateCircleOne({ ...circleOneExample, vacancyPercent: 100 });
  assert.equal(r.valid, true);
  assert.equal(r.requiredMonthlyRent, 1600);
  assert.equal(r.eligible, true);
  assert.equal(r.netAnnualRent, -2400);
});

test('rejects invalid numeric input and incomplete mandatory kits', () => {
  for (const patch of [
    { purchasePrice: 0 }, { purchasePrice: NaN }, { monthlyRent: Infinity },
    { acquisitionCosts: -1 }, { vacancyPercent: 101 }, { radiusKm: 49 },
    { radiusKm: 61 }, { heatPumpCosts: 0 }, { pvCosts: 0 },
    { panelCount: 0 }, { panelCount: 1.5 }, { panelWp: 0 }, { region: 'unknown' },
    { purchasePrice: Number.MAX_VALUE, renovationCosts: Number.MAX_VALUE },
  ]) {
    assert.equal(calculateCircleOne({ ...circleOneExample, ...patch }).valid, false, JSON.stringify(patch));
  }
});

test('rent needed is rounded up to cents and reaches the target, one cent less does not', () => {
  const r = calculateCircleOne(circleOneExample);
  const recalculated = calculateCircleOne({ ...circleOneExample, monthlyRent: r.requiredMonthlyRent });
  assert.equal(recalculated.yieldEligible, true);
  assert.equal(calculateCircleOne({ ...circleOneExample, monthlyRent: r.requiredMonthlyRent - 0.01 }).yieldEligible, false);
});

test('Dutch number parsing rejects ambiguous thousands separators and empty fields', () => {
  for (const raw of ['', ' ', '1.900', '1,900', '1 900', '1.900,50', 'NaN', '-1', '1e3']) {
    assert.ok(parseCircleOneNumber(raw).error, raw);
  }
  assert.equal(parseCircleOneNumber('1900,50').value, 1900.5);
  assert.equal(parseCircleOneNumber('1900.50').value, 1900.5);
  assert.equal(parseCircleOneNumber('0').value, 0);
  assert.ok(parseCircleOneNumber('1,5', true).error);
  assert.equal(parseCircleOneNumber('10', true).value, 10);
});
