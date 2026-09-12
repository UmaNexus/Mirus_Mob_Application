import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getOfferTravelAllowanceLine } from '../utils/offerTravelAllowance.js';

test('BDM / Business Development Manager gets per-km line', () => {
  const a = getOfferTravelAllowanceLine('Business development manager');
  assert.equal(a?.roleKey, 'BDM');
  assert.match(a.text, /Per Km - Rs 3\.50/);
  assert.match(a.text, /Daily - Rs 320/);
  assert.equal(getOfferTravelAllowanceLine('BDM')?.roleKey, 'BDM');
});

test('ASM / Area Sales Manager gets stay line', () => {
  const a = getOfferTravelAllowanceLine('Area Sales Manager');
  assert.equal(a?.roleKey, 'ASM');
  assert.match(a.text, /Stay - Rs 1400 \+ GST/);
  assert.equal(getOfferTravelAllowanceLine('Area development manager')?.roleKey, 'ASM');
});

test('RBM / Regional Business Manager gets HQ line', () => {
  const a = getOfferTravelAllowanceLine('Regional Business Manager');
  assert.equal(a?.roleKey, 'RBM');
  assert.match(a.text, /Headquarters - Rs 500/);
  assert.equal(getOfferTravelAllowanceLine('Regional development manager')?.roleKey, 'RBM');
});

test('Admin, HR, IT and unknown roles get no line', () => {
  assert.equal(getOfferTravelAllowanceLine('Admin'), null);
  assert.equal(getOfferTravelAllowanceLine('HR Manager', 'HR'), null);
  assert.equal(getOfferTravelAllowanceLine('IT Executive', 'IT'), null);
  assert.equal(getOfferTravelAllowanceLine('Office head'), null);
  assert.equal(getOfferTravelAllowanceLine(''), null);
});
