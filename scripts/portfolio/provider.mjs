import { decimal } from '../../src/lib/portfolio/money.ts';
import { validQuote } from '../../src/lib/portfolio/value.ts';

/** Replaceable provider boundary: fetchQuotes(symbols) -> { quotes, errors }.
 * Finnhub quote API: https://finnhub.io/docs/api/quote
 * This adapter is scoped to USD-listed stocks/ETFs; no currency conversion. */
export function finnhubProvider({ apiKey, fetchImpl = fetch, spacingMs = 1100, now = () => new Date() } = {}) {
  if (!apiKey) throw new Error('FINNHUB_API_KEY is required for market refresh');
  return {
    name: 'finnhub',
    async fetchQuotes(symbols) {
      const quotes = Object.create(null), errors = [];
      const unique = [...new Set(symbols)];
      // At most three requests in flight, spaced to stay below 60 requests/minute.
      let cursor = 0, nextStart = 0;
      async function worker() {
        while (cursor < unique.length) {
          const symbol = unique[cursor++];
          if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) { errors.push({ symbol, code: 'INVALID_SYMBOL' }); continue; }
          const start = Math.max(Date.now(), nextStart);
          nextStart = start + spacingMs;
          if (start > Date.now()) await new Promise(resolve => setTimeout(resolve, start - Date.now()));
          try {
            const url = new URL('https://finnhub.io/api/v1/quote');
            url.searchParams.set('symbol', symbol);
            const response = await fetchImpl(url, { headers: { 'X-Finnhub-Token': apiKey }, signal: AbortSignal.timeout(10_000), redirect: 'error' });
            if (!response.ok) {
              errors.push({ symbol, code: response.status === 429 ? 'RATE_LIMITED' : `HTTP_${response.status}` });
              continue;
            }
            const data = await response.json();
            if (typeof data.c !== 'number' || data.c <= 0 || typeof data.t !== 'number' || !Number.isSafeInteger(data.t) || data.t <= 0) throw new Error('Invalid quote');
            const fetchedAt = now().toISOString();
            const quote = { symbol, currency: 'USD', price: decimal(String(data.c)),
              previousClose: typeof data.pc === 'number' && data.pc > 0 ? decimal(String(data.pc)) : null,
              asOf: new Date(data.t * 1000).toISOString(), fetchedAt, provider: 'finnhub' };
            if (!validQuote(quote, symbol, Date.parse(fetchedAt))) throw new Error('Invalid quote');
            quotes[symbol] = quote;
          } catch {
            // Never persist provider bodies, URLs with credentials, or raw network errors.
            errors.push({ symbol, code: 'QUOTE_UNAVAILABLE' });
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, unique.length) }, worker));
      return { quotes, errors };
    },
  };
}
