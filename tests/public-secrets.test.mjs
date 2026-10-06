import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { checkPublicSecrets } from '../scripts/check-public-secrets.mjs';

test('public credential checks reject actual keys and encoded copies without printing their values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cbf-secret-check-'));
  const secret = ['private', 'test', 'credential', '8247'].join('-');
  try {
    for (const value of [secret, Buffer.from(secret).toString('base64')]) {
      await writeFile(join(directory, 'bundle.js'), JSON.stringify(value));
      await assert.rejects(checkPublicSecrets(directory, { sourceFiles: [], secrets: [secret] }), error => {
        assert.match(error.message, /Secret material detected/);
        assert.equal(error.message.includes(secret), false);
        assert.equal(error.message.includes(value), false);
        return true;
      });
    }
    await writeFile(join(directory, 'bundle.js'), 'https://cbf-ticker-data.example.workers.dev');
    await checkPublicSecrets(directory, { sourceFiles: [], secrets: [secret] });
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    await rm(directory, { recursive: true, force: true });
  }
});

test('public credential checks cover Git-visible source and known token formats even without runtime secrets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cbf-secret-check-'));
  try {
    const source = join(directory, 'source.ts');
    await writeFile(source, ['ghp_', 'A'.repeat(36)].join(''));
    await assert.rejects(checkPublicSecrets(directory, { sourceFiles: [source], secrets: [] }), /Secret material detected/);
    await writeFile(source, 'FINNHUB_API_KEY is supplied from the secret store');
    await checkPublicSecrets(directory, { sourceFiles: [source], secrets: [] });
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    await rm(directory, { recursive: true, force: true });
  }
});


test('public credential checks reject accidentally tracked secret files regardless of their contents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cbf-secret-check-'));
  try {
    for (const file of ['.env', '.env.production', 'cloudflare/ticker-data/.dev.vars.local', '.wrangler/config/default.toml']) {
      await assert.rejects(checkPublicSecrets(directory, { sourceFiles: [file], secrets: [] }), /Private credential or runtime file/);
    }
    await checkPublicSecrets(directory, { sourceFiles: ['.env.example'], secrets: [] });
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    await rm(directory, { recursive: true, force: true });
  }
});
