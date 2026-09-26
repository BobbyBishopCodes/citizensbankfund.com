import { leadership } from './leadership';
import { alumniDestinations, pastPresidents } from './legacy';
import articles from 'virtual:articles';
export { articles };
export type { Article } from '../lib/article-files';


export const teams = [
  {
    id: 'macroeconomics', title: 'Macroeconomics', color: '#39832d',
    description: 'Our macro team tracks inflation, jobs numbers, interest rates, and sector performance. We write weekly reports that the whole fund uses to make decisions. When the Fed moves or CPI surprises, we’re the ones explaining what it means for the portfolio.',
  },
  {
    id: 'equities', title: 'Equities', color: '#3168a9',
    description: 'The equities team pitches individual stocks. We run discounted cash flow valuations, dig through financials, and defend our picks to the fund. Every position starts as someone’s pitch, followed by discussions and revisions to a proposed investment.',
  },
  {
    id: 'commodities', title: 'FX & Commodities', color: '#b48723',
    description: 'This team covers currencies and commodity markets like oil, gold, and agriculture. We track supply and demand, central bank policy, and global trade flows, then turn that into quantitative research the fund can act on.',
  },
  {
    id: 'fixed-income', title: 'Fixed Income', color: '#7b6594',
    description: 'Our fixed income team handles bonds. We manage the fund’s exposure to interest rates and credit, balancing steady returns against risk. When rates shift, this team decides how the portfolio adjusts.',
  },
];

export type InformationKey = 'achievements' | 'scholarships' | 'join';
export const information: Record<InformationKey, { title: string; paragraphs: string[]; link?: { label: string; href: string } }> = {
  achievements: {
    title: 'Learning through experience',
    paragraphs: [
      'Members develop research, present investment ideas, and defend their reasoning in fund-wide discussions. That work brings classroom concepts into practical investment analysis.',
      'A record of fund awards, competitions, and milestones will be published here once the details are confirmed.',
    ],
  },
  scholarships: {
    title: 'Scholarships',
    paragraphs: [
      'A fund scholarship program is a possible future initiative. No fund scholarship is currently available, and no application timeline has been announced.',
      'Visit East Tennessee State University for current university scholarship information and eligibility requirements.',
    ],
    link: { label: 'Visit ETSU', href: 'https://www.etsu.edu/' },
  },
  join: {
    title: 'Become part of the conversation',
    paragraphs: [
      'The fund brings together students interested in markets, research, and investment analysis. Members contribute ideas, work within specialized teams, and prepare for fund-wide meetings.',
      'Membership and direct contact details will be added here when applications open. In the meantime, visit ETSU to connect with the university.',
    ],
    link: { label: 'Visit ETSU', href: 'https://www.etsu.edu/' },
  },
};

export const searchEntries = [
  { title: 'Leadership', description: 'Fund leadership and team leads.', href: '/leadership', keywords: leadership.flatMap(group => group.members.map(member => member.name + ' ' + member.role)).join(' ') },
  { title: 'Legacy', description: 'Past presidents and alumni destinations.', href: '/legacy', keywords: `${pastPresidents.map(president => president.name).join(' ')} ${alumniDestinations.join(' ')} alumni history` },
  { title: 'Partnerships', description: 'Wall Street Oasis and Godel Terminal.', href: '/partnerships', keywords: 'partners Wall Street Oasis WSO Godel Terminal finance' },
  { title: 'Scholarships', description: 'A possible future scholarship program for ETSU students.', href: '/scholarships', keywords: 'scholarships eligibility financial aid possible future program' },
  { title: 'Fund History', description: 'How the Citizens Bank Fund began and its first year at ETSU.', href: '/fund-history', keywords: 'history origins 2025 Citizens Bank LaPorte Students of Finance Association' },
  { title: 'Portfolio', description: 'Current holdings, allocation, investment gains, and estimated income.', href: '/portfolio', keywords: 'portfolio returns performance assets holdings kpi' },
  { title: 'Our research teams', description: 'Meet our macroeconomics, equities, FX & commodities, and fixed income teams.', href: '/members', keywords: teams.map(team => `${team.title} ${team.description}`).join(' ') },
  { title: 'Blog', description: 'Research topics and market commentary from the fund.', href: '/blog', keywords: 'blog research updates articles' },
  { title: 'Contact & membership', description: 'Learn about getting involved with the fund.', href: '/contact', keywords: 'contact join membership apply applications students partnership scholarships' },
  ...articles.map(article => ({ title: article.title, description: article.summary, href: `/blog/${article.id}`, keywords: `${article.category} ${article.author ?? ''} ${article.body}` })),
];

export function searchSite(query: string) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return searchEntries.filter(entry => {
    const text = `${entry.title} ${entry.description} ${entry.keywords}`.toLowerCase();
    return words.every(word => text.includes(word));
  });
}
