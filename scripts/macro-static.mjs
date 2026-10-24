import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const directory = resolve(process.argv[2] ?? '.local/pages-preview');
const holdings = JSON.parse(await readFile('content/portfolio/holdings.json', 'utf8'));
const snapshot = JSON.parse(await readFile('content/macro/snapshot.json', 'utf8'));
const symbols = holdings.positions.filter(position => position.symbol).map(position => position.symbol);
const listed = snapshot.positions.map(position => position.ticker);

if (snapshot.holdingsAsOf !== holdings.asOfDate ||
    symbols.length !== listed.length || symbols.some((symbol, index) => symbol !== listed[index])) {
  throw new Error('Macro responses do not match the prepared holdings. Refresh the IRF snapshot before publishing.');
}
if (!/^\d{4}-\d{2}$/.test(snapshot.targetMonth) ||
    !/^\d{4}-\d{2}$/.test(snapshot.modelCutoff) ||
    snapshot.forecastStatus !== 'current' ||
    !/^\d{4}-\d{2}$/.test(snapshot.forecastCutoff) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.forecastRefreshedOn) ||
    !Number.isFinite(snapshot.forecast?.cpi) || !Number.isFinite(snapshot.forecast?.ppi)) {
  throw new Error('Macro forecast or model dates are invalid.');
}
const targetDate = new Date(`${snapshot.forecastCutoff}-01T00:00:00Z`);
targetDate.setUTCMonth(targetDate.getUTCMonth() + 1);
if (targetDate.toISOString().slice(0, 7) !== snapshot.targetMonth) {
  throw new Error('Macro forecast month does not follow its data cutoff.');
}
for (const [range, point] of [[snapshot.forecast.cpiRange80, snapshot.forecast.cpi],
                              [snapshot.forecast.ppiRange80, snapshot.forecast.ppi]]) {
  if (!Array.isArray(range) || range.length !== 2 ||
      range.some(value => !Number.isFinite(value)) || range[0] > point || point > range[1]) {
    throw new Error('Macro forecast range is invalid.');
  }
}
for (const position of snapshot.positions) {
  if (!['modeled', 'exploratory'].includes(position.status)) continue;
  if (position.status === 'exploratory' &&
      (!Number.isInteger(position.historyMonths) || position.historyMonths < 24 || position.historyMonths >= 60)) {
    throw new Error(`Invalid exploratory history for ${position.ticker}.`);
  }
  for (const response of [position.cpi, position.ppi]) {
    if (!response || ['estimate', 'lower', 'upper'].some(key =>
      !Array.isArray(response[key]) || response[key].length !== 13 ||
      response[key].some(value => !Number.isFinite(value)))) {
      throw new Error(`Invalid IRF response for ${position.ticker}.`);
    }
  }
}

await mkdir(join(directory, 'data'), { recursive: true });
await writeFile(join(directory, 'data/macro.json'), JSON.stringify(snapshot) + '\n');
console.log(`Exported macro snapshot for ${symbols.length} holdings as of ${holdings.asOfDate}.`);
