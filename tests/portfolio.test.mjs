import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePortfolioCsv, csvRecords } from '../src/lib/portfolio/import.ts';
import { cents, positionValue, sumCents } from '../src/lib/portfolio/money.ts';
import { valuePortfolio } from '../src/lib/portfolio/value.ts';
import { portfolioStore } from '../scripts/portfolio/store.mjs';
import { finnhubProvider } from '../scripts/portfolio/provider.mjs';
import { portfolioServer } from '../scripts/portfolio/server.mjs';

const headers = ['Description', 'SYMBOL/CUSIP', 'Quantity', 'Delayed Price', 'Current Value', 'Daily Price Change', 'Daily Value Change', 'Investment Gain/(Loss)', 'Amount Invested / Unit', 'Product Type', 'Amount Invested (†)', 'Estimated Annual Income', 'Time Held'];
const rows = [
  ['Deposit', '', '1,000.000', '$1.00*', '$1,000.00', '', '', '', '$1.00', 'Cash & Cash Alternatives', '$1,000.00', '$1.00', ''],
  ['Example, "Company"', 'ABC', '2.000', '$60.92', '$121.83', '($0.24)', '($0.48)', '$21.83', '$50.00', 'Stock', '$100.00', '$4.00', 'Short'],
  ['Example ETF', 'XYZ', '3.500', '$10.00', '$35.00', '$0.10', '$0.35', '($7.00)', '$12.00', 'Funds', '$42.00', '$0.00', 'Long'],
];
const encode = records => records.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n') + '\r\n';
const csv = encode([headers, ...rows]);
const snapshot = () => parsePortfolioCsv(csv, '2026-09-24');
const quote = (symbol, price = '70.00', asOf = '2026-09-25T14:00:00Z') => ({ symbol, price, previousClose: '60.00', asOf, fetchedAt: asOf, currency: 'USD', provider: 'test' });
const options = { now: '2026-09-25T14:05:00Z' };

test('CSV handles BOM, CRLF, quoted commas/quotes/newlines and reordered headers', () => {
  assert.deepEqual(csvRecords('\uFEFF"a","b"\r\n"c,\"\"d\"\"","e\nf"\r\n'), [['a', 'b'], ['c,"d"', 'e\nf']]);
  const reverse = encode([headers.toReversed(), ...rows.map(row => row.toReversed())]);
  assert.equal(parsePortfolioCsv(reverse, '2026-09-24').positions[1].description, 'Example, "Company"');
  assert.equal(snapshot().positions[0].source.displayedPrice, '1.00');
  assert.equal(snapshot().positions[1].source.holdingPeriod, 'Short');
  assert.equal(snapshot().positions[1].quantity, '2.000');
});

test('money is exact at half-cent boundaries and rejects unsafe totals', () => {
  assert.equal(cents('($1,234.56)'), -123456);
  assert.equal(positionValue('0.1', '0.05'), 1);
  assert.equal(positionValue('3.333333', '10.123456'), 3374);
  assert.equal(sumCents([10, 20, -5]), 25);
  assert.throws(() => sumCents([Number.MAX_SAFE_INTEGER, 1]));
  for (const value of ['1e3', '12,34', '$1.234', '1abc', 'NaN', '$--']) assert.throws(() => cents(value));
});

test('malformed imports fail completely and do not quietly drop positions', () => {
  for (const malformed of ['"a', 'a"b,c', '"a"oops,b']) assert.throws(() => csvRecords(malformed));
  assert.throws(() => parsePortfolioCsv(csv, '2026-02-30'));
  assert.throws(() => parsePortfolioCsv(encode([headers, ...rows, rows[1]]), '2026-09-24'), /Duplicate position/);
  for (const [column, value] of [[2, '-2'], [2, '0'], [2, '2garbage'], [3, '$0'], [9, 'Option'], [1, '123456789'], [1, '037833100']]) {
    const changed = structuredClone(rows); changed[1][column] = value;
    assert.throws(() => parsePortfolioCsv(encode([headers, ...changed]), '2026-09-24'));
  }
  assert.throws(() => parsePortfolioCsv(encode([headers, rows[1].slice(1)]), '2026-09-24'), /Column count/);
  assert.throws(() => parsePortfolioCsv(encode([headers.slice(1), ...rows.map(row => row.slice(1))]), '2026-09-24'), /Missing CSV columns/);
  assert.throws(() => parsePortfolioCsv(encode([[...headers, 'Quantity'], [...rows[1], '2']]), '2026-09-24'), /Duplicate/);
  assert.throws(() => csvRecords('x'.repeat(2 * 1024 * 1024 + 1)), /limit/);
});

