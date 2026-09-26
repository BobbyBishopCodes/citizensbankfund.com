import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareHoldings, parseHoldings, staticPortfolio, atomicJson, snapshotFromHoldings } from './portfolio/static.mjs';
import { finnhubProvider } from './portfolio/provider.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const inputPath = resolve(root, 'content/portfolio/holdings.json');
const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'prepare') {
    const [path, flag, date] = args;
    if (!path || flag !== '--as-of' || !date || args.length !== 3) throw new Error('Usage: npm run portfolio:prepare -- "path.csv" --as-of YYYY-MM-DD');
    const csv = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path));
    const { holdings, warnings } = prepareHoldings(csv, date);
    let previous;
    try { previous = parseHoldings(await readFile(inputPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous) {
      snapshotFromHoldings(previous);
      if (date < previous.asOfDate) throw new Error('Older holdings cannot replace the prepared holdings');
    }
    await atomicJson(inputPath, holdings);
    console.log(`Prepared ${holdings.positions.length} positions as of ${date} in content/portfolio/holdings.json.`);
    console.log(`Review before committing: ${warnings.length} import warnings. This file contains portfolio holdings and investment amounts.`);
    for (const warning of warnings) console.log(`Record ${warning.row}: ${warning.code}: ${warning.message}`);
  } else if (command === 'export') {
    const [mode = 'snapshot', output = '.local/pages-preview/data/portfolio.json'] = args;
    if (args.length > 2 || !['snapshot', 'market'].includes(mode)) throw new Error('Usage: npm run portfolio:export -- [snapshot|market] [output.json]');
    const outputPath = resolve(output);
    if (outputPath.toLowerCase() === inputPath.toLowerCase() || !outputPath.endsWith('.json')) throw new Error('Choose a JSON output path different from holdings.json');
    const holdings = parseHoldings(await readFile(inputPath, 'utf8'));
    const provider = mode === 'market' ? finnhubProvider({ apiKey: process.env.FINNHUB_API_KEY }) : undefined;
    const view = await staticPortfolio(holdings, { mode, provider });
    await atomicJson(outputPath, view);
    console.log(`Exported ${view.summary.securityCount} securities; mode=${mode}; snapshot=${view.coverage.snapshotPrices}, fresh=${view.coverage.freshQuotes}, stale=${view.coverage.staleQuotes}.`);
  } else throw new Error('Commands: prepare, export');
} catch (error) { console.error(error.message); process.exitCode = 1; }
