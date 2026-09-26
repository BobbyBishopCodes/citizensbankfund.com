import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { countMembers, percentage } from '../src/lib/member-totals.ts';

test('published roster matches the current team counts', async () => {
  const roster = JSON.parse(await readFile(new URL('../content/members.json', import.meta.url), 'utf8'));
  assert.deepEqual(countMembers(roster), {
    counts: { macroeconomics: 8, equities: 20, 'fixed-income': 4, commodities: 4 },
    total: 36,
  });
});

test('adding, moving, and removing member records updates team totals', () => {
  const roster = [{ id: 'one', name: 'Test member', team: 'equities' }];
  assert.equal(countMembers(roster).counts.equities, 1);
  roster.push({ id: 'two', name: 'Another member', team: 'macroeconomics' });
  assert.equal(countMembers(roster).total, 2);
  roster[0].team = 'macroeconomics';
  assert.equal(countMembers(roster).counts.equities, 0);
  assert.equal(countMembers(roster).counts.macroeconomics, 2);
  roster.pop();
  assert.equal(countMembers(roster).total, 1);
});
test('percentages are whole numbers and empty rosters are safe', () => {
  assert.equal(percentage(9, 24), '38%');
  assert.equal(percentage(5, 24), '21%');
  assert.equal(percentage(0, 0), '0%');
  assert.equal(countMembers([]).total, 0);
});
test('invalid teams and duplicate members are rejected', () => {
  assert.throws(() => countMembers([{ id: 'one', name: '', team: 'unknown' }]));
  assert.throws(() => countMembers([{ id: 'one', name: '', team: 'equities' }, { id: 'one', name: '', team: 'equities' }]));
});
