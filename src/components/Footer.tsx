import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="footer" id="contact">
      <div className="footer-main content-width">
        <Link className="footer-brand" to="/"><img src="/assets/branding/ship.webp" alt="" width="125" height="86" /><span>Citizen’s Bank Fund<small>East Tennessee State University<br />Johnson City, Tennessee</small></span></Link>
        <div className="footer-column"><h3>The Fund</h3><Link to="/fund-history">Fund history</Link><Link to="/portfolio">Portfolio overview</Link><Link to="/members">Our teams</Link><Link to="/leadership">Leadership</Link></div>
        <div className="footer-column"><h3>Explore</h3><Link to="/blog">Research & updates</Link><Link to="/partnerships">Partnerships</Link><Link to="/scholarships">Scholarships</Link></div>
        <div className="footer-column footer-university"><h3>Our University</h3><a href="https://www.etsu.edu/" target="_blank" rel="noreferrer">Visit ETSU.edu <span aria-hidden="true">↗</span></a><span className="university-signature"><img src="/assets/branding/etsu-shield.webp" alt="ETSU shield" width="42" height="44" /><span>East Tennessee<br />State University</span></span></div>
      </div>
      <div className="footer-bottom content-width"><p>© {new Date().getFullYear()} Citizen’s Bank Fund. Website created by Robert Bishop.</p><a href="#home">Back to top <span aria-hidden="true">↑</span></a></div>
    </footer>
  );
}
