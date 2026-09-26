import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// UTC cron covers both offsets; this check follows New York daylight saving time.
export function shouldRefresh(event, now = new Date()) {
  if (event === 'push' || event === 'workflow_dispatch') return true;
  if (event !== 'schedule') return false;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: '2-digit',
    minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return !['Sat', 'Sun'].includes(parts.weekday) && minutes >= 570 && minutes < 990;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const refresh = shouldRefresh(process.env.GITHUB_EVENT_NAME);
  appendFileSync(process.env.GITHUB_OUTPUT, `refresh=${refresh}\n`);
  console.log(refresh ? 'Refresh enabled.' : 'Outside the weekday 9:30 AM–4:30 PM New York refresh window.');
}
