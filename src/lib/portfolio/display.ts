import type { valuePortfolio } from './value.ts';
import { STARTING_CAPITAL_CENTS } from './value.ts';

export type PortfolioData = ReturnType<typeof valuePortfolio> & {
  publication: { mode: 'snapshot' | 'market'; staleAfterMs: number; oldestQuoteAt: string | null; newestQuoteAt: string | null };
};
export type DisplayPosition = PortfolioData['positions'][number];
export type SortKey = 'symbol' | 'description' | 'quantity' | 'price' | 'averageInvestmentPerUnit' | 'marketValueCents' | 'amountInvestedCents' | 'costBasisCents' | 'investmentGainCents' | 'weightRatio' | 'estimatedAnnualIncomeCents' | 'estimatedIncomeYieldRatio';
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
export const money = (cents: number | null) => cents === null ? 'Unavailable' : dollars.format(cents / 100);
export const percent = (value: number | null) => value === null ? 'Unavailable' : `${(value * 100).toFixed(2)}%`;
export const signedMoney = (value: number | null) => value !== null && value > 0 ? `+${money(value)}` : money(value);
export const signedPercent = (value: number | null) => value !== null && value > 0 ? `+${percent(value)}` : percent(value);
export const quantity = (value: string) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(Number(value));
export const dateLabel = (date: string) => new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(date));
export const quoteDateLabel = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' }).format(new Date(date));

/** Validate before showing money; missing or malformed documents must not appear as zero. */
export function parsePortfolioData(input: unknown): PortfolioData {
  const data = input as PortfolioData;
  const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
  const maybeNumber = (value: unknown) => value === null || numeric(value);
  const cents = (value: unknown) => numeric(value) && Number.isSafeInteger(value);
  const maybeCents = (value: unknown) => value === null || cents(value);
  const positionAmounts = ['amountInvestedCents', 'costBasisCents', 'estimatedAnnualIncomeCents', 'investmentGainCents', 'unrealizedGainCents', 'dailyChangeCents'] as const;
  try {
    if (data.schemaVersion !== 1 || data.currency !== 'USD' || !Number.isFinite(Date.parse(data.calculatedAt)) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(data.holdingsAsOfDate) || !Number.isFinite(Date.parse(data.holdingsAsOfDate)) ||
        !['snapshot', 'market'].includes(data.publication.mode) || !numeric(data.publication.staleAfterMs) || data.publication.staleAfterMs < 0 ||
        !Array.isArray(data.positions) || !data.positions.length || !Array.isArray(data.allocations) || data.allocations.length !== 3 ||
        !cents(data.summary.marketValueCents) || !cents(data.summary.cashValueCents) || !cents(data.summary.securityCount) ||
        data.summary.startingCapitalCents !== STARTING_CAPITAL_CENTS ||
        !cents(data.summary.gainVsStartingCapitalCents) || data.summary.gainVsStartingCapitalRatio === null || !numeric(data.summary.gainVsStartingCapitalRatio) ||
        data.summary.gainVsStartingCapitalCents !== data.summary.marketValueCents - data.summary.startingCapitalCents ||
        Math.abs(data.summary.gainVsStartingCapitalRatio - data.summary.gainVsStartingCapitalCents / data.summary.startingCapitalCents) > 1e-12 ||
        !maybeCents(data.summary.investmentGainCents) || !maybeNumber(data.summary.investmentGainRatio) ||
        !maybeCents(data.summary.estimatedAnnualIncomeCents) || !maybeNumber(data.summary.estimatedIncomeYieldRatio)) throw new Error();
    for (const position of data.positions) {
      if (typeof position.id !== 'string' || typeof position.description !== 'string' ||
          (position.symbol !== null && typeof position.symbol !== 'string') || !['stock', 'fund', 'cash'].includes(position.assetType) ||
          !numeric(Number(position.quantity)) || Number(position.quantity) <= 0 || !numeric(Number(position.price)) || Number(position.price) <= 0 ||
          !cents(position.marketValueCents) || position.marketValueCents < 0 || !maybeNumber(position.weightRatio) ||
          !positionAmounts.every(key => maybeCents(position[key])) || !maybeNumber(position.averageInvestmentPerUnit) ||
          !maybeNumber(position.averageCostPerUnit) || !maybeNumber(position.investmentGainRatio) || !maybeNumber(position.estimatedIncomeYieldRatio) ||
          !Number.isFinite(Date.parse(position.priceAsOf)) || typeof position.priceSource !== 'string' ||
          !['quantity-times-quote', 'broker-reported-value'].includes(position.valueSource)) throw new Error();
    }
    if (new Set(data.positions.map(position => position.id)).size !== data.positions.length ||
        data.positions.reduce((sum, position) => sum + position.marketValueCents, 0) !== data.summary.marketValueCents ||
        data.positions.filter(position => position.assetType !== 'cash').length !== data.summary.securityCount ||
        new Set(data.allocations.map(group => group.assetType)).size !== 3 ||
        data.allocations.some(group => !['stock', 'fund', 'cash'].includes(group.assetType) || !cents(group.marketValueCents) || group.marketValueCents < 0 || !maybeNumber(group.weightRatio)) ||
        data.allocations.reduce((sum, group) => sum + group.marketValueCents, 0) !== data.summary.marketValueCents) throw new Error();
    return data;
  } catch { throw new Error('Portfolio data is unavailable or incomplete.'); }
}

export function priceState(position: DisplayPosition, now: number, staleAfterMs = 900_000) {
  if (position.assetType === 'cash') return 'Cash snapshot';
  if (position.valueSource === 'broker-reported-value') return 'CSV snapshot';
  const age = now - Date.parse(position.priceAsOf);
  return age > staleAfterMs || age < -300_000 ? 'Stale quote' : 'Market quote';
}

export function filterAndSort(positions: DisplayPosition[], query: string, type: string, key: SortKey, direction: 'asc' | 'desc') {
  const search = query.trim().toLowerCase();
  return positions.filter(position => (type === 'all' || position.assetType === type) &&
    `${position.symbol ?? 'cash'} ${position.description}`.toLowerCase().includes(search)).sort((a, b) => {
      // Keep cash separate, then keep unavailable values last in either direction.
      if ((a.assetType === 'cash') !== (b.assetType === 'cash')) return a.assetType === 'cash' ? 1 : -1;
      const av = a[key], bv = b[key];
      if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1;
      const compare = key === 'symbol' || key === 'description' ? String(av).localeCompare(String(bv)) : Number(av) - Number(bv);
      return (direction === 'asc' ? compare : -compare) || a.id.localeCompare(b.id);
    });
}
