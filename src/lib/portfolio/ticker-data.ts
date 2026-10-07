import { buildBlackLittermanRequest, validateBlackLittermanData, modelAssetClasses, type BlackLittermanView, type BlackLittermanData } from './black-litterman.ts';
import type { PortfolioData } from './display.ts';

type TickerData = { schemaVersion: number; symbol: string; currency: string; price: number; priceAsOf: string;
  priceSource: string; generatedAt: string; observations: [number, number][]; annualYieldRatio?: number | null };
const dayMs = 86_400_000;

function weeklyPrices(observations: [number, number][], now: number) {
  const prices = new Map<string, number>();
  let previous = -1;
  for (const observation of observations) {
    if (!Array.isArray(observation) || observation.length !== 2) throw new Error('Invalid ticker history.');
    const [timestamp, price] = observation;
    if (!Number.isSafeInteger(timestamp) || timestamp <= previous || timestamp * 1000 > now + 300_000 || !Number.isFinite(price) || price <= 0) throw new Error('Invalid ticker history.');
    previous = timestamp;
    const date = new Date(timestamp * 1000);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    prices.set(date.toISOString().slice(0, 10), price);
  }
  if (previous < 0 || now - previous * 1000 > 8 * dayMs) throw new Error('Ticker history is out of date.');
  return prices;
}

export function combineTickerHistory(portfolio: PortfolioData, view: BlackLittermanView, input: unknown, now = Date.now()): PortfolioData {
  const data = validateBlackLittermanData(portfolio.blackLitterman, portfolio);
  if (view.months !== 12) throw new Error('The model requires a 12-month view.');
  const ticker = view.ticker.trim().toUpperCase();
  const candidate = input as TickerData;
  if (!candidate || candidate.schemaVersion !== 1 || candidate.symbol !== ticker || candidate.currency !== 'USD' ||
    !Number.isFinite(candidate.price) || candidate.price <= 0 || !Number.isFinite(Date.parse(candidate.priceAsOf)) ||
    now - Date.parse(candidate.priceAsOf) > 8 * dayMs || Date.parse(candidate.priceAsOf) > now + 300_000 || candidate.priceSource !== 'finnhub' ||
    !Number.isFinite(Date.parse(candidate.generatedAt)) || now - Date.parse(candidate.generatedAt) > 8 * dayMs || Date.parse(candidate.generatedAt) > now + 300_000 ||
    !Array.isArray(candidate.observations) || candidate.observations.length > 1500 || !modelAssetClasses.includes(view.assetClass)) throw new Error('The ticker data is invalid or out of date.');
  if (!data.weeks || !data.weeklyReturns) throw new Error('Portfolio history needs its next scheduled refresh before outside tickers can be analyzed.');
  const prices = weeklyPrices(candidate.observations, now);
  if (candidate.observations.length === 0 || new Date(candidate.observations.at(-1)![0] * 1000).toISOString().slice(0, 10) < data.historyAsOf) throw new Error('Ticker history does not cover the portfolio history date.');
  const returns = new Map<string, number>();
  for (const [week, price] of prices) {
    const previousWeek = new Date(Date.parse(week) - 7 * dayMs).toISOString().slice(0, 10);
    const previous = prices.get(previousWeek);
    if (previous) returns.set(week, price / previous - 1);
  }
  const included = data.assets.flatMap((asset, index) => data.holdingsSymbols.includes(asset.symbol) ? [index] : []);
  const columns = data.weeks.flatMap((week, index) => returns.has(week) ? [index] : []);
  if (columns.length < 104) throw new Error(`Only ${columns.length} matching weekly returns are available for ${ticker}; at least 104 are required.`);
  if (data.weeks[columns.at(-1)!] !== data.lastWeek) throw new Error('Ticker history does not cover the latest portfolio week.');
  const weeks = columns.map(index => data.weeks![index]);
  const rows = included.map(index => columns.map(column => data.weeklyReturns![index][column]));
  rows.push(weeks.map(week => returns.get(week)!));
  const means = rows.map(row => row.reduce((total, value) => total + value, 0) / row.length);
  const annualCovariance = rows.map((row, i) => rows.map((other, j) => row.reduce((sum, value, t) => sum +
    (value - means[i]) * (other[t] - means[j]), 0) * 52 / (row.length - 1) * (i === j ? 1 : 0.90)));
  const asset = { symbol: ticker, assetClass: view.assetClass, closingPrice: candidate.price, price: candidate.price,
    priceAsOf: candidate.priceAsOf, priceSource: candidate.priceSource };
  const model: BlackLittermanData = { ...data, assets: [...included.map(index => data.assets[index]), asset], annualCovariance,
    observations: weeks.length, firstWeek: weeks[0], lastWeek: weeks.at(-1)!, weeks, weeklyReturns: rows };
  const extended = { ...portfolio, blackLitterman: model };
  validateBlackLittermanData(model, extended);
  return extended;
}

