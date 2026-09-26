/** All money totals are integer USD cents; quantities/prices are decimal strings.
 * Ratios are fractions (0.025 = 2.5%). null means unavailable, never zero. */
export interface Position {
  id: string;
  symbol: string | null;
  description: string;
  assetType: 'stock' | 'fund' | 'cash';
  quantity: string;
  amountInvestedCents: number | null;
  costBasisCents: number | null;
  estimatedAnnualIncomeCents: number | null;
  source: {
    row: number;
    displayedPrice: string;
    marketValueCents: number;
    investmentGainCents: number | null;
    dailyValueChangeCents: number | null;
    amountInvestedPerUnit: string | null;
    holdingPeriod: string;
    fields: Record<string, string>;
  };
}

export interface ImportWarning { row: number; code: string; message: string }
export interface PortfolioSnapshot {
  schemaVersion: 1;
  asOfDate: string;
  currency: 'USD';
  positions: Position[];
  warnings: ImportWarning[];
}

export interface MarketQuote {
  symbol: string;
  currency: 'USD';
  price: string;
  previousClose: string | null;
  asOf: string;
  fetchedAt: string;
  provider: string;
}
export type QuoteBook = Record<string, MarketQuote>;
