const monthNumber = month => {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid risk month');
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
};
const monthLabel = value => `${Math.floor(value / 12)}-${String(value % 12 + 1).padStart(2, '0')}`;
const completedMonth = now => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date(now)).map(part => [part.type, part.value]));
  return Number(parts.year) * 12 + Number(parts.month) - 2;
};
const finite = value => typeof value === 'number' && Number.isFinite(value);
export const unavailablePortfolioRisk = (reason, weightsAsOf) => ({
  status: 'unavailable', reason, beta: null, sharpe: null, windowStartMonth: null,
  windowEndMonth: null, weightsAsOf, observations: 0, monthlyReturns: [],
});

/** Reviewable input: one split- and dividend-adjusted close per symbol and completed month. */
export function validateAdjustedPrices(input) {
  if (!input || input.schemaVersion !== 1 || input.priceBasis !== 'split-and-dividend-adjusted' ||
      typeof input.source !== 'string' || !input.source.trim() || !Array.isArray(input.months) ||
      (input.months.length > 0 && input.source.startsWith('Pending'))) throw new Error('Invalid adjusted-price file');
  const months = new Map();
  for (const row of input.months) {
    const month = monthNumber(row?.month);
    if (months.has(month) || typeof row.closeDate !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.closeDate) ||
        new Date(`${row.closeDate}T00:00:00Z`).toISOString().slice(0, 10) !== row.closeDate ||
        row.closeDate.slice(0, 7) !== row.month || !row.adjustedCloses || typeof row.adjustedCloses !== 'object' ||
        Array.isArray(row.adjustedCloses)) throw new Error('Duplicate or invalid adjusted-price month');
    const prices = new Map();
    for (const [symbol, price] of Object.entries(row.adjustedCloses)) {
      if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol) || typeof price !== 'string' ||
          !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(price) || !Number.isFinite(Number(price)) || Number(price) <= 0) {
        throw new Error('Invalid adjusted-price value');
      }
      prices.set(symbol, Number(price));
    }
    months.set(month, { closeDate: row.closeDate, prices });
  }
  return months;
}

/** FRED observations are daily; use the last valid observation within each calendar month. */
export function monthEndObservations(observations, kind) {
  if (!Array.isArray(observations)) throw new Error('Invalid FRED observations');
  const months = new Map();
  for (const row of observations) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row?.date) || !Number.isFinite(Date.parse(row.date)) ||
        new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10) !== row.date || typeof row.value !== 'string') {
      throw new Error('Invalid FRED observation');
    }
    if (row.value === '.') continue;
    const value = Number(row.value);
    if (!Number.isFinite(value) || (kind === 'index' ? value <= 0 : value <= -100 || value >= 100)) {
      throw new Error('Invalid FRED value');
    }
    const month = monthNumber(row.date.slice(0, 7));
    const previous = months.get(month);
    if (!previous || row.date > previous.date) months.set(month, { date: row.date, value });
  }
  return months;
}

/** All twelve returns use today's weights; no historical fund account values enter the calculation. */
export function calculatePortfolioRisk(view, adjustedPrices, benchmark, treasury, now = view.calculatedAt) {
  const weightsAsOf = view.calculatedAt;
  const prices = validateAdjustedPrices(adjustedPrices);
  const securities = view.positions.filter(position => position.assetType !== 'cash');
  if (!prices.size || !securities.length) return unavailablePortfolioRisk('missing-history', weightsAsOf);
  const lastCompleted = completedMonth(now);
  let end = null;
  for (let candidate = lastCompleted; candidate >= lastCompleted - 1; candidate--) {
    let complete = true;
    for (let month = candidate - 12; month <= candidate; month++) {
      const row = prices.get(month);
      if (!row || !benchmark.has(month) || (month < candidate && !treasury.has(month)) ||
          securities.some(position => !row.prices.has(position.symbol))) { complete = false; break; }
      if (row.closeDate !== benchmark.get(month).date) throw new Error(`Adjusted-price date does not match S&P 500 close for ${monthLabel(month)}`);
    }
    if (complete) { end = candidate; break; }
  }
  if (end === null) return unavailablePortfolioRisk('missing-history', weightsAsOf);
  const monthlyReturns = [];
  for (let month = end - 11; month <= end; month++) {
    const previous = prices.get(month - 1), current = prices.get(month);
    const portfolioReturnRatio = securities.reduce((sum, position) =>
      sum + position.weightRatio * (current.prices.get(position.symbol) / previous.prices.get(position.symbol) - 1), 0);
    const benchmarkReturnRatio = benchmark.get(month).value / benchmark.get(month - 1).value - 1;
    const annualYield = treasury.get(month - 1).value / 100;
    const riskFreeReturnRatio = Math.pow(1 + annualYield, 1 / 12) - 1;
    monthlyReturns.push({ month: monthLabel(month), portfolioReturnRatio, benchmarkReturnRatio,
      riskFreeReturnRatio, excessReturnRatio: portfolioReturnRatio - riskFreeReturnRatio });
  }
  const mean = key => monthlyReturns.reduce((sum, row) => sum + row[key], 0) / monthlyReturns.length;
  const portfolioMean = mean('portfolioReturnRatio');
  const benchmarkMean = mean('benchmarkReturnRatio');
  const excessMean = mean('excessReturnRatio');
  const benchmarkSquares = monthlyReturns.reduce((sum, row) => sum + (row.benchmarkReturnRatio - benchmarkMean) ** 2, 0);
  const excessSquares = monthlyReturns.reduce((sum, row) => sum + (row.excessReturnRatio - excessMean) ** 2, 0);
  if (benchmarkSquares < 1e-20 || excessSquares < 1e-20) return unavailablePortfolioRisk('zero-variance', weightsAsOf);
  const covariance = monthlyReturns.reduce((sum, row) =>
    sum + (row.portfolioReturnRatio - portfolioMean) * (row.benchmarkReturnRatio - benchmarkMean), 0) / 11;
  const beta = covariance / (benchmarkSquares / 11);
  const sharpe = Math.sqrt(12) * excessMean / Math.sqrt(excessSquares / 11);
  if (![beta, sharpe].every(finite)) return unavailablePortfolioRisk('invalid-result', weightsAsOf);
  return { status: end === lastCompleted ? 'available' : 'awaiting-month', reason: null, beta, sharpe,
    windowStartMonth: monthLabel(end - 11), windowEndMonth: monthLabel(end), weightsAsOf,
    observations: 12, monthlyReturns };
}
