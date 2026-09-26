import { Link } from 'react-router-dom';

export function ScholarshipsPage() {
  return <div className="scholarships-page content-width">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Scholarships</span></nav>
    <div className="scholarships-grid">
      <div className="scholarships-copy">
        <h1>Scholarships</h1>
        <h2>A possible way to support future Buccaneers.</h2>
        <p>The Citizen’s Bank Fund may offer scholarships in the future to support East Tennessee State University students interested in finance and investing.</p>
        <p>This is a potential future initiative. No fund scholarship is currently available, and we have not announced eligibility requirements or an application timeline.</p>
        <p>If a scholarship program is established, we’ll share details here. You can <Link to="/contact">contact us</Link> with questions in the meantime.</p>
      </div>
      <figure className="scholarship-card">
        <img className="scholarship-photo" src="/assets/site/etsu-welcome-center.png" alt="East Tennessee State University’s illuminated sign and Welcome Center at dusk" width="800" height="533" />
      </figure>
    </div>
  </div>;
}
