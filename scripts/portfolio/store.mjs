import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parsePortfolioCsv } from '../../src/lib/portfolio/import.ts';
import { validQuote, valuePortfolio } from '../../src/lib/portfolio/value.ts';

const isMissing = error => error.code === 'ENOENT';

export function portfolioStore(directory) {
  const statePath = join(directory, 'state.json');
  async function read() {
    let state;
    try { state = JSON.parse(await readFile(statePath, 'utf8')); }
    catch (error) { if (isMissing(error)) return null; throw error; }
    if (state.schemaVersion !== 1 || !state.import?.id || !state.snapshot || !state.quotes) throw new Error('Unsupported or corrupt portfolio state');
    return state;
  }
  async function atomicJson(path, value) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
      await rename(temporary, path);
    } finally { await unlink(temporary).catch(error => { if (!isMissing(error)) throw error; }); }
  }
  async function locked(action) {
    await mkdir(directory, { recursive: true });
    const lockPath = join(directory, 'write.lock');
    let lock;
    try { lock = await open(lockPath, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') throw new Error('Portfolio write in progress (or stale write.lock after a crash); retry once the writer exits');
      throw error;
    }
    try { await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); return await action(); }
    finally { await lock.close(); await unlink(lockPath); }
  }
  async function importCsv(csv, { asOfDate, filename = 'portfolio.csv', now = new Date().toISOString() } = {}) {
    const snapshot = parsePortfolioCsv(csv, asOfDate);
    // Check aggregate arithmetic as well as individual rows before touching saved state.
    valuePortfolio(snapshot, {}, { now });
    if (asOfDate > now.slice(0, 10)) throw new Error('Holdings date cannot be in the future');
    const sha256 = createHash('sha256').update(csv).digest('hex');
    const id = `${asOfDate}-${sha256}`;
    return locked(async () => {
      const previous = await read();
      if (previous?.import.id === id) return { duplicate: true, state: previous };
      if (previous && asOfDate < previous.snapshot.asOfDate) throw new Error('Older holdings cannot replace the active snapshot');
      const metadata = { id, sha256, filename: basename(filename.replaceAll('\\', '/')), importedAt: now };
      const state = { schemaVersion: 1, import: metadata, snapshot, quotes: {}, lastRefresh: null };
      // Archive is durable before activation. Raw CSV stays private and outside the static build.
      const archive = join(directory, 'imports');
      await mkdir(archive, { recursive: true });
      const archivePath = join(archive, `${id}.json`);
      try { await readFile(archivePath); }
      catch (error) {
        if (!isMissing(error)) throw error;
        await atomicJson(archivePath, { ...metadata, snapshot, rawCsv: csv });
      }
      // A complete new file replaces holdings, including positions removed since the last upload.
      // Clear old quotes to prevent mixing a new share count with a pre-import corporate action.
      await atomicJson(statePath, state);
      return { duplicate: false, state };
    });
  }
  let refreshing = null;
  async function refresh(provider) {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const starting = await read();
      if (!starting) throw new Error('Import a portfolio CSV before refreshing prices');
      const symbols = starting.snapshot.positions.filter(position => position.assetType !== 'cash').map(position => position.symbol);
      const result = await provider.fetchQuotes(symbols);
      return locked(async () => {
        const current = await read();
        if (current?.import.id !== starting.import.id) throw new Error('Holdings changed during refresh; retry against the new import');
        const refreshedAt = new Date().toISOString();
        const errors = [...result.errors];
        for (const symbol of symbols) {
          const quote = result.quotes[symbol];
          if (!quote) continue;
          if (!validQuote(quote, symbol, Date.parse(refreshedAt)) || Date.parse(quote.asOf) < Date.parse(current.snapshot.asOfDate)) {
            errors.push({ symbol, code: 'INVALID_OR_PRE_HOLDINGS_QUOTE' }); continue;
          }
          if (current.quotes[symbol] && Date.parse(quote.asOf) < Date.parse(current.quotes[symbol].asOf)) {
            errors.push({ symbol, code: 'OLDER_QUOTE_IGNORED' }); continue;
          }
          current.quotes[symbol] = quote;
        }
        current.lastRefresh = { attemptedAt: refreshedAt, provider: provider.name, errors };
        valuePortfolio(current.snapshot, current.quotes, { now: refreshedAt });
        await atomicJson(statePath, current);
        return current;
      });
    })();
    try { return await refreshing; } finally { refreshing = null; }
  }
  async function view(options) {
    const state = await read();
    if (!state) return null;
    return { import: state.import, lastRefresh: state.lastRefresh, ...valuePortfolio(state.snapshot, state.quotes, options) };
  }
  return { read, importCsv, refresh, view };
}
