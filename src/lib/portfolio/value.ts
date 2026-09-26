import { decimal, positionValue, ratio, sumCents } from './money.ts';
import type { PortfolioSnapshot, QuoteBook, MarketQuote } from './types.ts';

export const STARTING_CAPITAL_CENTS = 10_000_000;

export function validQuote(quote: MarketQuote, symbol: string, now: number): boolean {
  try {
    return quote.symbol === symbol && quote.currency === 'USD' && !!quote.provider &&
      Number(decimal(quote.price)) > 0 && (quote.previousClose === null || Number(decimal(quote.previousClose)) > 0) &&
      Number.isFinite(Date.parse(quote.asOf)) && Number.isFinite(Date.parse(quote.fetchedAt)) &&
      Date.parse(quote.asOf) <= now + 300_000 && Date.parse(quote.fetchedAt) <= now + 300_000 &&
      Date.parse(quote.asOf) <= Date.parse(quote.fetchedAt) + 300_000;
  } catch { return false; }
}

/** Pure, shared read model for future pages. Never mutates imported holdings. */
export function valuePortfolio(snapshot: PortfolioSnapshot, quotes: QuoteBook = {}, options: { now?: string; staleAfterMs?: number } = {}) {
  const now = Date.parse(options.now ?? new Date().toISOString());
  const staleAfterMs = options.staleAfterMs ?? 15 * 60_000;
  if (!Number.isFinite(now) || !Number.isFinite(staleAfterMs) || staleAfterMs < 0) throw new Error('Invalid valuation time settings');
  const positions = snapshot.positions.map(position => {
    const candidate = position.symbol ? quotes[position.symbol] : undefined;
    const quote = position.assetType !== 'cash' && candidate && validQuote(candidate, position.symbol!, now) &&
      Date.parse(candidate.asOf) >= Date.parse(snapshot.asOfDate) ? candidate : null;
    const marketValueCents = quote ? positionValue(position.quantity, quote.price) : position.source.marketValueCents;
    const investmentGainCents = position.amountInvestedCents === null ? null : sumCents([marketValueCents, -position.amountInvestedCents]);
    const unrealizedGainCents = position.costBasisCents === null ? null : sumCents([marketValueCents, -position.costBasisCents]);
    const previousValueCents = quote?.previousClose ? positionValue(position.quantity, quote.previousClose) : null;
    const dailyChangeCents = previousValueCents === null ? null : sumCents([marketValueCents, -previousValueCents]);
    const priceStatus = position.assetType === 'cash' ? 'cash-snapshot' : !quote ? 'broker-snapshot' : now - Date.parse(quote.asOf) > staleAfterMs ? 'stale-quote' : 'fresh-quote';
    return {
      id: position.id, symbol: position.symbol, description: position.description, assetType: position.assetType,
      quantity: position.quantity, amountInvestedCents: position.amountInvestedCents, costBasisCents: position.costBasisCents,
      averageInvestmentPerUnit: position.amountInvestedCents === null ? null : position.amountInvestedCents / 100 / Number(position.quantity),
      averageCostPerUnit: position.costBasisCents === null ? null : position.costBasisCents / 100 / Number(position.quantity),
      marketValueCents, investmentGainCents, investmentGainRatio: ratio(investmentGainCents, position.amountInvestedCents),
      unrealizedGainCents, unrealizedGainRatio: ratio(unrealizedGainCents, position.costBasisCents),
      estimatedAnnualIncomeCents: position.estimatedAnnualIncomeCents,
      estimatedIncomeYieldRatio: ratio(position.estimatedAnnualIncomeCents, marketValueCents),
      incomeAsOfDate: snapshot.asOfDate, dailyChangeCents, previousValueCents,
      dailyChangeRatio: ratio(dailyChangeCents, previousValueCents),
      price: quote?.price ?? position.source.displayedPrice,
      priceSource: quote?.provider ?? 'raymond-james-csv', priceAsOf: quote?.asOf ?? snapshot.asOfDate, priceStatus,
      // Snapshot values may not equal displayed price × quantity; this distinction is intentional.
      valueSource: quote ? 'quantity-times-quote' : 'broker-reported-value',
    };
  });
  const completeSum = (values: (number | null)[]) => values.some(value => value === null) ? null : sumCents(values as number[]);
  const marketValueCents = sumCents(positions.map(position => position.marketValueCents));
  const amountInvestedCents = completeSum(positions.map(position => position.amountInvestedCents));
  const estimatedAnnualIncomeCents = completeSum(positions.map(position => position.estimatedAnnualIncomeCents));
  const securities = positions.filter(position => position.assetType !== 'cash');
  const costBasisCents = completeSum(securities.map(position => position.costBasisCents));
  const unrealizedGainCents = completeSum(securities.map(position => position.unrealizedGainCents));
  const investmentGainCents = amountInvestedCents === null ? null : sumCents([marketValueCents, -amountInvestedCents]);
  const gainVsStartingCapitalCents = sumCents([marketValueCents, -STARTING_CAPITAL_CENTS]);
  // Day movement applies today's quantities, not actual account P&L. Do not mix trading dates or stale quotes.
  const dates = new Set(securities.map(position => position.priceAsOf.slice(0, 10)));
  const dailyComplete = securities.length > 0 && securities.every(position => position.priceStatus === 'fresh-quote' && position.dailyChangeCents !== null) && dates.size === 1;
  const dailyChangeCents = dailyComplete ? sumCents(securities.map(position => position.dailyChangeCents!)) : null;
  const previousValueCents = dailyComplete ? sumCents(securities.map(position => position.previousValueCents!)) : null;
  const countStatus = (status: string) => securities.filter(position => position.priceStatus === status).length;
  return {
    schemaVersion: 1 as const, currency: 'USD' as const, holdingsAsOfDate: snapshot.asOfDate, calculatedAt: new Date(now).toISOString(),
    positions: positions.map(position => ({ ...position, weightRatio: ratio(position.marketValueCents, marketValueCents) })),
    summary: {
      securityCount: securities.length, cashPositionCount: positions.length - securities.length,
      marketValueCents, securitiesValueCents: sumCents(securities.map(position => position.marketValueCents)),
      cashValueCents: sumCents(positions.filter(position => position.assetType === 'cash').map(position => position.marketValueCents)),
      startingCapitalCents: STARTING_CAPITAL_CENTS,
      gainVsStartingCapitalCents, gainVsStartingCapitalRatio: ratio(gainVsStartingCapitalCents, STARTING_CAPITAL_CENTS),
      amountInvestedCents, investmentGainCents, investmentGainRatio: ratio(investmentGainCents, amountInvestedCents),
      securitiesCostBasisCents: costBasisCents, unrealizedGainCents, unrealizedGainRatio: ratio(unrealizedGainCents, costBasisCents),
      estimatedAnnualIncomeCents, estimatedIncomeYieldRatio: ratio(estimatedAnnualIncomeCents, marketValueCents),
      estimatedIncomeOnInvestedRatio: ratio(estimatedAnnualIncomeCents, amountInvestedCents),
      dailyHoldingsChangeCents: dailyChangeCents, dailySecuritiesChangeRatio: ratio(dailyChangeCents, previousValueCents),
      totalReturnRatio: null, ytdReturnRatio: null, annualizedReturnRatio: null,
    },
    coverage: { freshQuotes: countStatus('fresh-quote'), staleQuotes: countStatus('stale-quote'), snapshotPrices: countStatus('broker-snapshot'),
      missingIncome: positions.filter(position => position.estimatedAnnualIncomeCents === null).length,
      missingCostBasis: securities.filter(position => position.costBasisCents === null).length },
    allocations: (['stock', 'fund', 'cash'] as const).map(assetType => {
      const value = sumCents(positions.filter(position => position.assetType === assetType).map(position => position.marketValueCents));
      return { assetType, marketValueCents: value, weightRatio: ratio(value, marketValueCents) };
    }),
    limitations: [
      'Amount Invested is broker-reported invested capital, not verified tax cost basis. Only a Total Cost Basis column supplies cost basis.',
      'Total, YTD, and annualized returns require transactions, distributions, fees, cash flows, and historical valuations.',
      'Estimated annual income is the CSV estimate, not realized income or a guaranteed return; yield uses the current valuation denominator.',
      'Quotes revalue the imported quantities only. Trades, cash movements, and corporate actions require a new holdings import.',
      'Daily holdings change assumes unchanged quantities and is not actual account daily profit or loss.',
    ],
    warnings: snapshot.warnings,
  };
}
