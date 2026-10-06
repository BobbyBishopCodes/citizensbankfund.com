import type { ClusterAnalysis, PortfolioData } from '../../src/lib/portfolio/display.ts';
import type { BlackLittermanHistory } from '../../src/lib/portfolio/black-litterman.ts';
export function parseHoldings(text: string): { positions: { assetType: string; symbol: string | null }[] };
export function staticPortfolio(holdings: unknown, options?: { mode?: 'snapshot' | 'market'; clusterAnalysis?: ClusterAnalysis; blackLittermanHistory?: BlackLittermanHistory }): Promise<PortfolioData>;
