export type Leader = {
  name: string;
  role: string;
  photo?: string;
  biography: string;
  linkedin: string;
};

export const leadership: { id: string; title: string; members: Leader[] }[] = [
  { id: 'fund-leadership', title: 'Fund Leadership', members: [
    {
      name: 'Riley Murray', role: 'Co-President', photo: '/assets/leadership/riley-murray-headshot.jpg',
      biography: "Riley is a senior studying Financial Economics and Mathematics. He's aspiring to go into Algorithmic/Quantitative Trading or Research.",
      linkedin: 'https://www.linkedin.com/in/murrayriley/',
    },
    {
      name: 'Danh Le', role: 'Co-President', photo: '/assets/leadership/danh-le.png',
      biography: "Danh is a junior studying Finance and Accounting. He's aspiring to go into Financial Services.",
      linkedin: 'https://www.linkedin.com/in/danh-le-bb3669330/',
    },
    {
      name: 'Matthias Hall', role: 'Vice President', photo: '/assets/leadership/matthias-hall.png',
      biography: "Matthias is a junior studying Mathematics and Finance. He's aspiring to go into Actuarial Science.",
      linkedin: 'https://www.linkedin.com/in/matthias-hall-341b7b358/',
    },
    {
      name: 'Robert Bishop', role: 'Executive Assistant',
      biography: "Robert is a sophomore studying Accounting & Finance. He's aspiring to go into Accounting and focus on systems.",
      linkedin: 'https://www.linkedin.com/in/robertbishop08/?isSelfProfile=true',
    },
  ] },
  { id: 'equities-leadership', title: 'Equities Team', members: [
    {
      name: 'Timothy Preshong', role: 'Equities Team Lead', photo: '/assets/leadership/timothy-preshong.png',
      biography: "Timothy is a junior studying Finance, Economics, Accounting, and Spanish. He's aspiring to go into Financial Planning/Wealth Management.",
      linkedin: 'https://www.linkedin.com/in/timothypreshong/',
    },
    {
      name: 'Saron Berhanu', role: 'Equities Team Lead',
      biography: "Saron is a senior studying Finance. She's aspiring to go into investment banking.",
      linkedin: 'https://www.linkedin.com/in/saronberhanu/',
    },
  ] },
  { id: 'fixed-income-leadership', title: 'Fixed Income Team', members: [
    {
      name: 'Andrew Peterson', role: 'Bond Team Leader', photo: '/assets/leadership/andrew-peterson.png',
      biography: "Andrew is a junior studying Finance and Accounting. He's aspiring to go into Financial Services.",
      linkedin: 'https://www.linkedin.com/in/andrew-peterson-1088763a8/',
    },
  ] },
  { id: 'macro-leadership', title: 'Macroeconomics Team', members: [
    {
      name: 'Amelie Jahncke', role: 'Macro Team Lead', photo: '/assets/leadership/amelie-jahncke.png',
      biography: "Amelie is a junior studying Economics and Finance. She's aspiring to go into FP&A.",
      linkedin: 'https://www.linkedin.com/in/amelie-jahncke-16525737a/',
    },
    {
      name: 'Grey Fisher', role: 'Macro Team Lead',
      biography: "Grey is a junior studying Economics, Philosophy, and Bluegrass. He's aspiring to go into Law.",
      linkedin: 'https://www.linkedin.com/in/grey-fisher-010652312/',
    },
  ] },
  { id: 'commodities-leadership', title: 'Commodities Team', members: [
    {
      name: 'Dennis Pham', role: 'Commodities Team Lead', photo: '/assets/leadership/denis-pham.png',
      biography: "Dennis is a junior studying Finance. He's aspiring to go into Financial Services.",
      linkedin: 'https://www.linkedin.com/in/dennis-pham-63a1643ab/',
    },
  ] },
];
