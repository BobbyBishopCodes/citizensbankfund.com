import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { cargo, manifest } from '../scripts/build-black-litterman.mjs';
import { staticPortfolio } from '../scripts/portfolio/static.mjs';
import { fetchTickerYield, prepareTickerAnalysis, combineTickerHistory } from '../src/lib/portfolio/ticker-data.ts';
import { validateBlackLittermanResult } from '../src/lib/portfolio/black-litterman.ts';

const fixture = async name => JSON.parse(await readFile(new URL(`./fixtures/black-litterman/${name}.json`, import.meta.url), 'utf8'));
const holdings = await fixture('holdings'), history = await fixture('holdings-history');
const tickerData = { NU: await fixture('nu-ticker'), BBW: await fixture('bbw-ticker') };
const now = Math.max(...Object.values(tickerData).map(data => Date.parse(data.generatedAt)));
const portfolio = await staticPortfolio(holdings, { blackLittermanHistory: history, clock: () => new Date(now).toISOString() });
const view = { ticker: 'NU', assetClass: 'equities', targetPrice: 20, months: 12, confidence: 75 };

test('yield lookup validates the ticker, source, freshness, and missing values without inventing zero', async () => {
  const payload = { ...tickerData.NU, annualYieldRatio: 0.03, yieldSource: 'Yahoo Finance trailing 12-month distributions' };
  const options = { now, endpoint: 'https://worker.test', fetchImpl: async () => new Response(JSON.stringify(payload)) };
  assert.equal((await fetchTickerYield('nu', options)).ratio, 0.03);
  payload.annualYieldRatio = 0;
  assert.equal((await fetchTickerYield('NU', options)).ratio, 0);
  for (const mutate of [value => { delete value.annualYieldRatio; }, value => { value.annualYieldRatio = null; },
    value => { value.annualYieldRatio = -1; }, value => { value.symbol = 'BBW'; },
    value => { value.generatedAt = '2020-01-01'; }, value => { value.yieldSource = ''; }]) {
    const invalid = structuredClone(payload); mutate(invalid);
    await assert.rejects(fetchTickerYield('NU', { ...options, fetchImpl: async () => new Response(JSON.stringify(invalid)) }), /unavailable/);
  }
  await assert.rejects(fetchTickerYield('NU', { now }), /unavailable/);
});

before(() => {
  for (const args of [['build', '--release', '--target', 'wasm32-unknown-unknown', '--lib'], ['build', '--release', '--bin', 'cbf-model']]) {
    const build = spawnSync(cargo, [...args, '--manifest-path', manifest, '--locked'], { encoding: 'utf8', timeout: 180_000 });
    assert.equal(build.status, 0, build.stderr);
  }
});

test('NU and BBW use on-demand data and actual Rust without changing stored holdings, prices, or NAV', async () => {
  const { instance } = await WebAssembly.instantiate(await readFile('rust/black-litterman/target/wasm32-unknown-unknown/release/cbf_black_litterman.wasm'));
  const engine = instance.exports;
  for (const ticker of ['NU', 'BBW']) {
    const prepared = await prepareTickerAnalysis(portfolio, { ...view, ticker }, { now, endpoint: 'https://worker.test', fetchImpl: async url => {
      assert.equal(new URL(url).searchParams.get('symbol'), ticker);
      return new Response(JSON.stringify(tickerData[ticker]));
    } });
    assert.deepEqual(prepared.data.positions, portfolio.positions);
    assert.equal(prepared.data.summary.marketValueCents, portfolio.summary.marketValueCents);
    assert.equal(prepared.data.blackLitterman.observations, 156);
    const bytes = new TextEncoder().encode(JSON.stringify(prepared.request));
    const pointer = engine.alloc(bytes.length);
    new Uint8Array(engine.memory.buffer, pointer, bytes.length).set(bytes);
    const output = engine.calculate(pointer, bytes.length); engine.dealloc(pointer, bytes.length);
    const resultPointer = Number(output & 0xffffffffn), length = Number(output >> 32n);
    const result = JSON.parse(new TextDecoder().decode(new Uint8Array(engine.memory.buffer, resultPointer, length)));
    engine.dealloc(resultPointer, length);
    assert.equal(result.ok, true, result.error);
    validateBlackLittermanResult(result.result, prepared.data, ticker);
    const native = spawnSync(resolve(`rust/black-litterman/target/release/cbf-model${process.platform === 'win32' ? '.exe' : ''}`), { input: JSON.stringify(prepared.request), encoding: 'utf8' });
    assert.equal(native.status, 0, native.stderr);
    const nativeResult = JSON.parse(native.stdout);
    nativeResult.result.positions.forEach((position, index) => {
      assert.equal(position.suggestedValueCents, result.result.positions[index].suggestedValueCents);
      assert.ok(Math.abs(position.suggestedWeight - result.result.positions[index].suggestedWeight) < 1e-9);
    });
    assert.equal(prepared.data.blackLitterman.assets.at(-1).price, tickerData[ticker].price);
    assert.equal(result.result.positions.reduce((sum, row) => sum + row.changeCents, 0), 0);
  }
});

