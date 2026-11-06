import { Link } from 'react-router-dom';

const documents = [
  {
    title: 'Bylaws',
    description: 'The fund’s membership, leadership structure, appointments, and succession procedures.',
    href: '/documents/CBFBylawsV1.pdf',
    pages: '16 pages',
  },
  {
    title: 'Constitution',
    description: 'The Foundation agreement and investment guidelines covering the fund’s educational purpose, portfolio objectives, and diversification.',
    href: '/documents/CBFConstitution.pdf',
    pages: '3 pages',
  },
];

export function GovernancePage() {
  return <div className="governance-page content-width">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Governance</span></nav>
    <header className="governance-heading">
      <span className="fund-history-kicker">Fund documents</span>
      <h1>Governance</h1>
      <p>The official record of the Citizens Bank Fund’s governing documents.</p>
    </header>
    <div className="governance-documents">
      {documents.map((document, index) => <article className="governance-document" key={document.title}>
        <span className="governance-document-number" aria-hidden="true">0{index + 1}</span>
        <div className="governance-document-copy">
          <p className="governance-document-type">Fund document <span aria-hidden="true">/</span> PDF <span aria-hidden="true">/</span> {document.pages}</p>
          <h2>{document.title}</h2>
          <p>{document.description}</p>
          <div className="governance-document-links">
            <a href={document.href} target="_blank" rel="noopener noreferrer">View PDF <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>
            <a href={document.href} download>Download PDF <span aria-hidden="true">↓</span></a>
          </div>
        </div>
      </article>)}
    </div>
  </div>;
}
