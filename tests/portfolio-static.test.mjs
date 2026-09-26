import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { prepareHoldings, snapshotFromHoldings, staticPortfolio, atomicJson, parseHoldings } from '../scripts/portfolio/static.mjs';
import { checkPagesPreview } from '../scripts/check-pages-preview.mjs';

const csv = 'Description,SYMBOL/CUSIP,Quantity,Delayed Price,Current Value,Product Type,Amount Invested (†),Estimated Annual Income,Private Account\n"Example, Company",ABC,2,60.92,121.83,Stock,100.00,4.00,PRIVATE-ACCOUNT-123\nCash,,1000,1.00*,1000.00,Cash & Cash Alternatives,1000.00,1.00,PRIVATE-ACCOUNT-123\n';
const time = '2026-09-25T15:00:00.000Z';
const options = { clock: () => time };
const holdings = () => prepareHoldings(csv, '2026-09-24', time).holdings;
const quote = (changes = {}) => ({ symbol: 'ABC', currency: 'USD', price: '70', previousClose: '60', asOf: '2026-09-25T14:59:00Z', fetchedAt: time, provider: 'test', ...changes });
const provider = (quotes, errors = []) => ({ fetchQuotes: async () => ({ quotes, errors }) });

test('prepared holdings are portable, contain only allowed fields and preserve exact totals', async () => {
  const source = holdings();
  assert.ok(!JSON.stringify(source).includes('PRIVATE-ACCOUNT'));
  assert.ok(!JSON.stringify(source).includes('fields'));
  const view = await staticPortfolio(source, options);
  assert.equal(view.summary.marketValueCents, 112183);
  assert.equal(view.summary.amountInvestedCents, 110000);
  assert.equal(view.summary.investmentGainCents, 2183);
  assert.equal(view.summary.estimatedAnnualIncomeCents, 500);
  assert.equal(view.summary.ytdReturnRatio, null);
  assert.equal(view.coverage.snapshotPrices, 1);
  assert.equal(view.publication.oldestQuoteAt, null);
  assert.match(view.publication.holdingsDigest, /^[a-f0-9]{64}$/);
  assert.ok(!('import' in view));
  assert.equal(snapshotFromHoldings(source, time).warnings[0].code, 'DISPLAY_PRICE_MISMATCH');
});

test('normalized holdings validation rejects duplicate symbols, unknown fields and unsafe dates/amounts', () => {
  const mutations = [
    value => { value.positions.push(value.positions[0]); },
    value => { value.rawCsv = csv; },
    value => { value.positions[0].account = 'private'; },
    value => { value.positions[0].referenceValueCents = 1.1; },
    value => { value.positions[0].amountInvestedCents = Number.MAX_SAFE_INTEGER + 1; },
    value => { value.positions[0].quantity = '-1'; },
    value => { value.positions[0].symbol = null; },
    value => { value.currency = 'EUR'; },
    value => { value.asOfDate = '2027-01-01'; },
  ];
  for (const mutate of mutations) {
    const value = holdings(); mutate(value);
    assert.throws(() => snapshotFromHoldings(value, time));
  }
  assert.throws(() => parseHoldings('x'.repeat(2 * 1024 * 1024 + 1)), /limit/);
});

test('snapshot mode makes no provider requests; market mode requires an explicit provider', async () => {
  let calls = 0;
  await staticPortfolio(holdings(), { ...options, provider: { fetchQuotes() { calls++; throw new Error('Should not fetch'); } } });
  assert.equal(calls, 0);
  await assert.rejects(staticPortfolio(holdings(), { ...options, mode: 'market' }), /requires/);
  await assert.rejects(staticPortfolio(holdings(), { ...options, mode: 'unknown' }), /mode/);
});

test('market export recomputes prices and retains quote dates even when the market is closed', async () => {
  const fresh = await staticPortfolio(holdings(), { ...options, mode: 'market', provider: provider({ ABC: quote() }) });
  assert.equal(fresh.summary.marketValueCents, 114000);
  assert.equal(fresh.summary.investmentGainCents, 4000);
  assert.equal(fresh.publication.mode, 'market');
  assert.equal(fresh.publication.oldestQuoteAt, '2026-09-25T14:59:00Z');
  assert.equal(fresh.coverage.freshQuotes, 1);
  const stale = await staticPortfolio(holdings(), { ...options, mode: 'market', provider: provider({ ABC: quote({ asOf: '2026-09-24T20:00:00Z' }) }) });
  assert.equal(stale.coverage.staleQuotes, 1);
  assert.equal(stale.positions[0].priceAsOf, '2026-09-24T20:00:00Z');
});

