import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { portfolioStore } from './portfolio/store.mjs';
import { finnhubProvider } from './portfolio/provider.mjs';
import { portfolioServer } from './portfolio/server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const store = portfolioStore(resolve(process.env.PORTFOLIO_DATA_DIR ?? resolve(root, '.local/portfolio')));
const [command = 'status', ...args] = process.argv.slice(2);
const provider = () => finnhubProvider({ apiKey: process.env.FINNHUB_API_KEY });
try {
  if (command === 'import') {
    const [path, dateFlag, asOfDate] = args;
    if (!path || dateFlag !== '--as-of' || !asOfDate || args.length !== 3) throw new Error('Usage: npm run portfolio -- import "path.csv" --as-of YYYY-MM-DD');
    const csv = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path));
    const result = await store.importCsv(csv, { asOfDate, filename: path });
    if (process.env.FINNHUB_API_KEY) await store.refresh(provider());
    console.log(JSON.stringify({ duplicate: result.duplicate, ...(await store.view()) }, null, 2));
  } else if (command === 'refresh') {
    await store.refresh(provider()); console.log(JSON.stringify(await store.view(), null, 2));
  } else if (command === 'status') {
    const view = await store.view();
    if (!view) throw new Error('No portfolio imported; use the import command first');
    console.log(JSON.stringify(view, null, 2));
  } else if (command === 'serve') {
    const port = Number(process.env.PORTFOLIO_PORT ?? 8788);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORTFOLIO_PORT');
    const server = portfolioServer({ store, token: process.env.PORTFOLIO_ADMIN_TOKEN,
      provider: process.env.FINNHUB_API_KEY ? provider() : undefined,
      refreshIntervalMs: Number(process.env.PORTFOLIO_REFRESH_MS ?? 300_000) });
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`Portfolio operator API: http://127.0.0.1:${port}/api/portfolio`));
  } else throw new Error('Commands: import, status, refresh, serve');
} catch (error) { console.error(error.message); process.exitCode = 1; }
