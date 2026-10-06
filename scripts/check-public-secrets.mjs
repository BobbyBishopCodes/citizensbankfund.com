import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const credentialFormat = /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}|\bAKIA[A-Z0-9]{16})/;
const secretNames = ['FINNHUB_API_KEY', 'FRED_API_KEY', 'PORTFOLIO_ADMIN_TOKEN', 'RESEND_API_KEY', 'CLOUDFLARE_API_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'];

export async function checkPublicSecrets(directory, { sourceFiles, secrets = secretNames.map(name => process.env[name]).filter(Boolean) } = {}) {
  if (sourceFiles === undefined) {
    const result = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error('Cannot enumerate public source for credential checks.');
    sourceFiles = result.stdout.split('\0').filter(Boolean);
  }
  if (sourceFiles.some(file => /(?:^|[\\/])(?:\.env(?:\.(?!example$)[^\\/]+)?|\.dev\.vars(?:\.[^\\/]+)?|\.wrangler)(?:[\\/]|$)/.test(file))) throw new Error('Private credential or runtime file is Git-visible.');
  const files = new Set(sourceFiles);
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Credential checks cannot follow artifact links.');
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) files.add(child);
    }
  }
  await walk(directory);
  const needles = secrets.filter(secret => typeof secret === 'string' && secret.length >= 12)
    .flatMap(secret => [secret, encodeURIComponent(secret), Buffer.from(secret).toString('base64')]).map(value => Buffer.from(value));
  for (const file of files) {
    if (needles.some(needle => Buffer.from(file).includes(needle)) || credentialFormat.test(file)) throw new Error('Secret material detected in a public filename.');
    let content;
    try { content = await readFile(file); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (needles.some(needle => content.includes(needle)) || credentialFormat.test(content.toString('utf8'))) {
      throw new Error(`Secret material detected in public file: ${file}`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkPublicSecrets(process.argv[2] ?? '.local/pages-preview');
  console.log('Public source and artifact credential checks passed.');
}
