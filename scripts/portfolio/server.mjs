import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { MAX_CSV_BYTES } from '../../src/lib/portfolio/import.ts';

/** Local operator API. Deploy behind real authentication before remote use. */
export function portfolioServer({ store, token, provider, refreshIntervalMs = 300_000 }) {
  if (!token || token.length < 24) throw new Error('PORTFOLIO_ADMIN_TOKEN must contain at least 24 characters');
  if (!Number.isFinite(refreshIntervalMs) || refreshIntervalMs < 60_000) throw new Error('Refresh interval must be at least 60 seconds');
  const expected = Buffer.from(`Bearer ${token}`);
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, value) => { response.writeHead(status); response.end(JSON.stringify(value)); };
    // Reject browser cross-origin requests and unexpected hosts, including DNS rebinding.
    if (request.headers.origin || !/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(request.headers.host ?? '')) {
      return send(403, { error: 'Local operator access only' });
    }
    const received = Buffer.from(request.headers.authorization ?? '');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return send(401, { error: 'Unauthorized' });
    const url = new URL(request.url, 'http://localhost');
    try {
      if (request.method === 'GET' && url.pathname === '/api/portfolio') {
        const view = await store.view();
        return send(view ? 200 : 404, view ?? { error: 'No portfolio imported' });
      }
      if (request.method === 'POST' && url.pathname === '/api/portfolio/import') {
        if (!/^text\/csv(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) return send(415, { error: 'Send a UTF-8 text/csv body' });
        if (Number(request.headers['content-length']) > MAX_CSV_BYTES) return send(413, { error: 'CSV exceeds 2 MiB limit' });
        const chunks = []; let bytes = 0;
        for await (const chunk of request) {
          bytes += chunk.length;
          if (bytes > MAX_CSV_BYTES) { send(413, { error: 'CSV exceeds 2 MiB limit' }); return; }
          chunks.push(chunk);
        }
        const csv = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
        const result = await store.importCsv(csv, { asOfDate: url.searchParams.get('asOf'), filename: request.headers['x-filename'] ?? 'upload.csv' });
        // Holdings activation succeeds independently of a provider outage.
        if (provider) void store.refresh(provider).catch(() => {});
        return send(result.duplicate ? 200 : 201, { importId: result.state.import.id, duplicate: result.duplicate, warnings: result.state.snapshot.warnings, refreshQueued: !!provider });
      }
      if (request.method === 'POST' && url.pathname === '/api/portfolio/refresh') {
        if (!provider) return send(503, { error: 'Configure FINNHUB_API_KEY to refresh market prices' });
        await store.refresh(provider);
        return send(200, await store.view());
      }
      return send(404, { error: 'Unknown portfolio endpoint' });
    } catch (error) {
      // Validation messages contain source fields and are only returned to the authenticated operator.
      if (/write in progress|changed during refresh/.test(error.message)) return send(409, { error: error.message });
      if (/CSV|date|Quantity|Price|position|holdings|Holdings|Older|encoded data|safe integer|Invalid valuation/.test(error.message)) return send(422, { error: error.message });
      return send(500, { error: 'Portfolio operation failed; active data was preserved' });
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  let timer;
  if (provider) {
    const tick = () => { void store.refresh(provider).catch(() => {}); };
    server.once('listening', () => { tick(); timer = setInterval(tick, refreshIntervalMs); timer.unref(); });
    server.once('close', () => clearInterval(timer));
  }
  return server;
}
