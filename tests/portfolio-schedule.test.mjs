import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import { shouldRefresh } from '../scripts/portfolio/schedule.mjs';

test('scheduled window follows New York time in summer and winter, including closing quotes', () => {
  for (const [date, expected] of [
    ['2026-09-25T13:29:00Z', false], ['2026-09-25T13:30:00Z', true],
    ['2026-09-25T20:22:00Z', true], ['2026-09-25T20:30:00Z', false],
    ['2026-12-07T14:29:00Z', false], ['2026-12-07T14:30:00Z', true],
    ['2026-12-07T21:22:00Z', true], ['2026-12-07T21:30:00Z', false],
    ['2026-09-26T15:00:00Z', false], ['2026-09-27T15:00:00Z', false],
  ]) assert.equal(shouldRefresh('schedule', new Date(date)), expected, date);
  assert.equal(shouldRefresh('push', new Date('2026-09-26T03:00:00Z')), true);
  assert.equal(shouldRefresh('workflow_dispatch', new Date('2026-09-26T03:00:00Z')), true);
  assert.equal(shouldRefresh('pull_request'), false);
});

test('publishing requires successful market export and validation before deployment', async () => {
  const document = parseDocument(await readFile(new URL('../.github/workflows/publish-pages.yml', import.meta.url), 'utf8'));
  assert.deepEqual(document.errors, []);
  const workflow = document.toJS();
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.equal(workflow.on.schedule[0].cron, '7,22,37,52 13-21 * * 1-5');
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow.jobs.deploy.needs, 'build');
  assert.equal(workflow.jobs.deploy.environment.name, 'github-pages');
  const steps = workflow.jobs.build.steps;
  const market = steps.findIndex(step => step.run === 'node scripts/portfolio-static.mjs export market');
  const check = steps.findIndex(step => step.run === 'node scripts/check-pages-preview.mjs');
  const upload = steps.findIndex(step => step.uses?.startsWith('actions/upload-pages-artifact@'));
  assert.ok(market >= 0 && market < check && check < upload);
  assert.equal(steps.filter(step => step.env?.FINNHUB_API_KEY).length, 1);
  assert.ok(steps.every(step => !step['continue-on-error']));
  assert.equal(steps[upload].with.path, '.local/pages-preview');
});
