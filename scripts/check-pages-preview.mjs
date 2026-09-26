import { readFile, readdir, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Check only the directory that will be uploaded, not the source checkout. */
export async function checkPagesPreview(directory) {
  const files = [];
  async function walk(relative = '') {
    for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
      const path = [relative, entry.name].filter(Boolean).join('/');
      const stat = await lstat(join(directory, path));
      if (stat.isSymbolicLink()) throw new Error(`Artifact cannot contain links: ${path}`);
      if (entry.name.startsWith('.') && path !== '.nojekyll') throw new Error(`Private artifact path: ${path}`);
      if (['node_modules', 'src', 'scripts', 'content', 'imports'].includes(entry.name)) throw new Error(`Source directory in artifact: ${path}`);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error(`Unsupported artifact entry: ${path}`);
    }
  }
  await walk();
  for (const file of files) {
    const allowed = file === 'CNAME' || file === '.nojekyll' || file === 'data/portfolio.json' ||
      /^(?:[a-z0-9-]+\/)*[a-z0-9-]+\.html$/.test(file) ||
      /^assets\/.*\.(?:js|css|woff2?|png|jpe?g|webp|svg|ico)$/.test(file) ||
      file === 'assets/icons/bootstrap-icons-LICENSE.txt';
    if (!allowed) throw new Error(`Unexpected artifact file: ${file}`);
    if (/\.(?:html|js|css|json|svg|txt)$/.test(file)) {
      const text = await readFile(join(directory, file), 'utf8');
      if (/FINNHUB_API_KEY|PORTFOLIO_ADMIN_TOKEN|RESEND_API_KEY|"rawCsv"\s*:|"fields"\s*:/.test(text)) {
        throw new Error(`Private configuration or source fields in artifact: ${file}`);
      }
    }
  }
  for (const required of ['index.html', '404.html', 'CNAME', '.nojekyll', 'data/portfolio.json', 'blog/index.html', 'fund-history/index.html', 'members/index.html', 'portfolio/index.html']) {
    if (!files.includes(required)) throw new Error(`Missing static artifact file: ${required}`);
  }
  const portfolio = JSON.parse(await readFile(join(directory, 'data/portfolio.json'), 'utf8'));
  if (portfolio.schemaVersion !== 1 || !['snapshot', 'market'].includes(portfolio.publication?.mode) ||
      !Array.isArray(portfolio.positions) || !portfolio.positions.length || !portfolio.summary ||
      !Number.isSafeInteger(portfolio.summary.marketValueCents) || !Number.isFinite(Date.parse(portfolio.calculatedAt))) {
    throw new Error('Invalid static portfolio read model');
  }
  return { files: files.length, mode: portfolio.publication.mode, securityCount: portfolio.summary.securityCount };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkPagesPreview(resolve(process.argv[2] ?? '.local/pages-preview'));
    console.log(`Validated ${result.files} static files, ${result.securityCount} securities (${result.mode}); no private source/configuration files found.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
