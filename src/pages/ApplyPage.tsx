import { Link } from 'react-router-dom';
import { application } from '../data/application';

export function ApplyPage() {
  return <div className="apply-page content-width">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Apply</span></nav>
    <h1>Apply to the fund</h1>
    <div className="contact-grid">
      <aside className="contact-details apply-details">
        <h2>Join Citizens Bank Fund</h2>
        <p>Our student managed fund gives ETSU students the chance to research markets, discuss investment ideas, and contribute to a real portfolio.</p>
        <p>Membership is selective. We look for curiosity, commitment, and a willingness to learn and work with a team. You do not need to have a preferred team before applying.</p>
        <p>Fund leadership will review your application and follow up by email.</p>
        <Link to="/members">Meet our research teams <span aria-hidden="true">→</span></Link>
      </aside>
      <a className="button application-link" href={application.url} target="_blank" rel="noopener noreferrer">Apply through Google Forms <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>
    </div>
  </div>;
}
