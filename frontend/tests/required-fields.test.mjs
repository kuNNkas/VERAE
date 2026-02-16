import test from 'node:test';
import assert from 'node:assert/strict';

import { computeMissingRequired, computeProgress } from '../risk-form-logic.mjs';

test('computeProgress counts BMXBMI alternative as required slot', () => {
  const progress = computeProgress({
    LBXHGB: '120',
    LBXMCVSI: '80',
    LBXMCHSI: '330',
    LBXRDW: '14.5',
    LBXRBCSI: '4.5',
    LBXHCT: '38',
    RIDAGEYR: '31',
    BMXBMI: '23',
  });
  assert.equal(progress, 8);
});

test('computeProgress counts BMXHT+BMXWT alternative as required slot', () => {
  const progress = computeProgress({
    LBXHGB: '120',
    LBXMCVSI: '80',
    LBXMCHSI: '330',
    LBXRDW: '14.5',
    LBXRBCSI: '4.5',
    LBXHCT: '38',
    RIDAGEYR: '31',
    BMXHT: '167',
    BMXWT: '64',
  });
  assert.equal(progress, 8);
});

test('computeMissingRequired reports missing BMI alternative', () => {
  const missing = computeMissingRequired({
    LBXHGB: 120,
    LBXMCVSI: 80,
    LBXMCHSI: 330,
    LBXRDW: 14.5,
    LBXRBCSI: 4.5,
    LBXHCT: 38,
    RIDAGEYR: 31,
  });

  assert.deepEqual(missing, ['BMXBMI_or_BMXHT_BMXWT']);
});
