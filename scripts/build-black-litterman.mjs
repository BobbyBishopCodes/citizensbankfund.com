import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

export const cargo = existsSync(join(homedir(), '.cargo/bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo'))
  ? join(homedir(), '.cargo/bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo') : 'cargo';
export const manifest = resolve('rust/black-litterman/Cargo.toml');
export function buildRust(args) {
  const result = spawnSync(cargo, [...args, '--manifest-path', manifest, '--locked'], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('Rust build failed. Install Rust and the wasm32-unknown-unknown target.');
}
if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/build-black-litterman.mjs')) {
  buildRust(['build', '--release', '--target', 'wasm32-unknown-unknown', '--lib']);
  await copyFile('rust/black-litterman/target/wasm32-unknown-unknown/release/cbf_black_litterman.wasm', 'src/lib/portfolio/black-litterman.wasm');
}
