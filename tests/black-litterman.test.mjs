import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { cargo, manifest } from '../scripts/build-black-litterman.mjs';
import { staticPortfolio } from '../scripts/portfolio/static.mjs';
import { buildBlackLittermanRequest, validateBlackLittermanHistory, validateBlackLittermanResult } from '../src/lib/portfolio/black-litterman.ts';

// codex cooked thanks GPT.6

let engine;
const executable = resolve(`rust/black-litterman/target/release/cbf-model${process.platform === 'win32' ? '.exe' : ''}`);
before(async () => {
  for (const args of [['build', '--release', '--target', 'wasm32-unknown-unknown', '--lib'], ['build', '--release', '--bin', 'cbf-model']]) {
    const result = spawnSync(cargo, [...args, '--manifest-path', manifest, '--locked'], { encoding: 'utf8', timeout: 180_000 });
    assert.equal(result.status, 0, result.stderr);
  }
  const result = await WebAssembly.instantiate(await readFile('rust/black-litterman/target/wasm32-unknown-unknown/release/cbf_black_litterman.wasm'));
  engine = result.instance.exports;
});

function wasm(request) {
  const bytes = new TextEncoder().encode(JSON.stringify(request));
  const pointer = engine.alloc(bytes.length);
  let output;
  try { new Uint8Array(engine.memory.buffer, pointer, bytes.length).set(bytes); output = engine.calculate(pointer, bytes.length); }
  finally { engine.dealloc(pointer, bytes.length); }
  const resultPointer = Number(output & 0xffffffffn), length = Number(output >> 32n);
  try { return JSON.parse(new TextDecoder().decode(new Uint8Array(engine.memory.buffer, resultPointer, length))); }
  finally { engine.dealloc(resultPointer, length); }
}

const history = JSON.parse(await readFile(new URL('./fixtures/black-litterman/history.json', import.meta.url), 'utf8'));
const holdings = JSON.parse(await readFile(new URL('./fixtures/black-litterman/holdings.json', import.meta.url), 'utf8'));
const clock = () => history.generatedAt;
const view = { ticker: 'MSFT', assetClass: 'bonds', targetPrice: 650, months: 12, confidence: 75 };

test('browser Rust and native Rust agree for current holdings and candidate inputs', async () => {
  const portfolio = await staticPortfolio(holdings, { blackLittermanHistory: history, clock });
  for (const ticker of ['MSFT', 'BINC', 'GLD', 'EWJ', 'TTMI']) {
    for (const confidence of [0, 50, 100]) {
      const request = buildBlackLittermanRequest(portfolio, { ...view, ticker, confidence }, Date.parse(clock()));
      const output = wasm(request);
      assert.equal(output.ok, true, output.error);
      const native = spawnSync(executable, { input: JSON.stringify(request), encoding: 'utf8', timeout: 30_000 });
      assert.equal(native.status, 0, native.stderr);
      const expected = JSON.parse(native.stdout);
      assert.equal(expected.ok, true, expected.error);
      assert.ok(Math.abs(output.result.lambda - expected.result.lambda) < 1e-10);
      output.result.posterior.forEach((value, index) => assert.ok(Math.abs(value - expected.result.posterior[index]) < 1e-10));
      output.result.positions.forEach((position, index) => {
        assert.ok(Math.abs(position.suggestedWeight - expected.result.positions[index].suggestedWeight) < 1e-9);
        assert.equal(position.suggestedValueCents, expected.result.positions[index].suggestedValueCents);
      });
      validateBlackLittermanResult(output.result, portfolio, ticker);
      assert.equal(output.result.positions.reduce((sum, position) => sum + position.changeCents, 0), 0);
    }
  }
});

