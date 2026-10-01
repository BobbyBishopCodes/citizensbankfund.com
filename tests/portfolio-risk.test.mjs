import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePortfolioRisk, monthEndObservations, validateAdjustedPrices } from '../scripts/portfolio/risk.mjs';
import { prepareHoldings, staticPortfolio } from '../scripts/portfolio/static.mjs';

const now = '2026-10-01T16:00:00Z';
const months = Array.from({ length: 14 }, (_, index) => {
  const date = new Date(Date.UTC(2025, 7 + index, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
});
const marketReturns = Array.from({ length: 13 }, (_, index) => (index % 5 - 2) / 100);
function fixture() {
  let a = 100, b = 100, index = 1000;
  const benchmark = new Map(), treasury = new Map();
  const rows = months.map((month, offset) => {
    if (offset) {
      const market = marketReturns[offset - 1];
      a *= 1 + 2 * market;
      b *= 1 + market;
      index *= 1 + market;
    }
    const closeDate = `${month}-28`;
    benchmark.set(Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1, { date: closeDate, value: index });
    treasury.set(Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1, { date: closeDate, value: 3 + offset / 10 });
    return { month, closeDate, adjustedCloses: { AAA: String(a), BBB: String(b) } };
  });
  const prices = { schemaVersion: 1, priceBasis: 'split-and-dividend-adjusted', source: 'Reviewed fixture', months: rows };
  const view = { calculatedAt: now, positions: [
    { symbol: 'AAA', assetType: 'stock', weightRatio: .4 },
    { symbol: 'BBB', assetType: 'fund', weightRatio: .4 },
    { symbol: null, assetType: 'cash', weightRatio: .2 },
  ] };
  return { prices, benchmark, treasury, view };
}

test('twelve monthly current-weight returns produce known Beta and annualized Sharpe with cash included', () => {
  const { prices, benchmark, treasury, view } = fixture();
  const risk = calculatePortfolioRisk(view, prices, benchmark, treasury, now);
  assert.equal(risk.status, 'available');
  assert.equal(risk.windowStartMonth, '2025-10');
  assert.equal(risk.windowEndMonth, '2026-09');
  assert.equal(risk.monthlyReturns.length, 12);
  assert.ok(Math.abs(risk.beta - 1.2) < 1e-12);
  const expected = risk.monthlyReturns.map((row, index) => {
    const monthIndex = index + 2;
    const p = 1.2 * marketReturns[monthIndex - 1];
    const rf = Math.pow(1 + (3 + (monthIndex - 1) / 10) / 100, 1 / 12) - 1;
    assert.ok(Math.abs(row.portfolioReturnRatio - p) < 1e-12);
    assert.ok(Math.abs(row.riskFreeReturnRatio - rf) < 1e-12);
    return p - rf;
  });
  const average = expected.reduce((sum, value) => sum + value, 0) / 12;
  const deviation = Math.sqrt(expected.reduce((sum, value) => sum + (value - average) ** 2, 0) / 11);
  assert.ok(Math.abs(risk.sharpe - Math.sqrt(12) * average / deviation) < 1e-12);
});

test('latest missing month retains one dated window; missing holding and older history are unavailable', () => {
  const { prices, benchmark, treasury, view } = fixture();
  prices.months.pop();
  const awaiting = calculatePortfolioRisk(view, prices, benchmark, treasury, now);
  assert.equal(awaiting.status, 'awaiting-month');
  assert.equal(awaiting.windowEndMonth, '2026-08');
  prices.months.pop();
  assert.equal(calculatePortfolioRisk(view, prices, benchmark, treasury, now).reason, 'missing-history');
  prices.months.push(...fixture().prices.months.slice(-2));
  view.positions.push({ symbol: 'NEW', assetType: 'stock', weightRatio: .1 });
  assert.equal(calculatePortfolioRisk(view, prices, benchmark, treasury, now).reason, 'missing-history');
});

test('zero variance, mismatched closing dates and malformed adjusted prices do not yield numbers', () => {
  const { prices, benchmark, treasury, view } = fixture();
  for (const value of benchmark.values()) value.value = 1000;
  assert.equal(calculatePortfolioRisk(view, prices, benchmark, treasury, now).reason, 'zero-variance');
  const other = fixture();
  other.prices.months[3].closeDate = `${other.prices.months[3].month}-27`;
  assert.throws(() => calculatePortfolioRisk(other.view, other.prices, other.benchmark, other.treasury, now), /date does not match/);
  other.prices.months[3].closeDate = `${other.prices.months[3].month}-28`;
  other.prices.months[3].adjustedCloses.AAA = '0';
  assert.throws(() => validateAdjustedPrices(other.prices), /Invalid adjusted-price value/);
  const duplicate = fixture().prices;
  duplicate.months.push(duplicate.months[0]);
  assert.throws(() => validateAdjustedPrices(duplicate), /Duplicate/);
});

test('FRED parsing chooses last valid close in each month and rejects bad observations', () => {
  const values = monthEndObservations([
    { date: '2026-09-30', value: '7000' },
    { date: '2026-09-29', value: '.' },
    { date: '2026-09-28', value: '6900' },
    { date: '2026-10-01', value: '7010' },
  ], 'index');
  assert.equal(values.get(2026 * 12 + 8).date, '2026-09-30');
  assert.equal(values.get(2026 * 12 + 9).value, 7010);
  assert.throws(() => monthEndObservations([{ date: '2026-09-30', value: 'bad' }], 'index'), /Invalid FRED value/);
});

test('static portfolio export includes the calculated risk block for the browser', async () => {
  const { prices, benchmark, treasury } = fixture();
  const csv = 'Description,SYMBOL/CUSIP,Quantity,Delayed Price,Current Value,Product Type,Amount Invested (†),Estimated Annual Income\nA,AAA,400,100,40000,Stock,40000,0\nB,BBB,400,100,40000,Funds,40000,0\nCash,,20000,1,20000,Cash & Cash Alternatives,20000,0\n';
  const holdings = prepareHoldings(csv, '2026-09-30', now).holdings;
  const output = await staticPortfolio(holdings, { clock: () => now, riskPrices: prices, benchmark, treasury });
  assert.equal(output.risk.status, 'available');
  assert.ok(Math.abs(output.risk.beta - 1.2) < 1e-12);
  assert.equal(output.risk.weightsAsOf, output.calculatedAt);
});

test('invalid cached inputs leave the portfolio export available with unavailable risk cards', async () => {
  const { prices, benchmark, treasury } = fixture();
  const csv = 'Description,SYMBOL/CUSIP,Quantity,Delayed Price,Current Value,Product Type,Amount Invested (†),Estimated Annual Income\nA,AAA,400,100,40000,Stock,40000,0\nB,BBB,400,100,40000,Funds,40000,0\nCash,,20000,1,20000,Cash & Cash Alternatives,20000,0\n';
  const holdings = prepareHoldings(csv, '2026-09-30', now).holdings;
  prices.months[0].adjustedCloses.AAA = 'broken';
  const output = await staticPortfolio(holdings, { clock: () => now, riskPrices: prices, benchmark, treasury });
  assert.equal(output.risk.status, 'unavailable');
  assert.equal(output.risk.reason, 'invalid-history');
});
