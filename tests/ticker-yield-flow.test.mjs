import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { staticPortfolio } from '../scripts/portfolio/static.mjs';
import { prepareTickerAnalysis } from '../src/lib/portfolio/ticker-data.ts';

const fixture = async name => JSON.parse(await readFile(new URL(`./fixtures/black-litterman/${name}.json`, import.meta.url), 'utf8'));
const holdings = await fixture('holdings');
const history = await fixture('holdings-history');
const candidate = await fixture('nu-ticker');
const now = Date.parse(candidate.generatedAt);
const portfolio = await staticPortfolio(holdings, { blackLittermanHistory: history, clock: () => new Date(now).toISOString() });
const view = { ticker: 'NU', assetClass: 'equities', targetPrice: 20, months: 12, confidence: 75 };

test('the calculation uses the Cloudflare ticker yield from the same history response', async () => {
  let calls = 0;
  const prepared = await prepareTickerAnalysis(portfolio, view, { now, endpoint: 'https://worker.test', fetchImpl: async () => {
    calls++;
    return new Response(JSON.stringify({ ...candidate, annualYieldRatio: 0.03 }));
  } });
  assert.equal(calls, 1);
  assert.equal(prepared.request.view.expectedAnnualYield, 0.03);
  assert.equal(prepared.request.view.ticker, 'NU');
  assert.deepEqual(prepared.data.positions, portfolio.positions);
});

test('a missing distribution yield leaves the existing price-only model default in place', async () => {
  const prepared = await prepareTickerAnalysis(portfolio, view, { now, endpoint: 'https://worker.test',
    fetchImpl: async () => new Response(JSON.stringify({ ...candidate, annualYieldRatio: null })) });
  assert.equal(prepared.request.view.expectedAnnualYield, undefined);
  await assert.rejects(prepareTickerAnalysis(portfolio, view, { now, endpoint: 'https://worker.test',
    fetchImpl: async () => new Response(JSON.stringify({ ...candidate, annualYieldRatio: -1 })) }), /yield data is invalid/);
});

test('a held ticker keeps its published yield without a network lookup', async () => {
  const prepared = await prepareTickerAnalysis(portfolio, { ...view, ticker: 'MSFT' }, { now,
    fetchImpl: () => { throw new Error('Unexpected network request'); } });
  assert.equal(prepared.request.view.expectedAnnualYield, portfolio.positions.find(position => position.symbol === 'MSFT').estimatedIncomeYieldRatio);
});