test('posterior follows the independently evaluated single-view formula at confidence endpoints', async () => {
  const portfolio = await staticPortfolio(holdings, { blackLittermanHistory: history, clock });
  for (const confidence of [0, 20, 50, 80, 100]) {
    const request = buildBlackLittermanRequest(portfolio, { ...view, confidence }, Date.parse(clock()));
    const output = wasm(request).result;
    const covariance = request.model.annualCovariance;
    const total = request.snapshot.positions.filter(position => position.assetType !== 'cash').reduce((sum, position) => sum + position.referenceValueCents, 0);
    const weights = request.model.assets.map(asset => request.snapshot.positions.find(position => position.symbol === asset.symbol)?.referenceValueCents / total || 0);
    const sigmaW = covariance.map(row => row.reduce((sum, value, index) => sum + value * weights[index], 0));
    const lambda = 0.05 / weights.reduce((sum, value, index) => sum + value * sigmaW[index], 0);
    const prior = sigmaW.map(value => lambda * value);
    const k = request.model.assets.findIndex(asset => asset.symbol === 'MSFT');
    const q = (view.targetPrice / request.model.assets[k].currentPrice) ** (12 / view.months) - 1 - 0.03;
    prior.forEach((value, index) => {
      const posterior = value + confidence / 100 * covariance[index][k] / covariance[k][k] * (q - prior[k]);
      assert.ok(Math.abs(output.posterior[index] - posterior) < 1e-10);
    });
    assert.equal(output.omega === null, confidence === 0);
  }
});

test('optimizer satisfies cross-class KKT conditions and uses total NAV including cash', async () => {
  const portfolio = await staticPortfolio(holdings, { blackLittermanHistory: history, clock });
  for (const targetPrice of [10, 500, 10_000]) {
    const request = buildBlackLittermanRequest(portfolio, { ...view, targetPrice, confidence: 100 }, Date.parse(clock()));
    const output = wasm(request).result;
    const rows = output.positions.filter(position => position.ticker !== 'CASH');
    const gradient = request.model.annualCovariance.map((row, i) => output.posterior[i] - output.lambda * row.reduce((sum, value, j) => sum + value * rows[j].suggestedWeight, 0));
    for (const assetClass of ['Bonds', 'Commodities', 'International', 'Equities']) {
      const indices = rows.flatMap((row, i) => row.assetClass === assetClass ? [i] : []);
      const maximum = Math.max(...indices.map(index => gradient[index]));
      for (const index of indices) {
        if (rows[index].suggestedWeight > 1e-8) assert.ok(Math.abs(gradient[index] - maximum) < 1e-7);
        else assert.ok(gradient[index] <= maximum + 1e-7);
      }
    }
    assert.equal(output.navCents, portfolio.summary.marketValueCents);
    assert.equal(output.positions.find(row => row.ticker === 'CASH').currentValueCents, portfolio.summary.cashValueCents);
  }
});

test('fresh holdings and candidate quotes use the existing provider and update the prior and dollar targets', async () => {
  const now = clock();
  let requested;
  const provider = { fetchQuotes: async symbols => {
    requested = symbols;
    return { errors: [], quotes: Object.fromEntries(symbols.map(symbol => [symbol, { symbol, currency: 'USD', price: symbol === 'MSFT' ? '700' : '100', previousClose: '99', asOf: now, fetchedAt: now, provider: 'test' }])) };
  } };
  const snapshot = await staticPortfolio(holdings, { blackLittermanHistory: history, clock });
  const fresh = await staticPortfolio(holdings, { blackLittermanHistory: history, clock, mode: 'market', provider });
  assert.ok(requested.includes('TTMI'));
  assert.equal(fresh.blackLitterman.assets.find(asset => asset.symbol === 'MSFT').price, 700);
  assert.equal(fresh.blackLitterman.assets.find(asset => asset.symbol === 'TTMI').price, 100);
  const currentRequest = buildBlackLittermanRequest(snapshot, view, Date.parse(now));
  const freshRequest = buildBlackLittermanRequest(fresh, view, Date.parse(now));
  const a = wasm(currentRequest).result, b = wasm(freshRequest).result;
  assert.notEqual(a.navCents, b.navCents);
  assert.notDeepEqual(a.prior, b.prior);
  assert.notDeepEqual(a.positions.map(row => row.suggestedValueCents), b.positions.map(row => row.suggestedValueCents));
  const failed = { fetchQuotes: async () => ({ quotes: {}, errors: [] }) };
  await assert.rejects(staticPortfolio(holdings, { blackLittermanHistory: history, clock, mode: 'market', provider: failed }), /rejected/);
});