test('published holdings calculate without network access or a configured Worker', async () => {
  const prepared = await prepareTickerAnalysis(portfolio, { ...view, ticker: 'MSFT', assetClass: 'bonds' }, { now, fetchImpl: () => { throw new Error('Unexpected network access'); } });
  assert.equal(prepared.data, portfolio);
  assert.equal(prepared.request.view.assetClass, 'equities');
});

test('nonannual views are rejected before requesting outside ticker data', async () => {
  for (const months of [4, 24]) {
    await assert.rejects(prepareTickerAnalysis(portfolio, { ...view, months }, {
      now, endpoint: 'https://worker.test', fetchImpl: () => { throw new Error('Unexpected network access'); },
    }), /12-month/);
  }
});

test('outside tickers fail clearly for missing service, missing published returns, insufficient overlap, and invalid data', async () => {
  await assert.rejects(prepareTickerAnalysis(portfolio, view, { now }), /has not been connected/);
  const old = structuredClone(portfolio); delete old.blackLitterman.weeks; delete old.blackLitterman.weeklyReturns;
  await assert.rejects(prepareTickerAnalysis(old, view, { now, endpoint: 'https://worker.test' }), /scheduled refresh/);
  for (const mutate of [data => { data.symbol = 'OTHER'; }, data => { data.price = 0; }, data => { data.currency = 'EUR'; },
    data => { data.observations = data.observations.slice(-150); }, data => { data.observations.reverse(); },
    data => { data.observations[0][1] = -1; }, data => { data.priceAsOf = '2020-01-01'; }]) {
    const invalid = structuredClone(tickerData.NU); mutate(invalid);
    assert.throws(() => combineTickerHistory(portfolio, view, invalid, now));
  }
  for (const status of [404, 429, 422, 502]) await assert.rejects(prepareTickerAnalysis(portfolio, view, { now, endpoint: 'https://worker.test',
    fetchImpl: async () => new Response('{}', { status }) }));
  assert.equal(portfolio.blackLitterman.assets.some(asset => asset.symbol === 'NU'), false);
});

test('aligned covariance preserves the independently computed sample formula on the common weekly window', () => {
  const combined = combineTickerHistory(portfolio, view, tickerData.NU, now).blackLitterman;
  const rows = combined.weeklyReturns;
  for (let i = 0; i < rows.length; i++) for (let j = 0; j < rows.length; j++) {
    const n = rows[i].length;
    const sum = row => row.reduce((total, value) => total + value, 0);
    const product = rows[i].reduce((total, value, t) => total + value * rows[j][t], 0);
    const expected = (product - sum(rows[i]) * sum(rows[j]) / n) / (n - 1) * 52 * (i === j ? 1 : 0.90);
    assert.ok(Math.abs(expected - combined.annualCovariance[i][j]) < 1e-10);
  }
});
