export const teamIds = ['macroeconomics', 'equities', 'fixed-income', 'commodities'] as const;
export type TeamId = typeof teamIds[number];
export type Member = { id: string; name: string; team: TeamId };

export function countMembers(entries: unknown) {
  if (!Array.isArray(entries)) throw new Error('Member roster must be an array.');
  const seen = new Set<string>();
  const counts = Object.fromEntries(teamIds.map(id => [id, 0])) as Record<TeamId, number>;
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim() || seen.has(entry.id) || typeof entry.name !== 'string' || !teamIds.includes(entry.team)) throw new Error('Each member needs a unique id, a name string, and a valid team.');
    seen.add(entry.id);
    counts[entry.team as TeamId]++;
  }
  return { counts, total: entries.length };
}

export function percentage(count: number, total: number) {
  return `${total ? Math.round(count / total * 100) : 0}%`;
}
