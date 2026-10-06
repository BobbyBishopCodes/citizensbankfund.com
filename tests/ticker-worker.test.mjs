import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annualDividendYield, createHandler } from '../cloudflare/ticker-data/src/index.mjs';

const now = Date.parse('2026-10-06T05:00:00Z');
const environment = { ALLOWED_ORIGINS: 'https://citizensbankfund.com', FINNHUB_API_KEY: 'test-private-key' };
const request = (symbol = 'NU', origin = 'https://citizensbankfund.com') => new Request(`https://worker.test/ticker?symbol=${symbol}`, { headers: { Origin: origin } });
const timestamps = Array.from({ length: 110 }, (_, i) => Math.floor(now / 1000) - (109 - i) * 86400);
const chart = () => ({ chart: { result: [{ meta: { symbol: 'NU', currency: 'USD', instrumentType: 'EQUITY' }, timestamp: timestamps,
  indicators: { adjclose: [{ adjclose: timestamps.map((_, i) => 10 + i * 0.1) }] } }] } });
const quote = { c: 15, t: Math.floor(now / 1000) - 3600 };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('yield uses only the trailing year of cash distributions and preserves unavailable versus zero', () => {
  const seconds = Math.floor(now / 1000);
  const history = { timestamp: [seconds - 400 * 86400, seconds], events: { dividends: {
    old: { date: seconds - 370 * 86400, amount: 50 },
    a: { date: seconds - 300 * 86400, amount: 1 },
    b: { date: seconds - 50 * 86400, amount: 2 },
    future: { date: seconds + 86400, amount: 100 },
  } } };
  assert.equal(annualDividendYield(history, 100, now), 0.03);
  assert.equal(annualDividendYield({ timestamp: history.timestamp }, 100, now), 0);
  assert.equal(annualDividendYield({ timestamp: [seconds - 30 * 86400] }, 100, now), null);
  history.events.dividends.a.amount = -1;
  assert.equal(annualDividendYield(history, 100, now), null);
});

test('Worker includes the distribution yield and requests dividend events', async () => {
  const history = chart();
  history.chart.result[0].timestamp[0] = Math.floor(now / 1000) - 400 * 86400;
  history.chart.result[0].events = { dividends: { payment: { date: Math.floor(now / 1000) - 60 * 86400, amount: 0.45 } } };
  const handler = createHandler({ now: () => now, fetchImpl: async url => {
    if (url.includes('finnhub.io')) return json(quote);
    assert.equal(new URL(url).searchParams.get('events'), 'div');
    return json(history);
  } });
  const payload = await (await handler(request(), environment)).json();
  assert.ok(Math.abs(payload.annualYieldRatio - 0.03) < 1e-12);
  assert.match(payload.yieldSource, /trailing 12-month/);
});

test('Worker protects the key, uses fixed providers, caches successful ticker data, and applies CORS per request', async () => {
  const storage = new Map(), calls = [];
  const cache = { match: async key => storage.get(key.url)?.clone(), put: async (key, response) => storage.set(key.url, response.clone()) };
  const handler = createHandler({ now: () => now, cache, fetchImpl: async (url, options) => {
    assert.equal(options.redirect, 'manual');
    calls.push(url);
    if (url.startsWith('https://finnhub.io/')) { assert.equal(options.headers['X-Finnhub-Token'], environment.FINNHUB_API_KEY); return json(quote); }
    assert.ok(url.startsWith('https://query1.finance.yahoo.com/'));
    assert.equal(url.includes(environment.FINNHUB_API_KEY), false);
    return json(chart());
  } });
  const response = await handler(request(), environment);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://citizensbankfund.com');
  const body = await response.json();
  assert.equal(body.symbol, 'NU'); assert.equal(body.observations.length, 110);
  assert.equal(JSON.stringify(body).includes(environment.FINNHUB_API_KEY), false);
  const second = await handler(request(), environment);
  assert.equal(second.status, 200); assert.equal(calls.length, 2);
  assert.deepEqual(await second.json(), body);
  const denied = await handler(request('NU', 'https://other.test'), environment);
  assert.equal(denied.status, 403); assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(calls.length, 2);
});

test('Worker rejects malformed symbols, methods, missing configuration, and provider throttling without fetching arbitrary URLs', async () => {
  let calls = 0;
  const handler = createHandler({ now: () => now, fetchImpl: async () => { calls++; return json({}, 429); } });
  for (const symbol of ['../SECRET', 'NU&url=https://other.test', 'NU&symbol=BBW']) assert.equal((await handler(request(symbol), environment)).status, 400);
  assert.equal(calls, 0);
  assert.equal((await handler(request(), { ALLOWED_ORIGINS: environment.ALLOWED_ORIGINS })).status, 503);
  assert.equal((await handler(new Request(request(), { method: 'POST' }), environment)).status, 405);
  assert.equal((await handler(new Request(request(), { method: 'OPTIONS' }), environment)).status, 204);
  assert.equal((await handler(request(), { ...environment, PROVIDER_LIMIT: { limit: async () => ({ success: false }) } })).status, 429);
  assert.equal(calls, 0);
  assert.equal((await handler(request(), environment)).status, 429);
});

test('Worker distinguishes invalid tickers, unavailable providers, non-USD instruments, stale quotes, and malformed histories', async () => {
  for (const [quoteBody, historyBody, historyStatus, expected] of [
    [quote, {}, 404, 404], [quote, {}, 503, 502], [quote, {}, 302, 502],
    [quote, { chart: { result: [{ meta: { symbol: 'NU', currency: 'EUR', instrumentType: 'EQUITY' } }] } }, 200, 422],
    [{ ...quote, t: Math.floor(now / 1000) - 10 * 86400 }, chart(), 200, 422],
    [quote, { chart: { result: [{ ...chart().chart.result[0], timestamp: [1] }] } }, 200, 422]
  ]) {
    const handler = createHandler({ now: () => now, fetchImpl: async url => url.includes('finnhub.io') ? json(quoteBody) : json(historyBody, historyStatus) });
    assert.equal((await handler(request(), environment)).status, expected);
  }
});
