import { Link } from 'react-router-dom';

export function FundHistoryPage() {
  return <div className="fund-history-page content-width">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Fund History</span></nav>

    <header className="fund-history-intro">
      <span className="fund-history-kicker">Background</span>
      <h1>Fund History</h1>
      <p>In 2025, a new partnership gave ETSU students the opportunity to manage real investment capital through the Citizens Bank Fund.</p>
    </header>

    <section className="fund-history-chapter" aria-labelledby="history-partnership">
      <figure className="fund-history-image"><img src="/assets/site/campus.webp" alt="ETSU campus with the Appalachian mountains in the distance" width="2048" height="1244" /></figure>
      <div className="fund-history-copy">
        <span className="fund-history-date">01 <span aria-hidden="true">/</span> 2025</span>
        <h2 id="history-partnership">The 2025 partnership</h2>
        <p>The Citizens Bank Tri-Cities Foundation and the LaPorte family joined with ETSU’s Center for the Study of Finance to establish two student-managed investment funds. Through the Students of Finance Association, the Citizens Bank Fund opened hands-on portfolio management to students across campus.</p>
      </div>
    </section>

    <section className="fund-history-chapter fund-history-chapter-reverse" aria-labelledby="history-first-year">
      <figure className="fund-history-image"><img src="/assets/site/fund-members.webp" alt="ETSU finance students and supporters beside market displays" width="800" height="533" loading="lazy" /></figure>
      <div className="fund-history-copy">
        <span className="fund-history-date">02 <span aria-hidden="true">/</span> First year</span>
        <h2 id="history-first-year">The first year</h2>
        <p>The fund published its first investment report in Fall 2025. Over the following semester, members continued researching securities, managing the portfolio, and documenting their work in a Spring 2026 report.</p>
        <p>Founders Yusuf Sulaiman and Milind Chaturvedi helped shape the fund’s first student leadership. <Link to="/legacy">Meet our past presidents <span aria-hidden="true">→</span></Link></p>
      </div>
    </section>

    <div className="fund-history-end">
      <Link to="/portfolio">Explore the portfolio <span aria-hidden="true">→</span></Link>
      <a href="https://www.etsu.edu/cbat/center-finance/student_funds.php" target="_blank" rel="noopener noreferrer">Read ETSU’s fund overview <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>
    </div>
  </div>;
}
