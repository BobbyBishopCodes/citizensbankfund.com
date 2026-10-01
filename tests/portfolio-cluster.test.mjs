import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portfolioClusterAnalysis } from '../scripts/portfolio/cluster.mjs';

const positions = [
  { symbol: 'AAA', assetType: 'stock' },
  { symbol: 'BBB', assetType: 'fund' },
  { symbol: 'CCC', assetType: 'stock' },
  { symbol: null, assetType: 'cash' },
];
const analysis = {
  schemaVersion: 1, symbols: ['AAA', 'BBB', 'CCC'], startDate: '2025-01-02',
  endDate: '2026-01-02', observations: 250,
  correlation: [[1, .2, .1], [.2, 1, -.3], [.1, -.3, 1]],
  leafOrder: [1, 0, 2],
  branches: [{ x: [0, 1, 1, 0], y: [5, 5, 15, 15] }, { x: [0, 2, 2, 1], y: [25, 25, 10, 10] }],
  groups: [0, 1, 2], coordinates: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
};

test('cluster charts follow the current holdings and reject stale symbol sets', () => {
  assert.deepEqual(portfolioClusterAnalysis(analysis, positions), analysis);
  assert.equal(portfolioClusterAnalysis(analysis, [...positions, { symbol: 'NEW', assetType: 'stock' }]), null);
  assert.equal(portfolioClusterAnalysis({ ...analysis, correlation: [[1, .2, .1], [.4, 1, -.3], [.1, -.3, 1]] }, positions), null);
});
