import { writeFile } from 'node:fs/promises';

const series = ['DFEDTARL', 'DFEDTARU'];
const observations = await Promise.all(series.map(async id => {
  const response = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`);
  if (!response.ok) throw new Error(`FRED ${id}: HTTP ${response.status}`);
  const lines = (await response.text()).trim().split(/\r?\n/);
  if (lines.shift() !== `observation_date,${id}`) throw new Error(`Unexpected FRED ${id} columns`);
  return new Map(lines.map(line => {
    const [date, raw] = line.split(',');
    const value = Number(raw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) throw new Error(`Invalid FRED ${id} observation`);
    return [date, value];
  }));
}));

const dates = [...observations[0].keys()].filter(date => observations[1].has(date)).sort();
const rates = dates.map(date => ({ date, lower: observations[0].get(date), upper: observations[1].get(date) }));
const changes = rates.flatMap((rate, index) => {
  if (!index || (rate.lower === rates[index - 1].lower && rate.upper === rates[index - 1].upper) || rate.date < '2022-01-01') return [];
  const lowerBps = Math.round((rate.lower - rates[index - 1].lower) * 100);
  const upperBps = Math.round((rate.upper - rates[index - 1].upper) * 100);
  if (lowerBps !== upperBps) throw new Error(`Unequal target-range changes on ${rate.date}`);
  return [{ date: rate.date, lower: rate.lower, upper: rate.upper, changeBps: upperBps }];
});
const latest = rates.at(-1);
if (!latest || latest.date < '2022-01-01' || !changes.length ||
    rates.some(rate => rate.lower > rate.upper) ||
    changes.some(rate => rate.changeBps === 0 || Math.abs(rate.changeBps) > 100)) {
  throw new Error('Fed target-range data is incomplete or inconsistent');
}
await writeFile('content/macro/fed-rates.json', JSON.stringify({
  asOf: latest.date,
  current: { lower: latest.lower, upper: latest.upper },
  changes: changes.reverse(),
}, null, 2) + '\n');
console.log(`Refreshed Fed target range through ${latest.date}; ${changes.length} changes since 2022.`);
