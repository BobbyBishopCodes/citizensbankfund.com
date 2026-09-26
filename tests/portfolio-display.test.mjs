import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareHoldings, staticPortfolio } from '../scripts/portfolio/static.mjs';
import { parsePortfolioData, priceState, filterAndSort, money, percent } from '../src/lib/portfolio/display.ts';

const clock = () => '2026-09-25T15:00:00Z';
const csv = 'Description,SYMBOL/CUSIP,Quantity,Delayed Price,Current Value,Product Type,Amount Invested (†),Estimated Annual Income\nExample fund,VOO,100,600,60000,Funds,50000,1000\nExample stock,MSFT,100,400,40000,Stock,42000,500\nCash,,10000,1,10000,Cash & Cash Alternatives,10000,0\n';
const source = prepareHoldings(csv, '2026-09-24', clock()).holdings;
const data = await staticPortfolio(source, { clock });

test('current published holdings produce a valid browser read model without fixed totals or symbols', async () => {
  const current = JSON.parse(await readFile(new URL('../content/portfolio/holdings.json', import.meta.url), 'utf8'));
  const view = await staticPortfolio(current);
  assert.equal(parsePortfolioData(view).summary.marketValueCents,
    current.positions.reduce((sum, position) => sum + position.referenceValueCents, 0));
});

test('browser read model accepts generated data and rejects corrupt or incomplete financial data', () => {
  assert.equal(parsePortfolioData(data).summary.marketValueCents, data.summary.marketValueCents);
  for (const edit of [value => { value.summary.marketValueCents++; }, value => { value.summary.gainVsStartingCapitalCents++; }, value => { value.summary.estimatedAnnualIncomeCents = undefined; }, value => { value.positions[0].marketValueCents = NaN; }, value => { value.positions.push(value.positions[0]); }, value => { value.publication = null; }]) {
    const bad = structuredClone(data); edit(bad);
    assert.throws(() => parsePortfolioData(bad), /unavailable/);
  }
  assert.throws(() => parsePortfolioData(null));
});

test('headline gain uses original fund capital while position gains retain broker invested amounts', () => {
  assert.equal(data.summary.startingCapitalCents, 10_000_000);
  assert.equal(data.summary.marketValueCents, 11_000_000);
  assert.equal(data.summary.gainVsStartingCapitalCents, 1_000_000);
  assert.equal(data.summary.gainVsStartingCapitalRatio, 0.1);
  assert.equal(data.summary.investmentGainCents, 800_000);
  assert.equal(data.positions.find(position => position.symbol === 'VOO').investmentGainCents, 1_000_000);
});

test('search, holding-type filters and numeric sorting preserve portfolio totals and cash ordering', () => {
  const before = JSON.stringify(data);
  const result = filterAndSort(data.positions, ' msft ', 'all', 'marketValueCents', 'desc');
  assert.deepEqual(result.map(position => position.symbol), ['MSFT']);
  assert.equal(filterAndSort(data.positions, 'unlikely-match', 'all', 'marketValueCents', 'desc').length, 0);
  const stocks = filterAndSort(data.positions, '', 'stock', 'investmentGainCents', 'desc');
  assert.ok(stocks.every(position => position.assetType === 'stock'));
  assert.ok(stocks[0].investmentGainCents >= stocks.at(-1).investmentGainCents);
  const all = filterAndSort(data.positions, '', 'all', 'marketValueCents', 'desc');
  assert.equal(all[0].symbol, 'VOO');
  assert.equal(all.at(-1).assetType, 'cash');
  assert.equal(JSON.stringify(data), before);
});

test('quote freshness expires while a static page stays open, independent of build timestamp', () => {
  const position = { ...data.positions.find(position => position.symbol === 'MSFT'), valueSource: 'quantity-times-quote', priceAsOf: '2026-09-25T15:00:00Z' };
  assert.equal(priceState(position, Date.parse('2026-09-25T15:05:00Z')), 'Market quote');
  assert.equal(priceState(position, Date.parse('2026-09-25T15:16:00Z')), 'Stale quote');
  assert.equal(priceState({ ...position, valueSource: 'broker-reported-value' }, Date.now()), 'CSV snapshot');
  assert.equal(money(null), 'Unavailable');
  assert.equal(money(0), '$0.00');
  assert.equal(percent(0), '0.00%');
});