test('missing, misaligned, stale, malformed, or unsupported data is rejected without fabricated results', async () => {
  const portfolio = await staticPortfolio(holdings, { blackLittermanHistory: history, clock });
  for (const mutation of [
    value => { value.assets.pop(); },
    value => { value.assets[0].closingPrice = 0; },
    value => { value.holdingsSymbols.pop(); },
    value => { value.observations = 103; },
    value => { value.annualCovariance[0][0] = -1; },
    value => { value.annualCovariance[0][1] += 1; },
    value => { value.annualCovariance[1] = []; },
  ]) {
    const bad = structuredClone(history); mutation(bad);
    assert.throws(() => validateBlackLittermanHistory(bad, holdings.positions));
  }
  assert.throws(() => buildBlackLittermanRequest(portfolio, { ...view, ticker: 'UNKNOWN' }, Date.parse(clock())), /published universe/);
  assert.throws(() => buildBlackLittermanRequest(portfolio, view, Date.parse(clock()) + 10 * 86_400_000), /out of date/);
  assert.throws(() => buildBlackLittermanRequest(portfolio, { ...view, confidence: 101 }, Date.parse(clock())));
  const request = buildBlackLittermanRequest(portfolio, view, Date.parse(clock()));
  assert.equal(request.view.assetClass, 'equities');
  request.model.annualCovariance[0][0] = -1;
  assert.equal(wasm(request).ok, false);
});

test('allocation rounding preserves exact cents after portfolio scale changes', async () => {
  for (const multiplier of [0.37, 1, 4.25]) {
    const changed = structuredClone(holdings);
    changed.positions.forEach(position => {
      position.referenceValueCents = Math.round(position.referenceValueCents * multiplier);
      position.amountInvestedCents = position.amountInvestedCents === null ? null : Math.round(position.amountInvestedCents * multiplier);
      position.quantity = (Number(position.quantity) * multiplier).toFixed(6);
    });
    const portfolio = await staticPortfolio(changed, { blackLittermanHistory: history, clock });
    const output = wasm(buildBlackLittermanRequest(portfolio, view, Date.parse(clock())));
    assert.equal(output.ok, true, output.error);
    validateBlackLittermanResult(output.result, portfolio, view.ticker);
    assert.equal(output.result.positions.reduce((sum, row) => sum + row.changeCents, 0), 0);
  }
});

test('new holdings and position ordering do not require a Rust ticker list or a fixed portfolio budget', async () => {
  const changed = structuredClone(holdings);
  const stock = changed.positions.find(position => position.symbol === 'BMY');
  stock.symbol = 'NEW';
  stock.description = 'New holding';
  changed.positions.reverse();
  const newHistory = structuredClone(history);
  newHistory.holdingsSymbols = newHistory.holdingsSymbols.map(symbol => symbol === 'BMY' ? 'NEW' : symbol).sort();
  newHistory.assets.find(asset => asset.symbol === 'BMY').symbol = 'NEW';
  const portfolio = await staticPortfolio(changed, { blackLittermanHistory: newHistory, clock });
  const request = buildBlackLittermanRequest(portfolio, { ...view, ticker: 'NEW', assetClass: 'bonds' }, Date.parse(clock()));
  assert.equal(request.view.assetClass, 'equities');
  const output = wasm(request);
  assert.equal(output.ok, true, output.error);
  assert.ok(output.result.positions.some(position => position.ticker === 'NEW'));
  assert.ok(!output.result.positions.some(position => position.ticker === 'BMY'));
  validateBlackLittermanResult(output.result, portfolio, 'NEW');
});


test('candidate asset class follows the form selection while holdings retain their classification', async () => {
  const portfolio = await staticPortfolio(holdings, { blackLittermanHistory: history, clock });
  for (const assetClass of ['bonds', 'commodities', 'international', 'equities']) {
    const request = buildBlackLittermanRequest(portfolio, { ...view, ticker: 'TTMI', assetClass }, Date.parse(clock()));
    assert.equal(request.view.assetClass, assetClass);
    const output = wasm(request);
    assert.equal(output.ok, true, output.error);
    assert.equal(output.result.assetClass.toLowerCase(), assetClass);
    validateBlackLittermanResult(output.result, portfolio, 'TTMI');
  }
  const held = buildBlackLittermanRequest(portfolio, view, Date.parse(clock()));
  assert.equal(held.view.assetClass, 'equities');
});
