import { cents, decimal, positionValue } from './money.ts';
import type { PortfolioSnapshot, Position, ImportWarning } from './types.ts';

export const MAX_CSV_BYTES = 2 * 1024 * 1024;
const REQUIRED = ['Description', 'SYMBOL/CUSIP', 'Quantity', 'Delayed Price', 'Current Value', 'Product Type', 'Amount Invested (†)', 'Estimated Annual Income'];

/** RFC 4180 records, including escaped quotes, CRLF and embedded newlines. */
export function csvRecords(input: string): string[][] {
  if (new TextEncoder().encode(input).length > MAX_CSV_BYTES) throw new Error('CSV exceeds 2 MiB limit');
  const text = input.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  const pushCell = () => { row.push(cell); cell = ''; closed = false; };
  const pushRow = () => { pushCell(); if (row.some(value => value.trim())) records.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += char;
    } else if (char === ',') pushCell();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      pushRow();
    } else if (char === '"' && cell === '' && !closed) quoted = true;
    else if (closed || char === '"') throw new Error(`Malformed CSV near character ${i + 1}`);
    else cell += char;
    if (records.length > 2000) throw new Error('CSV exceeds 2000 record limit');
  }
  if (quoted) throw new Error('CSV has an unterminated quoted field');
  if (cell || row.length || closed) pushRow();
  return records;
}

export function validDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}

export function parsePortfolioCsv(csv: string, asOfDate: string): PortfolioSnapshot {
  if (!validDate(asOfDate)) throw new Error('An explicit valid as-of date (YYYY-MM-DD) is required');
  const [rawHeader, ...records] = csvRecords(csv);
  if (!rawHeader || !records.length) throw new Error('CSV contains no positions');
  const header = rawHeader.map(value => value.trim());
  if (new Set(header).size !== header.length || header.some(value => !value)) throw new Error('Duplicate or empty CSV headers');
  const missing = REQUIRED.filter(name => !header.includes(name));
  if (missing.length) throw new Error(`Missing CSV columns: ${missing.join(', ')}`);
  const warnings: ImportWarning[] = [];
  const ids = new Set<string>();
  const positions = records.map((record, index): Position => {
    const row = index + 2;
    try {
      if (record.length !== header.length) throw new Error('Column count does not match header');
      const fields = Object.fromEntries(header.map((name, column) => [name, record[column].trim()]));
      const kind = fields['Product Type'];
      const assetType = kind === 'Stock' ? 'stock' : kind === 'Funds' ? 'fund' : kind === 'Cash & Cash Alternatives' ? 'cash' : null;
      if (!assetType) throw new Error(`Unsupported product type: ${kind}`);
      const description = fields.Description;
      if (!description) throw new Error('Description is required');
      const symbol = fields['SYMBOL/CUSIP'].toUpperCase() || null;
      if (assetType !== 'cash' && (!symbol || !/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol) || /^[A-Z0-9]{9}$/.test(symbol))) {
        throw new Error('A supported ticker is required; resolve CUSIPs before import');
      }
      const id = assetType === 'cash' ? `cash:${description.toLowerCase()}` : `security:${symbol}`;
      if (ids.has(id)) throw new Error(`Duplicate position ${id}; consolidate lots before import`);
      ids.add(id);
      const quantity = decimal(fields.Quantity);
      if (Number(quantity) <= 0) throw new Error('Quantity must be positive; short positions are not supported');
      // The supplied export marks the bank deposit's $1 price with an asterisk.
      const displayedPrice = decimal(assetType === 'cash' ? fields['Delayed Price'].replace(/\*$/, '') : fields['Delayed Price']);
      if (Number(displayedPrice) <= 0) throw new Error('Price must be positive');
      const nonnegative = (value: string) => {
        const parsed = cents(value);
        if (parsed < 0) throw new Error('Negative balances are not supported');
        return parsed;
      };
      const optionalMoney = (name: string) => !fields[name] || /^(?:N\/A|--|—)$/i.test(fields[name]) ? null : nonnegative(fields[name]);
      const optionalSigned = (name: string) => !fields[name] || /^(?:N\/A|--|—)$/i.test(fields[name]) ? null : cents(fields[name]);
      const marketValueCents = nonnegative(fields['Current Value']);
      const amountInvestedCents = optionalMoney('Amount Invested (†)');
      const estimatedAnnualIncomeCents = optionalMoney('Estimated Annual Income');
      const costBasisCents = optionalMoney('Total Cost Basis');
      const investmentGainCents = optionalSigned('Investment Gain/(Loss)');
      const warn = (code: string, message: string) => warnings.push({ row, code, message });
      const difference = marketValueCents - positionValue(quantity, displayedPrice);
      if (difference !== 0) warn('DISPLAY_PRICE_MISMATCH', `Reported value differs from quantity × displayed price by ${difference} cents; reported value retained for snapshot valuation.`);
      if (amountInvestedCents === null) warn('MISSING_INVESTED_AMOUNT', 'Investment gain cannot be calculated for this position.');
      if (estimatedAnnualIncomeCents === null) warn('MISSING_INCOME', 'Income and yield totals will be incomplete.');
      if (investmentGainCents !== null && amountInvestedCents !== null && marketValueCents - amountInvestedCents !== investmentGainCents) {
        warn('BROKER_GAIN_MISMATCH', 'Broker gain differs from reported value minus amount invested; engine uses the independent calculation.');
      }
      return {
        id, symbol, description, assetType, quantity, amountInvestedCents, costBasisCents, estimatedAnnualIncomeCents,
        source: { row, displayedPrice, marketValueCents, investmentGainCents,
          dailyValueChangeCents: optionalSigned('Daily Value Change'),
          amountInvestedPerUnit: fields['Amount Invested / Unit'] ? decimal(fields['Amount Invested / Unit']) : null,
          holdingPeriod: fields['Time Held'] ?? '', fields },
      };
    } catch (error) { throw new Error(`CSV record ${row}: ${(error as Error).message}`); }
  });
  return { schemaVersion: 1, asOfDate, currency: 'USD', positions, warnings };
}
