const SCALE = 1_000_000n;

/** Strict decimal parser: no parseFloat truncation, exponents, or locale guessing. */
export function decimal(value: string, signed = false): string {
  let text = value.trim();
  if (signed && /^\(.*\)$/.test(text)) text = '-' + text.slice(1, -1);
  text = text.replace(/^(-?)\$/, '$1');
  if (!(signed ? /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,6})?$/ : /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,6})?$/).test(text)) {
    throw new Error(`Invalid decimal: ${value}`);
  }
  return text.replaceAll(',', '');
}

function units(value: string): bigint {
  const normalized = decimal(value, true);
  const negative = normalized.startsWith('-');
  const [whole, fraction = ''] = normalized.replace(/^-/, '').split('.');
  const result = BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'));
  return negative ? -result : result;
}

function safe(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error('Money exceeds safe integer range');
  return result;
}

function rounded(value: bigint, divisor: bigint): bigint {
  const sign = value < 0n ? -1n : 1n;
  return sign * (((value * sign) + divisor / 2n) / divisor);
}

export function cents(value: string): number {
  const normalized = decimal(value, true);
  if ((normalized.split('.')[1]?.length ?? 0) > 2) throw new Error('Money total must have at most two decimal places');
  return safe(units(normalized) / 10_000n);
}

export function positionValue(quantity: string, price: string): number {
  return safe(rounded(units(quantity) * units(price), SCALE * SCALE / 100n));
}

export function sumCents(values: number[]): number {
  return safe(values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value)) throw new Error('Invalid cent amount');
    return sum + BigInt(value);
  }, 0n));
}

export function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator === null || denominator === null || denominator <= 0 ? null : numerator / denominator;
}
