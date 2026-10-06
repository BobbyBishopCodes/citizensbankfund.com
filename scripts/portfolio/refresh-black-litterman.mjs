import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { atomicJson, parseHoldings } from './static.mjs';
import { validateBlackLittermanHistory } from '../../src/lib/portfolio/black-litterman.ts';
import { buildRust } from '../build-black-litterman.mjs';

const holdingsPath = resolve('content/portfolio/holdings.json');
const configPath = resolve('content/portfolio/black-litterman-classes.json');
const cachePath = resolve('content/portfolio/black-litterman-history.json');
const holdings = parseHoldings(await readFile(holdingsPath, 'utf8'));
const config = await readFile(configPath, 'utf8');
const configDigest = createHash('sha256').update(JSON.stringify(JSON.parse(config))).digest('hex');
const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const today = localDate.format(new Date());
let cached;
try { cached = validateBlackLittermanHistory(JSON.parse(await readFile(cachePath, 'utf8')), holdings.positions); } catch {}
if (cached?.weeklyReturns && localDate.format(new Date(cached.generatedAt)) === today && cached.configDigest === configDigest && !process.argv.includes('--force')) {
  console.log(`Black Litterman history already covers ${cached.assets.length} tickers today.`);
} else {
  buildRust(['build', '--release', '--bin', 'cbf-model']);
  const executable = resolve(`rust/black-litterman/target/release/cbf-model${process.platform === 'win32' ? '.exe' : ''}`);
  const result = spawnSync(executable, ['--refresh', holdingsPath, configPath], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 600_000 });
  if (result.error || result.status !== 0) throw new Error(result.stderr?.trim() || 'Could not refresh the Black Litterman history.');
  const history = { ...JSON.parse(result.stdout), configDigest };
  validateBlackLittermanHistory(history, holdings.positions);
  await atomicJson(cachePath, history);
  console.log(`Cached ${history.assets.length} model tickers and ${history.observations} common weekly returns through ${history.historyAsOf}.`);
}
