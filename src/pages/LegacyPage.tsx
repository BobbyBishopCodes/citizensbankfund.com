import { Link } from 'react-router-dom';
import { alumniDestinations, pastPresidents } from '../data/legacy';

const destinationLogos: Record<string, string> = {
  BofA: '/assets/legacy/bofa.png',
  BMO: '/assets/legacy/bmo.svg',
  AB: '/assets/legacy/alliancebernstein.svg',
  'Cambridge Associates': '/assets/legacy/cambridge-associates.svg',
};

export function LegacyPage() {
  return <div className="legacy-page content-width">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Legacy</span></nav>
    <header className="legacy-intro">
      <h1>Our Legacy</h1>
    </header>

    <section className="legacy-presidents" aria-labelledby="past-presidents-title">
      <h2 id="past-presidents-title" className="leadership-section-title">Past Presidents</h2>
      <ol className="legacy-timeline">
        {pastPresidents.map((president, index) => <li className="legacy-timeline-item" key={president.name}>
          <figure className="legacy-timeline-portrait"><img src={president.image} alt={president.name} width="800" height="800" loading="lazy" /></figure>
          <span className="legacy-timeline-marker" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <div className="legacy-timeline-copy">
            <span className="legacy-timeline-kicker">Founding leadership</span>
            <h3>{president.name}</h3>
            <p className="legacy-timeline-role">{president.role}</p>
            <p className="legacy-timeline-position">Past President</p>
          </div>
        </li>)}
      </ol>
    </section>

    <section className="legacy-alumni" aria-labelledby="alumni-destinations-title">
      <h2 id="alumni-destinations-title">Where alumni have gone</h2>
      <p>Fund alumni have continued their careers at organizations including:</p>
      <ul>{alumniDestinations.map(destination => <li key={destination}>
        <div className="legacy-alumni-logo"><img src={destinationLogos[destination]} alt={`${destination} logo`} loading="lazy" /></div>
        <span>{destination}</span>
      </li>)}</ul>
    </section>
  </div>;
}