export async function fetchTickerYield(ticker: string, {
  endpoint = '', signal, fetchImpl = fetch, now = Date.now()
}: { endpoint?: string; signal?: AbortSignal; fetchImpl?: typeof fetch; now?: number } = {}) {
  if (!endpoint) throw new Error('Yield lookup is unavailable. Enter the expected annual yield.');
  const symbol = ticker.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) throw new Error('Enter a valid ticker.');
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('The ticker data service URL is invalid.');
  url.pathname = '/ticker'; url.search = new URLSearchParams({ symbol }).toString(); url.hash = '';
  const lookupSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
  const response = await fetchImpl(url, { signal: lookupSignal, credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw new Error('Yield lookup is unavailable. Enter the expected annual yield.');
  const data = await response.json();
  if (data.symbol !== symbol || data.currency !== 'USD' || data.schemaVersion !== 1 ||
    typeof data.annualYieldRatio !== 'number' || !Number.isFinite(data.annualYieldRatio) || data.annualYieldRatio < 0 || data.annualYieldRatio > 1 ||
    typeof data.yieldSource !== 'string' || !data.yieldSource.trim() || !Number.isFinite(Date.parse(data.generatedAt)) ||
    now - Date.parse(data.generatedAt) > 8 * dayMs || Date.parse(data.generatedAt) > now + 300_000) {
    throw new Error('Yield data is unavailable. Enter the expected annual yield.');
  }
  return { ratio: data.annualYieldRatio as number, source: data.yieldSource as string };
}

export async function prepareTickerAnalysis(portfolio: PortfolioData, view: BlackLittermanView, {
  endpoint = '', signal, fetchImpl = fetch, now = Date.now()
}: { endpoint?: string; signal?: AbortSignal; fetchImpl?: typeof fetch; now?: number } = {}) {
  if (view.months !== 12) throw new Error('The model requires a 12-month view.');
  const ticker = view.ticker.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker)) throw new Error('Come on..... Use the correct ticker go to gooogle.com and search it');
  if (!modelAssetClasses.includes(view.assetClass) || !Number.isFinite(view.targetPrice) || view.targetPrice <= 0 ||
    !Number.isFinite(view.months) || view.months <= 0 || !Number.isFinite(view.confidence) || view.confidence < 0 || view.confidence > 100 ||
    !Number.isFinite(view.expectedAnnualYield ?? 0) || (view.expectedAnnualYield ?? 0) < 0 || (view.expectedAnnualYield ?? 0) > 1) throw new Error('Check the target price, expected annual yield, horizon, confidence, and asset class.');
  let data = portfolio;
  let annualYield = view.expectedAnnualYield;
  const holding = portfolio.positions.find(position => position.assetType !== 'cash' && position.symbol === ticker);
  if (!holding) {
    if (!endpoint) throw new Error('The on-demand ticker data service has not been connected yet.');
    validateBlackLittermanData(portfolio.blackLitterman, portfolio);
    if (!portfolio.blackLitterman?.weeklyReturns) throw new Error('Portfolio history needs its next scheduled refresh before outside tickers can be analyzed.');
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('The ticker data service URL is invalid.');
    url.pathname = '/ticker'; url.search = new URLSearchParams({ symbol: ticker }).toString(); url.hash = '';
    const response = await fetchImpl(url, { signal, credentials: 'omit', redirect: 'error' });
    if (!response.ok) {
      if ([400, 404].includes(response.status)) throw new Error('Come on..... Use the correct ticker go to gooogle.com and search it');
      if (response.status === 429) throw new Error('The data provider is busy. Please try again shortly.');
      if (response.status === 422) throw new Error('This ticker has unsupported, missing, or stale USD price history.');
      throw new Error('Ticker data is temporarily unavailable. Please try again.');
    }
    const candidate = await response.json() as TickerData;
    if (candidate.annualYieldRatio != null && (!Number.isFinite(candidate.annualYieldRatio) ||
      candidate.annualYieldRatio < 0 || candidate.annualYieldRatio > 1)) throw new Error('Ticker yield data is invalid.');
    data = combineTickerHistory(portfolio, { ...view, ticker }, candidate, now);
    if (annualYield === undefined) annualYield = candidate.annualYieldRatio ?? undefined;
  } else if (annualYield === undefined) {
    const ratio = holding.estimatedIncomeYieldRatio;
    if (typeof ratio === 'number' && Number.isFinite(ratio) && ratio >= 0 && ratio <= 1) annualYield = ratio;
  }
  const request = buildBlackLittermanRequest(data, { ...view, ticker, expectedAnnualYield: annualYield }, now);
  return { data, request };
}
