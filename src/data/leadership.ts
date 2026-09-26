export type Leader = {
  name: string;
  role: string;
  photo?: string;
  biography?: string;
};

export const leadership: { id: string; title: string; members: Leader[] }[] = [
  { id: 'fund-leadership', title: 'Fund Leadership', members: [
    { name: 'Riley Murray', role: 'Co-President', photo: '/assets/leadership/riley-murray-headshot.jpg' },
    { name: 'Danh Le', role: 'Co-President', photo: '/assets/leadership/danh-le.png' },
    { name: 'Matthias Hall', role: 'Vice President & Fixed Income Team Lead', photo: '/assets/leadership/matthias-hall.png' },
    { name: 'Robert Bishop', role: 'Executive Assistant' },
  ] },
  { id: 'equities-leadership', title: 'Equities Team', members: [
    { name: 'Timothy Preshong', role: 'Equities Team Lead', photo: '/assets/leadership/timothy-preshong.png' },
  ] },
  { id: 'macro-leadership', title: 'Macroeconomics Team', members: [
    { name: 'Amelie Jahncke', role: 'Macro Team Lead', photo: '/assets/leadership/amelie-jahncke.png' },
    { name: 'Grey Fisher', role: 'Macro Team Lead' },
  ] },
  { id: 'commodities-leadership', title: 'Commodities Team', members: [
    { name: 'Dennis Pham', role: 'Commodities Team Lead' },
  ] },
];
