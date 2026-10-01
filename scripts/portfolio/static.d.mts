import type { ClusterAnalysis, PortfolioData } from '../../src/lib/portfolio/display.ts';
export function parseHoldings(text: string): { positions: { assetType: string; symbol: string | null }[] };
export function staticPortfolio(holdings: unknown, options?: { mode?: 'snapshot' | 'market'; clusterAnalysis?: ClusterAnalysis }): Promise<PortfolioData>;
