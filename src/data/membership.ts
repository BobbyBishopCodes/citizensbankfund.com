import roster from '../../content/members.json';
import { countMembers, percentage, type TeamId } from '../lib/member-totals';

const { counts, total } = countMembers(roster);
export const memberTeams = [
  { id: 'macroeconomics', name: 'Macroeconomics', color: '#078466', description: 'Tracks economic data, central bank policy, and global market trends to inform the fund’s strategy.' },
  { id: 'equities', name: 'Equities', color: '#17558e', description: 'Conducts fundamental analysis and stock selection research across global markets.' },
  { id: 'fixed-income', name: 'Fixed Income', color: '#594080', description: 'Analyzes interest rates, credit markets, and bond strategies to manage risk and identify opportunities.' },
  { id: 'commodities', name: 'FX & Commodities', color: '#bb8917', description: 'Covers currencies, commodities, and global trade dynamics to identify investment opportunities and hedging strategies.' },
].map(team => ({ ...team, count: counts[team.id as TeamId] }));

export const totalMembers = total;
export const memberShare = (count: number) => percentage(count, totalMembers);
export const distributionTeams = [...memberTeams].sort((a, b) => b.count - a.count);
