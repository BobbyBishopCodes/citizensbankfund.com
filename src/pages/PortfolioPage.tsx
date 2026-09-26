import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PortfolioAllocation } from '../components/PortfolioAllocation';
import { parsePortfolioData, money, percent, signedMoney, signedPercent, dateLabel, quoteDateLabel, quantity, priceState, filterAndSort, type PortfolioData, type DisplayPosition, type SortKey } from '../lib/portfolio/display';
import './portfolio.css';

const names: Record<string, string> = { BMY: 'Bristol Myers Squibb', COF: 'Capital One', CSCO: 'Cisco Systems', FSLR: 'First Solar', GE: 'GE Aerospace', QQQM: 'Invesco Nasdaq 100 ETF', SPHD: 'Invesco S&P 500 High Dividend Low Volatility ETF', BINC: 'iShares Flexible Income Active ETF', EWJ: 'iShares MSCI Japan ETF', IEF: 'iShares 7–10 Year Treasury Bond ETF', HYG: 'iShares High Yield Corporate Bond ETF', LQD: 'iShares Investment Grade Corporate Bond ETF', INDA: 'iShares MSCI India ETF', MSFT: 'Microsoft', PG: 'Procter & Gamble', GLD: 'SPDR Gold Shares', XLE: 'Energy Select Sector SPDR ETF', TTWO: 'Take-Two Interactive', U: 'Unity Software', VDC: 'Vanguard Consumer Staples ETF', VOO: 'Vanguard S&P 500 ETF', VGSH: 'Vanguard Short-Term Treasury ETF' };
const semesterReports = [
  { term: 'Spring 2026', href: 'https://www.etsu.edu/cbat/center-finance/documents/cbffund-spring26.pdf' },
  { term: 'Fall 2025', href: 'https://www.etsu.edu/cbat/center-finance/documents/citizens-bank-fund-fall2025.pdf' },
];
const positionName = (position: DisplayPosition) => names[position.symbol ?? ''] ?? position.description;
const gainClass = (value: number | null) => value === null || value === 0 ? '' : value > 0 ? 'pf-positive' : 'pf-negative';
const columns: { key: SortKey; label: string; className?: string }[] = [
  { key: 'symbol', label: 'Ticker' }, { key: 'description', label: 'Company / Fund', className: 'pf-name-column' },
  { key: 'quantity', label: 'Shares' }, { key: 'price', label: 'Last Price' },
  { key: 'averageInvestmentPerUnit', label: 'Avg. Invested / Unit' },
  { key: 'marketValueCents', label: 'Position Value' }, { key: 'amountInvestedCents', label: 'Amount Invested' },
  { key: 'investmentGainCents', label: 'Gain / Loss' }, { key: 'weightRatio', label: 'Weight' },
  { key: 'estimatedAnnualIncomeCents', label: 'Est. Annual Income' },
  { key: 'estimatedIncomeYieldRatio', label: 'Income Yield' },
];

function PositionDetails({ position, now, staleAfterMs }: { position: DisplayPosition; now: number; staleAfterMs: number }) {
  const state = priceState(position, now, staleAfterMs);
  return <div className="pf-position-details">
    <p>{position.description}</p>
    <dl>
      <div><dt>Shares / units</dt><dd>{quantity(position.quantity)}</dd></div>
      <div><dt>Reported amount invested</dt><dd>{money(position.amountInvestedCents)}</dd></div>
      <div><dt>Average invested per unit</dt><dd>{position.averageInvestmentPerUnit === null ? 'Unavailable' : money(position.averageInvestmentPerUnit * 100)}</dd></div>
      <div><dt>Estimated annual income</dt><dd>{money(position.estimatedAnnualIncomeCents)}</dd></div>
      <div><dt>Estimated income yield</dt><dd>{percent(position.estimatedIncomeYieldRatio)}</dd></div>
      <div><dt>Price / source</dt><dd>{money(Number(position.price) * 100)} · {state === 'CSV snapshot' || state === 'Cash snapshot' ? 'Raymond James CSV' : position.priceSource}</dd></div>
      <div><dt>Price as of</dt><dd>{position.valueSource === 'broker-reported-value' ? dateLabel(position.priceAsOf) : quoteDateLabel(position.priceAsOf)} · {state}</dd></div>
    </dl>
  </div>;
}

