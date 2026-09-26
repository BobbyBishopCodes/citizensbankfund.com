import type { PortfolioData } from '../../src/lib/portfolio/display.ts';
export function parseHoldings(text: string): unknown;
export function staticPortfolio(holdings: unknown, options?: { mode?: 'snapshot' | 'market' }): Promise<PortfolioData>;