test('snapshot reconciles to broker values; tax basis and total returns remain unavailable', () => {
  const imported = snapshot();
  assert.equal(imported.warnings[0].code, 'DISPLAY_PRICE_MISMATCH');
  const view = valuePortfolio(imported, {}, options);
  assert.equal(view.summary.marketValueCents, 115683);
  assert.equal(view.summary.amountInvestedCents, 114200);
  assert.equal(view.summary.investmentGainCents, 1483);
  assert.equal(view.summary.estimatedAnnualIncomeCents, 500);
  assert.equal(view.summary.estimatedIncomeYieldRatio, 500 / 115683);
  assert.equal(view.summary.securitiesCostBasisCents, null);
  assert.equal(view.summary.unrealizedGainCents, null);
  assert.equal(view.summary.totalReturnRatio, null);
  assert.equal(view.summary.ytdReturnRatio, null);
  assert.equal(view.summary.dailyHoldingsChangeCents, null);
  assert.equal(view.summary.securityCount, 2);
  assert.equal(view.positions[1].averageInvestmentPerUnit, 50);
  assert.equal(view.positions[1].averageCostPerUnit, null);
  assert.equal(view.allocations.reduce((sum, item) => sum + item.marketValueCents, 0), view.summary.marketValueCents);
  assert.ok(Math.abs(view.positions.reduce((sum, item) => sum + item.weightRatio, 0) - 1) < 1e-12);
});

test('missing inputs propagate to totals, while genuine zero income is retained', () => {
  const changed = structuredClone(rows); changed[1][11] = ''; changed[1][10] = '';
  const view = valuePortfolio(parsePortfolioCsv(encode([headers, ...changed]), '2026-09-24'), {}, options);
  assert.equal(view.summary.estimatedAnnualIncomeCents, null);
  assert.equal(view.summary.estimatedIncomeYieldRatio, null);
  assert.equal(view.summary.investmentGainCents, null);
  assert.equal(view.positions[2].estimatedAnnualIncomeCents, 0);
  assert.equal(view.coverage.missingIncome, 1);
});

test('explicit cost basis is separate from invested amount', () => {
  const imported = parsePortfolioCsv(encode([[...headers, 'Total Cost Basis'], ...rows.map((row, index) => [...row, index === 1 ? '$110.00' : '$0.00'])]), '2026-09-24');
  const view = valuePortfolio(imported, {}, options);
  assert.equal(view.positions[1].unrealizedGainCents, 1183);
  assert.equal(view.positions[1].investmentGainCents, 2183);
});

test('quotes recompute weights, gains and income yield without mutating holdings', () => {
  const imported = snapshot(), before = JSON.stringify(imported);
  const view = valuePortfolio(imported, { ABC: quote('ABC'), XYZ: quote('XYZ', '20.00') }, options);
  assert.equal(view.summary.marketValueCents, 121000);
  assert.equal(view.summary.investmentGainCents, 6800);
  assert.equal(view.summary.estimatedAnnualIncomeCents, 500);
  assert.equal(view.summary.estimatedIncomeYieldRatio, 500 / 121000);
  assert.equal(view.summary.dailyHoldingsChangeCents, -12000);
  assert.equal(view.coverage.freshQuotes, 2);
  assert.equal(JSON.stringify(imported), before);
});

