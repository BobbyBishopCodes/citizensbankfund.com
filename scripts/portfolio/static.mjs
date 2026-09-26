import { randomUUID, createHash } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parsePortfolioCsv, MAX_CSV_BYTES } from '../../src/lib/portfolio/import.ts';
import { valuePortfolio, validQuote } from '../../src/lib/portfolio/value.ts';

const columns = ['Description', 'SYMBOL/CUSIP', 'Quantity', 'Delayed Price', 'Current Value', 'Product Type', 'Amount Invested (†)', 'Estimated Annual Income', 'Total Cost Basis'];
const keys = ['description', 'symbol', 'assetType', 'quantity', 'referencePrice', 'referenceValueCents', 'amountInvestedCents', 'estimatedAnnualIncomeCents', 'costBasisCents'];
const types = { stock: 'Stock', fund: 'Funds', cash: 'Cash & Cash Alternatives' };
const csvRow = values => values.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',');

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) {
    throw new Error('Invalid holdings fields; regenerate with portfolio:prepare');
  }
}
function money(value, nullable = true) {
  if (value === null && nullable) return '';
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid holdings cent amount');
  // Avoid floating point conversion when reconstructing a validated CSV record.
  const amount = BigInt(value);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`;
}

/** Validate the reviewable input with the same CSV rules as local imports. */
export function snapshotFromHoldings(holdings, now = new Date().toISOString()) {
  exactKeys(holdings, ['schemaVersion', 'asOfDate', 'currency', 'positions']);
  if (holdings.schemaVersion !== 1 || holdings.currency !== 'USD' || typeof holdings.asOfDate !== 'string' ||
      !Array.isArray(holdings.positions) || !holdings.positions.length || holdings.positions.length > 1999) {
    throw new Error('Invalid holdings document');
  }
  if (!Number.isFinite(Date.parse(now)) || holdings.asOfDate > now.slice(0, 10)) throw new Error('Invalid or future holdings date');
  const rows = holdings.positions.map(position => {
    exactKeys(position, keys);
    if (typeof position.description !== 'string' || (position.symbol !== null && typeof position.symbol !== 'string') ||
        typeof position.quantity !== 'string' || typeof position.referencePrice !== 'string' || !Object.hasOwn(types, position.assetType)) {
      throw new Error('Invalid holdings position');
    }
    return csvRow([position.description, position.symbol ?? '', position.quantity, position.referencePrice,
      money(position.referenceValueCents, false), types[position.assetType], money(position.amountInvestedCents),
      money(position.estimatedAnnualIncomeCents), money(position.costBasisCents)]);
  });
  const snapshot = parsePortfolioCsv([csvRow(columns), ...rows].join('\n'), holdings.asOfDate);
  valuePortfolio(snapshot, {}, { now }); // Verify aggregate range before accepting the document.
  return snapshot;
}

/** Explicit allowlist: no account columns, filenames, machine paths, or raw CSV. */
export function prepareHoldings(csv, asOfDate, now = new Date().toISOString()) {
  const snapshot = parsePortfolioCsv(csv, asOfDate);
  const holdings = {
    schemaVersion: 1, asOfDate, currency: 'USD',
    positions: snapshot.positions.map(position => ({
      description: position.description, symbol: position.symbol, assetType: position.assetType,
      quantity: position.quantity, referencePrice: position.source.displayedPrice,
      referenceValueCents: position.source.marketValueCents, amountInvestedCents: position.amountInvestedCents,
      estimatedAnnualIncomeCents: position.estimatedAnnualIncomeCents, costBasisCents: position.costBasisCents,
    })),
  };
  snapshotFromHoldings(holdings, now);
  return { holdings, warnings: snapshot.warnings };
}

export function parseHoldings(text) {
  if (Buffer.byteLength(text, 'utf8') > MAX_CSV_BYTES) throw new Error('Holdings file exceeds 2 MiB limit');
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}

export async function atomicJson(path, value) {
  // Finish serialization before changing anything on disk.
  const text = JSON.stringify(value, null, 2) + '\n';
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(text); await file.sync(); } finally { await file.close(); }
    await rename(temporary, path);
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

/** Stateless build-time valuation. No local server, admin token or private store. */
export async function staticPortfolio(holdings, { mode = 'snapshot', provider, clock = () => new Date().toISOString() } = {}) {
  if (!['snapshot', 'market'].includes(mode)) throw new Error('Quote mode must be snapshot or market');
  const snapshot = snapshotFromHoldings(holdings, clock());
  let quotes = {};
  if (mode === 'market') {
    if (!provider) throw new Error('Market mode requires FINNHUB_API_KEY; snapshot mode needs no key');
    const symbols = snapshot.positions.filter(position => position.assetType !== 'cash').map(position => position.symbol);
    const result = await provider.fetchQuotes(symbols);
    const now = Date.parse(clock());
    const failed = symbols.filter(symbol => !result.quotes?.[symbol] ||
      !validQuote(result.quotes[symbol], symbol, now));
    if (failed.length || result.errors?.length) {
      // No raw provider error messages or credentials enter logs/artifacts.
      throw new Error(`Market export rejected: ${failed.length} securities lack valid quotes or the provider reported errors. Previous output was not replaced.`);
    }
    // A weekend import can be newer than the latest close. valuePortfolio keeps
    // the CSV value for pre-holdings quotes instead of rolling its valuation back.
    quotes = result.quotes;
  }
  const view = valuePortfolio(snapshot, quotes, { now: clock() });
  const quoteTimes = view.positions.filter(position => position.assetType !== 'cash' && position.priceStatus !== 'broker-snapshot').map(position => position.priceAsOf).sort();
  return {
    ...view,
    publication: {
      mode, holdingsDigest: createHash('sha256').update(JSON.stringify(holdings)).digest('hex'),
      oldestQuoteAt: quoteTimes[0] ?? null, newestQuoteAt: quoteTimes.at(-1) ?? null,
      staleAfterMs: 900_000,
      freshnessNote: 'Price status reflects calculatedAt. Consumers must reassess quote ages at display time; calculatedAt is not a quote timestamp.',
    },
  };
}