test('market failures reject the whole candidate and leave a previous export intact', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'cbf-static-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'portfolio.json');
  await atomicJson(output, await staticPortfolio(holdings(), options));
  const before = await readFile(output, 'utf8');
  for (const result of [provider({}), provider({ ABC: quote({ price: '0' }) }), provider({ ABC: quote({ asOf: 'invalid' }) }), provider({ ABC: quote() }, [{ code: 'HTTP_429' }])]) {
    await assert.rejects(async () => {
      const view = await staticPortfolio(holdings(), { ...options, mode: 'market', provider: result });
      await atomicJson(output, view);
    }, /rejected/);
    assert.equal(await readFile(output, 'utf8'), before);
  }
});

test('weekend holdings retain CSV values until quotes catch up to the holdings date', async () => {
  const latest = holdings();
  latest.asOfDate = '2026-09-26';
  const weekend = await staticPortfolio(latest, {
    mode: 'market', clock: () => '2026-09-26T19:00:00Z',
    provider: provider({ ABC: quote({ price: '999', asOf: '2026-09-25T20:00:00Z', fetchedAt: '2026-09-26T19:00:00Z' }) }),
  });
  assert.equal(weekend.summary.marketValueCents, 112183);
  assert.equal(weekend.coverage.snapshotPrices, 1);
  assert.equal(weekend.publication.oldestQuoteAt, null);
  assert.equal(weekend.positions.find(position => position.symbol === 'ABC').priceStatus, 'broker-snapshot');
  const monday = await staticPortfolio(latest, {
    mode: 'market', clock: () => '2026-09-28T15:00:00Z',
    provider: provider({ ABC: quote({ asOf: '2026-09-28T14:59:00Z', fetchedAt: '2026-09-28T15:00:00Z' }) }),
  });
  assert.equal(monday.summary.marketValueCents, 114000);
  assert.equal(monday.coverage.freshQuotes, 1);
  assert.equal(monday.coverage.snapshotPrices, 0);
});

test('artifact checker accepts static output and rejects source archives and hidden secrets', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'cbf-artifact-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const file of ['index.html', '404.html', 'CNAME', '.nojekyll', 'blog/index.html', 'fund-history/index.html', 'members/index.html', 'portfolio/index.html']) {
    const parts = file.split('/'); parts.pop();
    await mkdir(join(directory, ...parts), { recursive: true });
    await writeFile(join(directory, file), 'static');
  }
  await atomicJson(join(directory, 'data/portfolio.json'), await staticPortfolio(holdings(), options));
  assert.equal((await checkPagesPreview(directory)).securityCount, 1);
  await writeFile(join(directory, '.env'), 'SENTINEL');
  await assert.rejects(checkPagesPreview(directory), /Private artifact path/);
  await rm(join(directory, '.env'));
  await writeFile(join(directory, 'raw.csv'), csv);
  await assert.rejects(checkPagesPreview(directory), /Unexpected artifact file/);
  await rm(join(directory, 'raw.csv'));
  await writeFile(join(directory, 'index.html'), 'FINNHUB_API_KEY=sentinel');
  await assert.rejects(checkPagesPreview(directory), /Private configuration/);
});

test('validation workflow is manual-only, read-only, and cannot deploy', async () => {
  const text = await readFile(new URL('../.github/workflows/validate-pages.yml', import.meta.url), 'utf8');
  const document = parseDocument(text);
  assert.deepEqual(document.errors, []);
  const workflow = document.toJS();
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(workflow.jobs), ['validate']);
  assert.equal(workflow.on.workflow_dispatch.inputs.quote_mode.default, 'snapshot');
  assert.equal(workflow.jobs.validate.steps.filter(step => step.env?.FINNHUB_API_KEY).length, 1);
  const upload = workflow.jobs.validate.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(upload.with.path, '.local/pages-preview/');
  assert.equal(upload.with['retention-days'], 7);
  assert.ok(workflow.jobs.validate.steps.every(step => !/deploy-pages|configure-pages/.test(step.uses ?? '')));
});
