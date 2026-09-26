import { Link } from 'react-router-dom';

export function InvestorsPage() {
  return <div className="investors-page content-width">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Investors</span></nav>
    <header className="investors-heading">
      <span className="fund-history-kicker">Our supporters</span>
      <h1>Investors</h1>
      <p>With gratitude to those who make hands-on investing possible for ETSU students.</p>
    </header>
    <section className="investor-card" aria-labelledby="laporte-heading">
      <figure className="investor-photo"><img src="/assets/investors/laporte-group.png" alt="Four people posing together indoors" width="469" height="352" /></figure>
      <div className="investor-card-content">
        <p className="investor-eyebrow">With gratitude</p>
        <h2 id="laporte-heading">Thank you, LaPorte brothers</h2>
        <p>We are deeply grateful to the LaPorte brothers for helping make student-managed investing possible at ETSU. Your support gives students the opportunity to research markets, discuss investment ideas, and learn by managing real capital.</p>
        <p>Thank you for believing in our students and investing in an experience that reaches far beyond the classroom. We appreciate the opportunity and the trust you have placed in the next generation of finance professionals.</p>
      </div>
    </section>
  </div>;
}
