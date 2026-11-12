import { filterAndSort, type PortfolioData } from './display.ts';

const dollars = (cents: number | null) => cents === null ? '' : (cents / 100).toFixed(2);
const number = (value: number | null) => value === null ? '' : String(value);
const percentage = (ratio: number | null) => ratio === null ? '' : (ratio * 100).toFixed(6);
const cell = (value: string) => {
  // Prevent spreadsheet software from evaluating imported text as a formula.
  const safe = /^[\s\x00-\x1f]*[=+@\-]/.test(value) && !/^-?\d+(?:\.\d+)?$/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
};

export function portfolioPositionsCsv(data: PortfolioData): string {
  const headers = [
    'Ticker', 'Company / Fund', 'Asset Type', 'Shares / Units', 'Last Price (USD)',
    'Average Invested / Unit (USD)', 'Position Value (USD)', 'Amount Invested (USD)',
    'Investment Gain / Loss (USD)', 'Investment Gain / Loss (%)', 'Portfolio Weight (%)',
    'Estimated Annual Income (USD)', 'Income Yield (%)', 'Cost Basis (USD)',
    'Unrealized Gain / Loss (USD)', 'Unrealized Gain / Loss (%)',
    'Price Source', 'Price As Of', 'Value Source', 'Holdings As Of', 'Portfolio Calculated At',
    'Starting Capital (USD)', 'Gain vs Starting Capital (USD)', 'Gain vs Starting Capital (%)',
    'Portfolio Beta (3 Years)', 'Portfolio Sharpe (3 Years)',
  ];
  const rows = filterAndSort(data.positions, '', 'all', 'marketValueCents', 'desc').map(position => [
    position.symbol ?? 'Cash', position.description, position.assetType,
    position.assetType === 'cash' ? '' : position.quantity,
    position.assetType === 'cash' ? '' : number(Number(position.price)),
    position.assetType === 'cash' ? '' : number(position.averageInvestmentPerUnit),
    dollars(position.marketValueCents), dollars(position.amountInvestedCents),
    dollars(position.investmentGainCents), percentage(position.investmentGainRatio),
    percentage(position.weightRatio), dollars(position.estimatedAnnualIncomeCents),
    percentage(position.estimatedIncomeYieldRatio), dollars(position.costBasisCents),
    dollars(position.unrealizedGainCents), percentage(position.unrealizedGainRatio),
    position.priceSource, position.priceAsOf, position.valueSource,
    data.holdingsAsOfDate, data.calculatedAt, '', '', '', '', '',
  ]);
  rows.push([
    '', 'Portfolio Total', '', '', '', '', dollars(data.summary.marketValueCents),
    dollars(data.summary.amountInvestedCents), dollars(data.summary.investmentGainCents),
    percentage(data.summary.investmentGainRatio), percentage(data.summary.marketValueCents ? 1 : null),
    dollars(data.summary.estimatedAnnualIncomeCents), percentage(data.summary.estimatedIncomeYieldRatio),
    dollars(data.summary.securitiesCostBasisCents), dollars(data.summary.unrealizedGainCents),
    percentage(data.summary.unrealizedGainRatio), '', '', '', data.holdingsAsOfDate, data.calculatedAt,
    dollars(data.summary.startingCapitalCents), dollars(data.summary.gainVsStartingCapitalCents),
    percentage(data.summary.gainVsStartingCapitalRatio), number(data.risk.beta), number(data.risk.sharpe),
  ]);
  return [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
