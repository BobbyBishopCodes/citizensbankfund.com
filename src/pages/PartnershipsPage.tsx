import { Link } from 'react-router-dom';

const partners = [
  {
    name: 'Wall Street Oasis',
    logo: '/assets/partners/wall-street-oasis.webp',
    description: 'A community and learning resource for finance careers.',
    href: 'https://www.wallstreetoasis.com/',
    theme: 'light',
  },
  {
    name: 'Godel Terminal',
    logo: '/assets/partners/godel-terminal.svg',
    description: 'Market data and research tools in a browser-based terminal.',
    href: 'https://godelterminal.com/',
    theme: 'dark',
  },
];

export function PartnershipsPage() {
  return <div className="partnerships-page content-width">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Partnerships</span></nav>
    <header className="partnerships-heading">
      <h1>Partnerships</h1>
      <p>Connecting our members with the wider world of finance.</p>
    </header>
    <div className="partner-grid">
      {partners.map(partner => <article className="partner-card" key={partner.name}>
        <div className={`partner-media partner-media-${partner.theme}`}><img src={partner.logo} alt={`${partner.name} logo`} /></div>
        <div className="partner-copy">
          <h2>{partner.name}</h2>
          <p>{partner.description}</p>
          <a href={partner.href} target="_blank" rel="noreferrer">Visit website <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>
        </div>
      </article>)}
    </div>
  </div>;
}
