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

test('RSM / Regional Sales Manager gets HQ line', () => {
  const a = getOfferTravelAllowanceLine('Regional Sales Manager');
  assert.equal(a?.roleKey, 'RSM');
  assert.match(a.text, /Headquarters - Rs 500/);
  assert.equal(getOfferTravelAllowanceLine('RSM')?.roleKey, 'RSM');
  assert.equal(getOfferTravelAllowanceLine('Regional Business Manager')?.roleKey, 'RSM');
  assert.equal(getOfferTravelAllowanceLine('Regional development manager')?.roleKey, 'RSM');
  assert.equal(getOfferTravelAllowanceLine('RBM')?.roleKey, 'RSM');
});

test('ZSM / Zonal Sales Manager gets HQ line', () => {
  const a = getOfferTravelAllowanceLine('Zonal Sales Manager');
  assert.equal(a?.roleKey, 'ZSM');
  assert.match(a.text, /Headquarters - Rs 600/);
  assert.match(a.text, /Outstation - Rs 800/);
  assert.match(a.text, /Stay - Rs 2000 \+ GST/);
  assert.match(a.text, /Per Km - Rs 3\.50/);
  assert.equal(getOfferTravelAllowanceLine('ZSM')?.roleKey, 'ZSM');
  assert.equal(getOfferTravelAllowanceLine('Zonal Business Manager')?.roleKey, 'ZSM');
});

test('GM_PRODUCT / General Manager - Product gets executive travel line', () => {
  const gmProd = getOfferTravelAllowanceLine('General Manager - Product');
  assert.equal(gmProd?.roleKey, 'GM_PRODUCT');
  assert.equal(gmProd.text, 'Headquarters - Rs 600, Outstation - Rs 800, Stay - Rs 2000 + GST, Per Km - Rs 3.50');

  const gm = getOfferTravelAllowanceLine('GM - Product');
  assert.equal(gm?.roleKey, 'GM_PRODUCT');
  assert.equal(gm.text, 'Headquarters - Rs 600, Outstation - Rs 800, Stay - Rs 2000 + GST, Per Km - Rs 3.50');

  assert.equal(getOfferTravelAllowanceLine('General Manager')?.roleKey, 'GM_PRODUCT');
  assert.equal(getOfferTravelAllowanceLine('Group Product Manager')?.roleKey, 'GM_PRODUCT');
});

test('Admin, HR, IT and unknown roles get no line', () => {
  assert.equal(getOfferTravelAllowanceLine('Admin'), null);
  assert.equal(getOfferTravelAllowanceLine('HR Manager', 'HR'), null);
  assert.equal(getOfferTravelAllowanceLine('IT Executive', 'IT'), null);
  assert.equal(getOfferTravelAllowanceLine('General Manager', 'IT'), null);
  assert.equal(getOfferTravelAllowanceLine('Office head'), null);
  assert.equal(getOfferTravelAllowanceLine(''), null);
});

