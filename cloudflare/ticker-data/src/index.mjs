const symbolPattern = /^[A-Z][A-Z0-9.-]{0,14}$/;

export function createHandler({ fetchImpl = fetch, now = () => Date.now(), cache = null } = {}) {
  return async function handle(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim());
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' });
    if (origin && allowed.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    } else {
      return new Response(JSON.stringify({ error: 'Origin is not allowed.' }), { status: 403, headers });
    }
    const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return respond({ error: 'Method not allowed.' }, 405);
    const url = new URL(request.url);
    const symbol = (url.searchParams.get('symbol') ?? '').trim().toUpperCase();
    if (url.pathname !== '/ticker' || [...url.searchParams.keys()].some(key => key !== 'symbol') || url.searchParams.getAll('symbol').length !== 1 || !symbolPattern.test(symbol)) {
      return respond({ error: 'Come on..... Use the correct ticker go to gooogle.com and search it' }, 400);
    }
    if (!env.FINNHUB_API_KEY) return respond({ error: 'Ticker data service is not configured.' }, 503);
    const cacheKey = new Request(`${url.origin}/ticker?symbol=${encodeURIComponent(symbol)}`);
    const storage = cache ?? globalThis.caches?.default;
    try {
      const cached = await storage?.match(cacheKey);
      if (cached) return new Response(cached.body, { headers, status: cached.status });
      if (env.PROVIDER_LIMIT && !(await env.PROVIDER_LIMIT.limit({ key: 'ticker-provider' })).success) return respond({ error: 'The data provider is busy. Please try again shortly.' }, 429);
      const [quoteResponse, historyResponse] = await Promise.all([
        fetchImpl(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}`, {
          headers: { 'X-Finnhub-Token': env.FINNHUB_API_KEY }, signal: AbortSignal.timeout(15_000), redirect: 'manual'
        }),
        fetchImpl(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3y&interval=1d&includeAdjustedClose=true`, {
          headers: { 'User-Agent': 'CBF-Ticker-Data/1.0' }, signal: AbortSignal.timeout(15_000), redirect: 'manual'
        })
      ]);
      if (quoteResponse.status === 429 || historyResponse.status === 429) return respond({ error: 'The data provider is busy. Please try again shortly.' }, 429);
      if (historyResponse.status === 404) return respond({ error: 'Come on..... Use the correct ticker go to gooogle.com and search it' }, 404);
      if (!quoteResponse.ok || !historyResponse.ok) return respond({ error: 'Ticker data is temporarily unavailable. Please try again.' }, 502);
      const quote = await quoteResponse.json();
      const body = await historyResponse.json();
      const chart = body.chart?.result?.[0];
      if (!chart || chart.meta?.symbol?.toUpperCase() !== symbol || chart.meta.currency !== 'USD' || !['EQUITY', 'ETF', 'MUTUALFUND'].includes(chart.meta.instrumentType)) {
        return respond({ error: 'This ticker must have supported USD price history.' }, 422);
      }
      const times = chart.timestamp, adjusted = chart.indicators?.adjclose?.[0]?.adjclose;
      if (!Array.isArray(times) || !Array.isArray(adjusted) || times.length !== adjusted.length || times.length < 2 || times.length > 1500) {
        return respond({ error: 'This ticker has insufficient historical data.' }, 422);
      }
      if (!(typeof quote.c === 'number' && Number.isFinite(quote.c) && quote.c > 0 && Number.isSafeInteger(quote.t) && quote.t > 0) ||
          quote.t * 1000 > now() + 300_000 || now() - quote.t * 1000 > 8 * 86_400_000) {
        return respond({ error: 'A recent price could not be obtained for this ticker.' }, 422);
      }
      const observations = times.flatMap((timestamp, index) => Number.isSafeInteger(timestamp) && timestamp > 0 && timestamp * 1000 <= now() + 300_000 &&
        typeof adjusted[index] === 'number' && Number.isFinite(adjusted[index]) && adjusted[index] > 0 ? [[timestamp, adjusted[index]]] : []);
      if (observations.length < 104 || now() - Math.max(...observations.map(([time]) => time)) * 1000 > 8 * 86_400_000) {
        return respond({ error: 'This ticker has missing or stale historical data.' }, 422);
      }
      const payload = { schemaVersion: 1, symbol, currency: 'USD', price: quote.c, priceAsOf: new Date(quote.t * 1000).toISOString(),
        priceSource: 'finnhub', generatedAt: new Date(now()).toISOString(), observations };
      if (storage) {
        const stored = new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900' } });
        const write = storage.put(cacheKey, stored).catch(() => {});
        if (ctx?.waitUntil) ctx.waitUntil(write); else await write;
      }
      return respond(payload);
    } catch {
      return respond({ error: 'Ticker data is temporarily unavailable. Please try again.' }, 502);
    }
  };
}

export default { fetch: createHandler() };
