import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareHoldings, parseHoldings, staticPortfolio, atomicJson, snapshotFromHoldings } from './portfolio/static.mjs';
import { finnhubProvider } from './portfolio/provider.mjs';
import { monthEndObservations } from './portfolio/risk.mjs';
import { clusterSymbols, portfolioClusterAnalysis } from './portfolio/cluster.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const inputPath = resolve(root, 'content/portfolio/holdings.json');
const riskInputPath = resolve(root, 'content/portfolio/risk-history.json');
const clusterInputPath = resolve(root, 'content/portfolio/cluster-analysis.json');
const modelInputPath = resolve(root, 'content/portfolio/black-litterman-history.json');
const modelConfigPath = resolve(root, 'content/portfolio/black-litterman-candidates.json');
const pcaFigurePath = resolve(root, 'public/assets/portfolio/pca-clusters.svg');
async function verifyPcaFigure(source) {
  const digest = createHash('sha256').update(source).digest('hex');
  const normalizedDigest = createHash('sha256').update(source.toString('utf8').replace(/\r\n/g, '\n')).digest('hex');
  let svg;
  try { svg = await readFile(pcaFigurePath, 'utf8'); }
  catch { throw new Error(`Missing PCA figure: ${pcaFigurePath}`); }
  if (!svg.includes(`<!-- portfolio-analysis-sha256:${digest} -->`) && !svg.includes(`<!-- portfolio-analysis-sha256:${normalizedDigest} -->`)) throw new Error(`PCA figure does not match current analysis: ${pcaFigurePath}`);
}
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
    if (clusterSymbols(holdings.positions).length >= 3) {
      const refresh = spawnSync(process.env.PYTHON || 'python', ['scripts/portfolio/fetch-cluster-analysis.py'], { cwd: root, stdio: 'inherit' });
      if (refresh.error || refresh.status !== 0) throw new Error('Holdings were saved, but cluster analysis did not refresh. Install scripts/portfolio/requirements.txt and retry the Python refresh before publishing.');
      const render = spawnSync(process.env.PYTHON || 'python', ['scripts/portfolio/render-cluster-charts.py'], { cwd: root, stdio: 'inherit' });
      if (render.error || render.status !== 0) throw new Error('Holdings were saved, but the PCA figure did not render. Install scripts/portfolio/requirements.txt and retry before publishing.');
      const source = await readFile(clusterInputPath);
      const cache = JSON.parse(source);
      if (!portfolioClusterAnalysis(cache, holdings.positions)) throw new Error('Holdings were saved, but cluster analysis does not match them. Do not publish until the refresh succeeds.');
      await verifyPcaFigure(source);
    } else console.log('Cluster analysis needs at least three securities; charts will be unavailable.');
    const modelRefresh = spawnSync(process.execPath, ['scripts/portfolio/refresh-black-litterman.mjs'], { cwd: root, stdio: 'inherit' });
    if (modelRefresh.error || modelRefresh.status !== 0) throw new Error('Holdings were saved, but Black Litterman history did not refresh. Resolve missing ticker history or classification before publishing.');
  } else if (command === 'check-cluster') {
    const holdings = parseHoldings(await readFile(inputPath, 'utf8'));
    snapshotFromHoldings(holdings);
    if (clusterSymbols(holdings.positions).length < 3) {
      console.log('Cluster analysis needs at least three securities; no charts to verify.');
    } else {
      let cache, source;
      try { source = await readFile(clusterInputPath); cache = JSON.parse(source); }
      catch { throw new Error('Cluster analysis cache is missing or invalid for current holdings.'); }
      if (!portfolioClusterAnalysis(cache, holdings.positions)) throw new Error('Cluster analysis cache does not match current holdings.');
      await verifyPcaFigure(source);
      console.log(`Verified cluster analysis for ${cache.symbols.length} current securities.`);
    }
  } else if (command === 'export') {
    const [mode = 'snapshot', output = '.local/pages-preview/data/portfolio.json'] = args;
    if (args.length > 2 || !['snapshot', 'market'].includes(mode)) throw new Error('Usage: npm run portfolio:export -- [snapshot|market] [output.json]');
    const outputPath = resolve(output);
    if (outputPath.toLowerCase() === inputPath.toLowerCase() || !outputPath.endsWith('.json')) throw new Error('Choose a JSON output path different from holdings.json');
    const holdings = parseHoldings(await readFile(inputPath, 'utf8'));
    const provider = mode === 'market' ? finnhubProvider({ apiKey: process.env.FINNHUB_API_KEY }) : undefined;
    let riskPrices, benchmark, treasury;
    try {
      riskPrices = JSON.parse(await readFile(riskInputPath, 'utf8'));
      benchmark = monthEndObservations(riskPrices.benchmark, 'index');
      treasury = monthEndObservations(riskPrices.treasury, 'yield');
    } catch {
      console.warn('Risk history cache is missing or invalid; Beta and Sharpe will be unavailable.');
    }
    let clusterAnalysis;
    if (clusterSymbols(holdings.positions).length >= 3) {
      let source;
      try { source = await readFile(clusterInputPath); clusterAnalysis = JSON.parse(source); }
      catch { throw new Error('Cluster analysis cache is missing or invalid for current holdings. Refresh it before exporting.'); }
      if (!portfolioClusterAnalysis(clusterAnalysis, holdings.positions)) throw new Error('Cluster analysis cache does not match current holdings. Refresh it before exporting.');
      await verifyPcaFigure(source);
    }
    let blackLittermanHistory;
    try {
      blackLittermanHistory = JSON.parse(await readFile(modelInputPath, 'utf8'));
      const config = JSON.parse(await readFile(modelConfigPath, 'utf8'));
      const digest = createHash('sha256').update(JSON.stringify(config)).digest('hex');
      if (blackLittermanHistory.configDigest !== digest) throw new Error();
    } catch { throw new Error('Black Litterman history is missing or does not match its candidate configuration. Run npm run model:refresh.'); }
    const view = await staticPortfolio(holdings, { mode, provider, riskPrices, benchmark, treasury, clusterAnalysis, blackLittermanHistory });
    await atomicJson(outputPath, view);
    console.log(`Exported ${view.summary.securityCount} securities; mode=${mode}; snapshot=${view.coverage.snapshotPrices}, fresh=${view.coverage.freshQuotes}, stale=${view.coverage.staleQuotes}; risk=${view.risk.status}.`);
  } else throw new Error('Commands: prepare, check-cluster, export');
} catch (error) { console.error(error.message); process.exitCode = 1; }