export function PortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'marketValueCents', direction: 'desc' });
  const [expanded, setExpanded] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let disposed = false;
    let active: AbortController | null = null;
    async function load() {
      active?.abort(); active = new AbortController();
      const controller = active;
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/portfolio.json`, { signal: controller.signal, cache: 'no-cache' });
        if (!response.ok) throw new Error('Portfolio not available');
        const next = parsePortfolioData(await response.json());
        if (!disposed) { setData(next); setFailed(false); setNow(Date.now()); }
      } catch {
        if (!disposed && controller === active) setFailed(true);
      } finally { clearTimeout(timeout); }
    }
    void load();
    const poll = setInterval(() => { if (!document.hidden) void load(); }, 300_000);
    const clock = setInterval(() => setNow(Date.now()), 60_000);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { disposed = true; active?.abort(); clearInterval(poll); clearInterval(clock); document.removeEventListener('visibilitychange', onVisible); };
  }, [retry]);

  const securities = data?.positions.filter(position => position.assetType !== 'cash') ?? [];
  const quoteDates = securities.filter(position => position.valueSource === 'quantity-times-quote').map(position => position.priceAsOf).sort();
  const visible = data ? filterAndSort(data.positions, query, filter, sort.key, sort.direction) : [];
  const top = [...securities].sort((a, b) => b.marketValueCents - a.marketValueCents).slice(0, 6);
  const otherValue = data ? data.summary.marketValueCents - top.reduce((sum, position) => sum + position.marketValueCents, 0) : 0;
  const barMax = Math.max(...top.map(position => position.marketValueCents), otherValue, 1);
  const showHoldings = () => { setFilter('all'); setQuery(''); document.getElementById('all-holdings')?.scrollIntoView({ behavior: 'smooth' }); search.current?.focus({ preventScroll: true }); };
  function changeSort(key: SortKey) { setSort(previous => ({ key, direction: previous.key === key && previous.direction === 'desc' ? 'asc' : 'desc' })); }

  return <div className="portfolio-page"><div className="pf-content">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Portfolio</span></nav>
    <header className="pf-page-heading">
      <div><h1>Portfolio</h1><p>Current holdings, allocation, and investment gains.</p></div>
      {data && <div className="pf-freshness"><span>Holdings as of <strong>{dateLabel(data.holdingsAsOfDate)}</strong></span>{quoteDates.length > 0 && <span>Oldest quote: {quoteDateLabel(quoteDates[0])}</span>}</div>}
    </header>
    {failed && <div className="pf-notice" role="alert"><p>{data ? 'Could not check for updates. Showing the last loaded snapshot.' : 'Portfolio data could not be loaded. Please try again.'}</p><button onClick={() => { setFailed(false); setRetry(value => value + 1); }}>Try again</button></div>}
    {!data && !failed && <div className="pf-loading" role="status">Loading portfolio positions…</div>}
    {data && <>
      <dl className="pf-summary">
        <div><dt>Portfolio Value</dt><dd>{money(data.summary.marketValueCents)}</dd><p>{data.summary.securityCount} securities · {money(data.summary.cashValueCents)} cash</p></div>
        <div><dt>Gain vs. Starting Capital</dt><dd className={gainClass(data.summary.gainVsStartingCapitalCents)}>{signedMoney(data.summary.gainVsStartingCapitalCents)}</dd><p><span className={gainClass(data.summary.gainVsStartingCapitalRatio)}>{signedPercent(data.summary.gainVsStartingCapitalRatio)}</span></p></div>
        <div><dt>Estimated Annual Income</dt><dd>{money(data.summary.estimatedAnnualIncomeCents)}</dd><p>{percent(data.summary.estimatedIncomeYieldRatio)} portfolio income yield</p></div>
        <div><dt>Estimated Income Yield</dt><dd>{percent(data.summary.estimatedIncomeYieldRatio)}</dd><p>Annual income ÷ portfolio value</p></div>
      </dl>
      <div className="pf-charts"><PortfolioAllocation data={data} />
        <section className="pf-panel pf-top-holdings" aria-labelledby="top-holdings-heading"><div className="pf-panel-heading"><h2 id="top-holdings-heading">Top Holdings</h2><button className="pf-text-button" onClick={showHoldings}>View all holdings<img src="/assets/icons/chevron-right.svg" alt="" /></button></div>
          <ul>{top.map(position => <li key={position.id}><strong>{position.symbol}</strong><span className="pf-top-name" title={positionName(position)}>{positionName(position)}</span><meter min={0} max={barMax} value={position.marketValueCents} aria-label={`${position.symbol} portfolio weight ${percent(position.weightRatio)}`} /><span>{percent(position.weightRatio)}</span></li>)}<li className="pf-top-other"><strong>Other</strong><span className="pf-top-name">{data.positions.length - top.length} positions, including cash</span><meter min={0} max={barMax} value={otherValue} aria-label={`Other positions ${percent(data.summary.marketValueCents ? otherValue / data.summary.marketValueCents : null)}`} /><span>{percent(data.summary.marketValueCents ? otherValue / data.summary.marketValueCents : null)}</span></li></ul>
          <p className="pf-panel-note">Weights include cash in the total portfolio value.</p>
        </section>
      </div>
      <section className="pf-panel pf-holdings" id="all-holdings" aria-labelledby="holdings-heading">
        <div className="pf-panel-heading"><h2 id="holdings-heading">All Holdings <span>({data.summary.securityCount})</span></h2><label className="pf-search"><img src="/assets/icons/search.svg" alt="" /><span className="sr-only">Search holdings by ticker or company</span><input ref={search} type="search" placeholder="Search by ticker or company…" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
        <div className="pf-table-tools"><div className="pf-filters" role="group" aria-label="Filter holdings">{[['all', 'All positions'], ['stock', 'Stocks'], ['fund', 'Funds'], ['cash', 'Cash']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div><span role="status">{query || filter !== 'all' ? `${visible.length} matching ${visible.length === 1 ? 'position' : 'positions'}` : `${data.summary.securityCount} securities + cash`}</span></div>
        <div className="pf-table-wrap" role="region" aria-label="Scrollable portfolio positions" tabIndex={0}><table><caption className="sr-only">Portfolio positions. Scroll horizontally for all columns, select a heading to sort, or select a ticker for details. Gain is measured against reported invested capital.</caption><thead><tr>{columns.map(column => <th scope="col" key={column.key} className={column.className} aria-sort={sort.key === column.key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button onClick={() => changeSort(column.key)}>{column.label}{sort.key === column.key && <img className={sort.direction === 'asc' ? 'pf-sort-up' : ''} src="/assets/icons/chevron-down.svg" alt="" />}</button></th>)}<th scope="col"><span className="sr-only">Details</span></th></tr></thead>
          <tbody>{visible.map(position => {
            const open = expanded === position.id;
            const detailsId = `details-${encodeURIComponent(position.id)}`;
            return <Fragment key={position.id}><tr className={`${position.assetType === 'cash' ? 'pf-cash-row' : ''} ${open ? 'pf-expanded-row' : ''}`}>
              <th scope="row"><button className="pf-ticker" aria-expanded={open} aria-controls={detailsId} aria-label={`${open ? 'Collapse' : 'Expand'} ${position.symbol ?? 'cash'} details`} onClick={() => setExpanded(open ? null : position.id)}>{position.symbol ?? 'Cash'}</button></th>
              <td className="pf-name-column"><span title={positionName(position)}>{positionName(position)}</span></td>
              <td>{position.assetType === 'cash' ? '—' : quantity(position.quantity)}</td><td title={position.assetType === 'cash' ? undefined : `Price as of ${position.valueSource === 'broker-reported-value' ? dateLabel(position.priceAsOf) : quoteDateLabel(position.priceAsOf)}`}>{position.assetType === 'cash' ? '—' : money(Number(position.price) * 100)}</td>
              <td>{position.assetType === 'cash' ? '—' : money(position.averageInvestmentPerUnit === null ? null : position.averageInvestmentPerUnit * 100)}</td>
              <td className="pf-value">{money(position.marketValueCents)}</td><td>{money(position.amountInvestedCents)}</td>
              <td className={`pf-gain ${gainClass(position.investmentGainCents)}`}>{signedMoney(position.investmentGainCents)} <span>({signedPercent(position.investmentGainRatio)})</span></td><td>{percent(position.weightRatio)}</td>
              <td>{money(position.estimatedAnnualIncomeCents)}</td><td>{percent(position.estimatedIncomeYieldRatio)}</td>
              <td><button className="pf-expand" aria-label={`${open ? 'Hide' : 'Show'} ${position.symbol ?? 'cash'} position details`} aria-expanded={open} aria-controls={detailsId} onClick={() => setExpanded(open ? null : position.id)}><img className={open ? 'is-open' : ''} src="/assets/icons/chevron-right.svg" alt="" /></button></td>
            </tr><tr id={detailsId} hidden={!open}><td colSpan={columns.length + 1} className="pf-details-cell">{open && <PositionDetails position={position} now={now} staleAfterMs={data.publication.staleAfterMs} />}</td></tr></Fragment>;
          })}{!visible.length && <tr><td colSpan={columns.length + 1} className="pf-empty">No holdings match your search. <button className="pf-text-button" onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters</button></td></tr>}</tbody>
        </table></div>
      </section>
    </>}
    <section className="pf-panel pf-reports" aria-labelledby="semester-reports-heading">
      <div className="pf-panel-heading"><h2 id="semester-reports-heading">Semester Reports</h2></div>
      <div className="pf-report-grid">{semesterReports.map(report => <a className="pf-report-link" href={report.href} target="_blank" rel="noopener noreferrer" key={report.term}>
        <span className="pf-report-meta">ETSU · PDF</span>
        <strong>{report.term} Investment Report</strong>
        <span className="pf-report-action">View report <span aria-hidden="true">↗</span></span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>)}</div>
    </section>
  </div></div>;
}
