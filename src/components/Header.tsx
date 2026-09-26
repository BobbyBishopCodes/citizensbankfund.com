import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Modal } from './Modal';
import { searchSite } from '../data/content';

export function Header() {
  const isHome = useLocation().pathname === '/';
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const results = searchSite(query);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (query.trim()) setSearchOpen(true);
  }

  return (
    <>
      <header className="masthead" id="home">
        <img className="masthead-photo" src="/assets/site/campus.webp" alt="" fetchPriority="high" />
        <div className="masthead-inner">
          <Link className="brand" to="/" aria-label="Citizen’s Bank Fund home">
            <img src="/assets/branding/ship.webp" alt="" width="225" height="155" />
            {isHome ? <h1 className="brand-title">Citizen’s Bank Fund</h1> : <p className="brand-title">Citizen’s Bank Fund</p>}
          </Link>
          <div className="header-tools">
            <a className="university-link" href="https://www.etsu.edu/" target="_blank" rel="noreferrer">
              <img src="/assets/icons/home-white.svg" alt="" />Go to ETSU.edu
            </a>
            <form className="site-search" role="search" onSubmit={submitSearch}>
              <label className="sr-only" htmlFor="site-search">Search all CBF</label>
              <input id="site-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search all CBF" required maxLength={150} />
              <button type="submit" aria-label="Search"><img src="/assets/icons/search.svg" alt="" /></button>
            </form>
            <a className="header-linkedin" href="https://www.linkedin.com/company/buccaneer-investment-fund/posts/?feedView=all" target="_blank" rel="noopener noreferrer" aria-label="Buccaneer Investment Fund on LinkedIn (opens in a new tab)"><img src="/assets/icons/linkedin.svg" alt="" width="16" height="16" /></a>
          </div>
        </div>
      </header>
      {searchOpen && (
        <Modal title="Search the fund" onClose={() => setSearchOpen(false)}>
          <label className="field-label" htmlFor="results-search">Search all CBF</label>
          <input className="results-input" id="results-search" type="search" value={query} onChange={event => setQuery(event.target.value)} maxLength={150} />
          <p className="search-count" role="status">{query.trim() ? `${results.length} ${results.length === 1 ? 'result' : 'results'} for “${query.trim()}”` : 'Enter a topic to search the site.'}</p>
          <ul className="search-results">
            {results.map(result => (
              <li key={result.href}><Link to={result.href} onClick={() => setSearchOpen(false)}><strong>{result.title}</strong><span>{result.description}</span><span className="result-arrow" aria-hidden="true">→</span></Link></li>
            ))}
          </ul>
          {query.trim() && results.length === 0 && <p className="empty-search">No matching pages. Try “portfolio”, “teams”, or “membership”.</p>}
        </Modal>
      )}
    </>
  );
}
