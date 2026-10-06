import type { PortfolioData } from './display.ts';

export const modelAssetClasses = ['bonds', 'commodities', 'international', 'equities'] as const;
export type ModelAssetClass = typeof modelAssetClasses[number];
export const modelClassLabel = (value: ModelAssetClass) => value.charAt(0).toUpperCase() + value.slice(1);
export type BlackLittermanHistory = {
  schemaVersion: 1; holdingsSymbols: string[]; historyAsOf: string; firstWeek: string; lastWeek: string;
  observations: number; generatedAt: string; source: string; configDigest: string;
  riskFreeRate: number; marketExcessReturn: number; tau: number;
  caps: Record<ModelAssetClass | 'cash', number>;
  assets: { symbol: string; assetClass: ModelAssetClass; closingPrice: number }[];
  annualCovariance: number[][]; weeks?: string[]; weeklyReturns?: number[][];
};
export type BlackLittermanData = Omit<BlackLittermanHistory, 'assets'> & {
  portfolioAsOf: string;
  assets: (BlackLittermanHistory['assets'][number] & { price: number; priceAsOf: string; priceSource: string })[];
};
export type BlackLittermanView = { ticker: string; assetClass: ModelAssetClass; targetPrice: number; months: number; confidence: number };
export type BlackLittermanResult = {
  ticker: string; assetClass: string; currentPrice: number; navCents: number; prior: number[]; posterior: number[];
  lambda: number; annualizedTargetReturn: number; targetExcessReturn: number; omega: number | null;
  riskFreeRate: number; marketExcessReturn: number; tau: number;
  positions: { ticker: string; assetClass: string; currentWeight: number; suggestedWeight: number;
    currentValueCents: number; suggestedValueCents: number; changeCents: number }[];
  sensitivity: { confidence: number; suggestedWeight: number; posteriorExcessReturn: number }[];
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(value).toISOString().slice(0, 10) === value;
const symbolsFor = (positions: { symbol: string | null; assetType: string }[]) => positions.filter(position => position.assetType !== 'cash').map(position => position.symbol).sort();

export function validateBlackLittermanHistory(input: unknown, positions: { symbol: string | null; assetType: string }[]): BlackLittermanHistory {
  const data = input as BlackLittermanHistory;
  try {
    const n = data.assets.length;
    if (data.schemaVersion !== 1 || n < 1 || n > 200 || !date(data.historyAsOf) || !date(data.firstWeek) || !date(data.lastWeek) ||
        data.firstWeek > data.lastWeek || data.lastWeek > data.historyAsOf || !Number.isFinite(Date.parse(data.generatedAt)) ||
        new Date(data.firstWeek).getUTCDay() !== 1 || new Date(data.lastWeek).getUTCDay() !== 1 ||
        (Date.parse(data.lastWeek) - Date.parse(data.firstWeek)) / (7 * 86_400_000) + 1 < data.observations ||
        !Number.isInteger(data.observations) || data.observations < 104 || !data.source.trim() ||
        !/^[a-f0-9]{64}$/.test(data.configDigest) ||
        data.riskFreeRate !== 0.03 || data.marketExcessReturn !== 0.05 || data.tau !== 0.025 ||
        JSON.stringify(data.holdingsSymbols) !== JSON.stringify(symbolsFor(positions)) ||
        new Set(data.assets.map(asset => asset.symbol)).size !== n ||
        data.assets.some(asset => !/^[A-Z][A-Z0-9.-]{0,14}$/.test(asset.symbol) || !modelAssetClasses.includes(asset.assetClass) ||
          !finite(asset.closingPrice) || asset.closingPrice <= 0) ||
        data.holdingsSymbols.some(symbol => !data.assets.some(asset => asset.symbol === symbol)) ||
        data.caps.cash !== 0.05 || data.caps.bonds !== 0.20 || data.caps.commodities !== 0.08 ||
        data.caps.international !== 0.08 || data.caps.equities !== 0.59 ||
        !Array.isArray(data.annualCovariance) || data.annualCovariance.length !== n ||
        data.annualCovariance.some(row => !Array.isArray(row) || row.length !== n || row.some(value => !finite(value)))) throw new Error();
    if (data.weeks !== undefined || data.weeklyReturns !== undefined) {
      if (!Array.isArray(data.weeks) || data.weeks.length !== data.observations || data.weeks[0] !== data.firstWeek ||
        data.weeks.at(-1) !== data.lastWeek || data.weeks.some((week, index) => !date(week) || new Date(week).getUTCDay() !== 1 ||
          (index > 0 && week <= data.weeks![index - 1])) || !Array.isArray(data.weeklyReturns) || data.weeklyReturns.length !== n ||
        data.weeklyReturns.some(row => !Array.isArray(row) || row.length !== data.observations || row.some(value => !finite(value) || value <= -1))) throw new Error();
    }
    const lower = Array.from({ length: n }, () => Array<number>(n).fill(0));
    for (let i = 0; i < n; i++) {
      if (data.annualCovariance[i][i] <= 1e-8) throw new Error();
      for (let j = 0; j <= i; j++) {
        if (Math.abs(data.annualCovariance[i][j] - data.annualCovariance[j][i]) > 1e-10) throw new Error();
        const sum = lower[i].slice(0, j).reduce((total, value, k) => total + value * lower[j][k], 0);
        const value = data.annualCovariance[i][j] - sum;
        if (i === j && value <= 1e-12) throw new Error();
        lower[i][j] = i === j ? Math.sqrt(value) : value / lower[j][j];
      }
    }
    return data;
  } catch { throw new Error('Black Litterman history is missing, invalid, or does not match the current holdings.'); }
}

export function validateBlackLittermanData(input: unknown, portfolio: PortfolioData): BlackLittermanData {
  validateBlackLittermanHistory(input, portfolio.positions);
  const data = input as BlackLittermanData;
  if (data.portfolioAsOf !== portfolio.calculatedAt || data.assets.some(asset => !finite(asset.price) || asset.price <= 0 ||
    !Number.isFinite(Date.parse(asset.priceAsOf)) || !asset.priceSource || Date.parse(asset.priceAsOf) > Math.max(Date.now(), Date.parse(portfolio.calculatedAt)) + 300_000)) {
    throw new Error('Model pricing does not match the published portfolio.');
  }
  for (const position of portfolio.positions.filter(position => position.assetType !== 'cash')) {
    const asset = data.assets.find(asset => asset.symbol === position.symbol);
    if (!asset || asset.price !== Number(position.price) || asset.priceAsOf !== position.priceAsOf) {
      throw new Error('Model holding prices differ from the portfolio page.');
    }
  }
  return data;
}

export function buildBlackLittermanRequest(portfolio: PortfolioData, view: BlackLittermanView, now = Date.now()) {
  const data = validateBlackLittermanData(portfolio.blackLitterman, portfolio);
  const historyAge = now - Date.parse(`${data.historyAsOf}T00:00:00Z`);
  if (historyAge > 8 * 86_400_000 || data.historyAsOf > new Date(now).toISOString().slice(0, 10) ||
      Date.parse(data.generatedAt) > now + 300_000 || Date.parse(portfolio.calculatedAt) > now + 300_000) {
    throw new Error('Model history is out of date. Wait for the next portfolio refresh.');
  }
  const ticker = view.ticker.trim().toUpperCase();
  const chosen = data.assets.find(asset => asset.symbol === ticker);
  if (!chosen) throw new Error('Come on..... Use the correct ticker go to gooogle.com and search it');
  if (!finite(view.targetPrice) || view.targetPrice <= 0 || !finite(view.months) || view.months <= 0 ||
      !finite(view.confidence) || view.confidence < 0 || view.confidence > 100) throw new Error('Check the target price, horizon, and confidence.');
  const assetClass = portfolio.positions.some(position => position.assetType !== 'cash' && position.symbol === ticker) ? chosen.assetClass : view.assetClass;
  if (!modelAssetClasses.includes(assetClass)) throw new Error('Select an asset class.');
  const candidates = new Set(portfolio.positions.filter(position => position.assetType !== 'cash').map(position => position.symbol));
  candidates.add(ticker);
  const indices = data.assets.flatMap((asset, index) => candidates.has(asset.symbol) ? [index] : []);
  if (portfolio.publication.mode === 'market' && indices.some(index => now - Date.parse(data.assets[index].priceAsOf) > 8 * 86_400_000)) {
    throw new Error('One or more portfolio prices are out of date. Wait for the next portfolio refresh.');
  }
  if (now - Date.parse(chosen.priceAsOf) > 8 * 86_400_000 && !portfolio.positions.some(position => position.symbol === ticker)) {
    throw new Error('The candidate price is out of date. Wait for the next portfolio refresh.');
  }
  return {
    snapshot: { schemaVersion: 1, currency: 'USD', asOfDate: portfolio.calculatedAt.slice(0, 10),
      positions: portfolio.positions.map(position => ({ symbol: position.symbol, assetType: position.assetType,
        quantity: position.quantity, referencePrice: position.price, referenceValueCents: position.marketValueCents })) },
    model: { asOfDate: portfolio.calculatedAt.slice(0, 10), source: data.source, riskFreeRate: data.riskFreeRate,
      marketExcessReturn: data.marketExcessReturn, tau: data.tau,
      assets: indices.map(index => ({ symbol: data.assets[index].symbol, currentPrice: data.assets[index].price,
        equilibriumWeight: 0, assetClass: data.assets[index].symbol === ticker ? assetClass : data.assets[index].assetClass })),
      annualCovariance: indices.map(i => indices.map(j => data.annualCovariance[i][j])) },
    view: { ...view, ticker, assetClass },
  };
}

export function validateBlackLittermanResult(result: BlackLittermanResult, portfolio: PortfolioData, ticker: string) {
  const rows = result.positions;
  const expected = new Set([...portfolio.positions.filter(position => position.assetType !== 'cash').map(position => position.symbol), ticker, 'CASH']);
  if (result.ticker !== ticker || result.navCents !== portfolio.summary.marketValueCents || rows.length < 2 ||
      rows.length !== expected.size || rows.some(row => !expected.has(row.ticker)) ||
      !finite(result.currentPrice) || result.currentPrice <= 0 || !finite(result.lambda) || result.lambda <= 0 ||
      !finite(result.annualizedTargetReturn) || !finite(result.targetExcessReturn) ||
      result.prior.length !== rows.length - 1 || result.posterior.length !== rows.length - 1 ||
      [...result.prior, ...result.posterior].some(value => !finite(value)) ||
      new Set(rows.map(row => row.ticker)).size !== rows.length ||
      rows.some(row => !finite(row.currentWeight) || !finite(row.suggestedWeight) || row.currentWeight < 0 || row.suggestedWeight < 0 ||
        !Number.isSafeInteger(row.currentValueCents) || !Number.isSafeInteger(row.suggestedValueCents) || row.currentValueCents < 0 || row.suggestedValueCents < 0 ||
        !Number.isSafeInteger(row.changeCents) || row.changeCents !== row.suggestedValueCents - row.currentValueCents ||
        Math.abs(row.currentWeight - row.currentValueCents / result.navCents) > 1e-12) ||
      rows.reduce((sum, row) => sum + row.currentValueCents, 0) !== result.navCents ||
      rows.reduce((sum, row) => sum + row.suggestedValueCents, 0) !== result.navCents ||
      Math.abs(rows.reduce((sum, row) => sum + row.suggestedWeight, 0) - 1) > 1e-8 ||
      !rows.some(row => row.ticker === ticker) || !rows.some(row => row.ticker === 'CASH')) throw new Error('The model output did not reconcile to the portfolio.');
  for (const [assetClass, budget] of Object.entries(portfolio.blackLitterman!.caps)) {
    const weight = rows.filter(row => row.assetClass.toLowerCase() === assetClass).reduce((sum, row) => sum + row.suggestedWeight, 0);
    if (Math.abs(weight - budget) > 1e-8) throw new Error('The model output violates an allocation constraint.');
  }
  for (const position of portfolio.positions.filter(position => position.assetType !== 'cash')) {
    if (rows.find(row => row.ticker === position.symbol)?.currentValueCents !== position.marketValueCents) throw new Error('The model output uses a different holdings snapshot.');
  }
  return result;
}