test('stale, missing, pre-holdings, invalid, wrong currency and future quotes never masquerade as current', () => {
  const stale = valuePortfolio(snapshot(), { ABC: quote('ABC', '70', '2026-09-24T20:00:00Z') }, options);
  assert.equal(stale.coverage.staleQuotes, 1);
  assert.equal(stale.coverage.snapshotPrices, 1);
  assert.equal(stale.summary.dailyHoldingsChangeCents, null);
  for (const bad of [quote('WRONG'), quote('ABC', '70', '2026-09-23T20:00:00Z'), quote('ABC', '70', '2026-09-26T20:00:00Z'), { ...quote('ABC'), currency: 'EUR' }, quote('ABC', '-1'), quote('ABC', 'NaN')]) {
    assert.equal(valuePortfolio(snapshot(), { ABC: bad }, options).positions[1].marketValueCents, 12183);
  }
});

async function temporaryStore(t) {
  const directory = await mkdtemp(join(tmpdir(), 'cbf-portfolio-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { store: portfolioStore(directory), directory };
}

test('store archives raw source, replaces positions, deduplicates, survives rejected uploads and restarts', async t => {
  const { store, directory } = await temporaryStore(t);
  assert.equal(await store.view(), null);
  const imported = await store.importCsv(csv, { asOfDate: '2026-09-24', now: options.now });
  assert.equal((await store.importCsv(csv, { asOfDate: '2026-09-24', now: options.now })).duplicate, true);
  assert.equal((await readdir(join(directory, 'imports'))).length, 1);
  const archive = JSON.parse(await readFile(join(directory, 'imports', `${imported.state.import.id}.json`), 'utf8'));
  assert.equal(archive.rawCsv, csv);
  await assert.rejects(store.importCsv('bad', { asOfDate: '2026-09-24', now: options.now }));
  await assert.rejects(store.importCsv(csv, { asOfDate: '2026-09-23', now: options.now }), /Older/);
  await assert.rejects(store.importCsv(csv, { asOfDate: '2026-09-26', now: options.now }), /future/);
  assert.equal((await portfolioStore(directory).read()).import.id, imported.state.import.id);
  await store.importCsv(encode([headers, rows[0], rows[1]]), { asOfDate: '2026-09-25', now: options.now });
  assert.equal((await store.view(options)).summary.securityCount, 1);
  assert.equal((await readdir(join(directory, 'imports'))).length, 2);
});

test('a concurrent upload prevents old refresh results from overwriting new holdings', async t => {
  const { store } = await temporaryStore(t);
  await store.importCsv(csv, { asOfDate: '2026-09-24', now: options.now });
  let finish, started;
  const ready = new Promise(resolve => { started = resolve; });
  const refresh = store.refresh({ name: 'fake', fetchQuotes: async () => { started(); return new Promise(resolve => { finish = resolve; }); } });
  await ready;
  await store.importCsv(encode([headers, rows[0]]), { asOfDate: '2026-09-25', now: options.now });
  finish({ quotes: { ABC: quote('ABC') }, errors: [] });
  await assert.rejects(refresh, /changed during refresh/);
  assert.equal((await store.view(options)).summary.securityCount, 0);
  assert.deepEqual((await store.read()).quotes, {});
});

test('refresh persists quotes, retains them through outages, and never regresses timestamps', async t => {
  const { store, directory } = await temporaryStore(t);
  await store.importCsv(csv, { asOfDate: '2020-01-01' });
  const time = new Date(Date.now() - 60_000).toISOString();
  const savedQuote = quote('ABC', '70', time);
  await store.refresh({ name: 'test', fetchQuotes: async () => ({ quotes: { ABC: savedQuote }, errors: [{ symbol: 'XYZ', code: 'RATE_LIMITED' }] }) });
  assert.equal((await portfolioStore(directory).read()).quotes.ABC.price, '70');
  await store.refresh({ name: 'test', fetchQuotes: async () => ({ quotes: {}, errors: [{ symbol: 'ABC', code: 'QUOTE_UNAVAILABLE' }] }) });
  assert.equal((await store.read()).quotes.ABC.price, '70');
  assert.equal((await store.view()).lastRefresh.errors[0].code, 'QUOTE_UNAVAILABLE');
  await store.refresh({ name: 'test', fetchQuotes: async () => ({ quotes: { ABC: quote('ABC', '65', '2020-01-02T20:00:00Z') }, errors: [] }) });
  assert.equal((await store.read()).quotes.ABC.price, '70');
  assert.equal((await store.read()).lastRefresh.errors[0].code, 'OLDER_QUOTE_IGNORED');
});

test('unsafe aggregate totals and quote overflow cannot replace a good state', async t => {
  const { store } = await temporaryStore(t);
  const original = await store.importCsv(csv, { asOfDate: '2020-01-01' });
  const huge = structuredClone(rows);
  huge[0][4] = '$90,071,992,547,400.00'; huge[0][2] = '90071992547400';
  await assert.rejects(store.importCsv(encode([headers, ...huge]), { asOfDate: '2020-01-02' }), /safe integer/);
  assert.equal((await store.read()).import.id, original.state.import.id);
  const time = new Date(Date.now() - 60_000).toISOString();
  await assert.rejects(store.refresh({ name: 'test', fetchQuotes: async () => ({ quotes: { ABC: quote('ABC', '9007199254740992', time) }, errors: [] }) }), /safe integer/);
  assert.deepEqual((await store.read()).quotes, {});
});

test('a second process cannot write while an import lock is held', async t => {
  const { store, directory } = await temporaryStore(t);
  const { writeFile, unlink } = await import('node:fs/promises');
  await store.importCsv(csv, { asOfDate: '2020-01-01' });
  const lock = join(directory, 'write.lock');
  await writeFile(lock, 'test writer');
  await assert.rejects(portfolioStore(directory).importCsv(csv, { asOfDate: '2020-01-02' }), /write in progress/);
  await unlink(lock);
  assert.equal((await store.read()).snapshot.asOfDate, '2020-01-01');
});

test('provider adapter handles success, invalid prices, throttling and network failures without leaking secrets', async () => {
  const calls = [];
  const provider = finnhubProvider({ apiKey: 'test-secret', spacingMs: 0, now: () => new Date(options.now), fetchImpl: async (url, init) => {
    calls.push(url);
    assert.equal(init.headers['X-Finnhub-Token'], 'test-secret');
    const symbol = url.searchParams.get('symbol');
    if (symbol === 'ABC') return { ok: true, json: async () => ({ c: 70, pc: 60, t: Date.parse('2026-09-25T14:00:00Z') / 1000 }) };
    if (symbol === 'RATE') return { ok: false, status: 429 };
    if (symbol === 'ZERO') return { ok: true, json: async () => ({ c: 0, t: 0 }) };
    throw new Error('test-secret network detail');
  } });
  const result = await provider.fetchQuotes(['ABC', 'ABC', 'RATE', 'ZERO', 'FAIL']);
  assert.equal(calls.length, 4);
  assert.equal(result.quotes.ABC.price, '70');
  assert.equal(result.errors.length, 3);
  assert.ok(result.errors.some(error => error.code === 'RATE_LIMITED'));
  assert.ok(!JSON.stringify(result).includes('test-secret'));
  assert.ok(calls.every(url => !url.searchParams.has('token')));
  assert.throws(() => finnhubProvider(), /API_KEY/);
});

test('HTTP API requires authentication, accepts uploads and leaves data intact after bad uploads', async t => {
  const { store } = await temporaryStore(t);
  const token = 'test-operator-token-at-least-24-characters';
  const server = portfolioServer({ store, token });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/api/portfolio`;
  const auth = { Authorization: `Bearer ${token}` };
  assert.equal((await fetch(base)).status, 401);
  assert.equal((await fetch(base, { headers: { ...auth, Origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(base, { headers: auth })).status, 404);
  const uploaded = await fetch(`${base}/import?asOf=2026-09-24`, { method: 'POST', headers: { ...auth, 'Content-Type': 'text/csv' }, body: csv });
  assert.equal(uploaded.status, 201);
  assert.equal((await uploaded.json()).refreshQueued, false);
  assert.equal((await (await fetch(base, { headers: auth })).json()).summary.securityCount, 2);
  assert.equal((await fetch(`${base}/import?asOf=2026-09-24`, { method: 'POST', headers: { ...auth, 'Content-Type': 'text/csv' }, body: 'bad' })).status, 422);
  assert.equal((await fetch(`${base}/refresh`, { method: 'POST', headers: auth })).status, 503);
  assert.equal((await store.view()).summary.securityCount, 2);
});
