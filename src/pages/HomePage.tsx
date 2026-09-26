import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { NewsCarousel } from '../components/NewsCarousel';
import { ArticleCard } from '../components/ArticleCard';
import { articles, teams, type Article } from '../data/content';
import { money, parsePortfolioData, signedPercent, type PortfolioData } from '../lib/portfolio/display';

export function HomePage() {
  const navigate = useNavigate();
  const openArticle = (article: Article) => navigate('/blog/' + article.id);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  useEffect(() => {
    let disposed = false;
    let active: AbortController | null = null;
    async function load() {
      active?.abort();
      active = new AbortController();
      const controller = active;
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/portfolio.json`, { signal: controller.signal, cache: 'no-cache' });
        if (!response.ok) throw new Error('Portfolio data unavailable');
        const next = parsePortfolioData(await response.json());
        if (!disposed) setPortfolio(next);
      } catch {
        // A failed refresh leaves the last validated portfolio visible.
      } finally { clearTimeout(timeout); }
    }
    void load();
    const poll = setInterval(() => { if (!document.hidden) void load(); }, 300_000);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { disposed = true; active?.abort(); clearInterval(poll); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  const gainRatio = portfolio?.summary.gainVsStartingCapitalRatio ?? null;
  return (<>
        <NewsCarousel onArticle={openArticle} />
        <section className="introduction" aria-label="Introduction"><div className="content-width"><p>The Citizen’s Bank Fund, is a student managed investment fund that manages capital provided by Citizen’s Bank and is under the governance of East Tennessee State University. The portfolio itself has a wide variety of equities and derivatives providing students real world experience with investing and wealth preservation.</p></div></section>

        <section className="about section-space" id="information" aria-labelledby="about-title">
          <div className="content-width">
            <div className="section-heading"><span className="section-label">About Citizen’s Bank Fund</span></div>
            <div className="about-grid">
              <figure className="about-photo"><div className="photo-mat"><img src="/assets/site/fund-members.webp" alt="Citizen’s Bank Fund students together at a university event" width="654" height="489" loading="lazy" /></div></figure>
              <div className="about-copy"><h2 id="about-title">Curious about CBF?<br />Here you have it.</h2>
                <p>The Citizen’s Bank Fund is a student-managed investment fund. We manage capital provided by Citizen’s Bank and operate under East Tennessee State University.</p>
                <p>Our portfolio holds a wide variety of equities and derivatives. Members write and coordinate macroeconomic reports, run discounted cash flow valuations, price options with Black-Scholes, and conduct quantitative research, including commodities analysis.</p>
                <p>Every member has a voice. If a member has an investment idea, they’re encouraged to share it, defend their reasoning, and learn along the way.</p>
                <p>Our macroeconomics, equities, fixed income, and FX & commodities teams produce their own research and coordinate in preparation for weekly fund-wide meetings.</p>
                <Link className="text-link" to="/members">Get to know our teams <span aria-hidden="true">→</span></Link>
              </div>
            </div>
          </div>
        </section>

        <section className="portfolio section-space" id="portfolio" aria-labelledby="portfolio-title">
          <div className="content-width">
            <div className="section-heading"><span className="section-label" id="portfolio-title">Portfolio Key Performance Indicator</span><p>Key performance metrics for the current portfolio.</p></div>
            <dl className="metrics"><div><dt>Gain vs. Starting Capital</dt><dd className={gainRatio !== null && gainRatio > 0 ? 'positive' : undefined}>{signedPercent(gainRatio)}</dd></div><div><dt>Assets Under Management</dt><dd>{money(portfolio?.summary.marketValueCents ?? null)}</dd></div><div><dt>Number of Holdings</dt><dd>{portfolio?.summary.securityCount ?? 'Unavailable'}</dd></div></dl>
          </div>
        </section>

        <section className="teams section-space" id="members" aria-labelledby="teams-title"><div className="content-width">
          <div className="section-heading"><span className="section-label" id="teams-title">Our Teams</span><p>Specialized teams driving performance across global markets.</p></div>
          <div className="team-grid">{teams.map(team => <article className="team-card" key={team.id}><h3><span style={{ backgroundColor: team.color }} />{team.title}</h3><p>{team.description}</p></article>)}</div>
          <div className="teams-bottom"><Link className="text-link" to="/contact">Interested in joining? <span aria-hidden="true">→</span></Link></div>
        </div></section>

        <section className="research section-space" id="blog" aria-labelledby="research-title"><div className="content-width">
          <div className="research-heading"><div><span className="eyebrow">From our desks</span><h2 id="research-title">Research & updates</h2></div><Link className="text-link" to="/blog">View all posts <span aria-hidden="true">→</span></Link></div>
          <div className="research-grid">{articles.map(item => <ArticleCard key={item.id} article={item} />)}</div>
        </div></section>
    </>);
}
