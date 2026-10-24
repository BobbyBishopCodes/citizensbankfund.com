import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { parsePortfolioData, type PortfolioData } from '../lib/portfolio/display';
import './macro.css';

type Response = { estimate: number[]; lower: number[]; upper: number[] };
type PositionResponse = { ticker: string; status: string; reason?: string; cpi?: Response; ppi?: Response };
type MacroSnapshot = { targetMonth: string; forecast: { cpi: number; ppi: number; cpiRange80?: number[]; ppiRange80?: number[] }; modelCutoff: string; holdingsAsOf: string; positions: PositionResponse[] };
const monthName = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const pct = (value: number) => `${value.toFixed(2)}%`;
const range = (values?: number[]) => values ? `${pct(values[0])} to ${pct(values[1])}` : '—';
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}`;
const responseAt = (response: Response, month: number) => `${signed(response.estimate[month])} pp`;
const unavailable = (position: { result?: PositionResponse }) => position.result?.reason?.startsWith('Insufficient history') ? position.result.reason : position.result ? 'No modeled response' : 'Not in research snapshot';

function ResponseChart({ response, label, color }: { response: Response; label: string; color: string }) {
  const width = 500, height = 205, left = 42, right = 12, top = 14, bottom = 28;
  const values = [...response.lower, ...response.upper, 0];
  const min = Math.min(...values), max = Math.max(...values);
  const gap = (max - min) * .08 || .1;
  const lo = min - gap, hi = max + gap;
  const x = (index: number) => left + index * (width - left - right) / 12;
  const y = (value: number) => top + (hi - value) * (height - top - bottom) / (hi - lo);
  const line = response.estimate.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const band = response.upper.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ') + ' ' + response.lower.map((_, index) => 12 - index).map(index => `L${x(index).toFixed(1)},${y(response.lower[index]).toFixed(1)}`).join(' ') + ' Z';
  return <div className="macro-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} response over 12 months with 95 percent confidence band`}>
    {[0, 3, 6, 9, 12].map(month => <g key={month}><line x1={x(month)} x2={x(month)} y1={top} y2={height - bottom} className="macro-grid" /><text x={x(month)} y={height - 5} textAnchor="middle">{month}</text></g>)}
    <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="macro-zero" />
    <path d={band} fill={color} opacity=".12" /><path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
    <text x="2" y={y(0) - 5} className="macro-zero-label">0</text>
  </svg></div>;
}

export function MacroPage() {
  const [data, setData] = useState<{ snapshot: MacroSnapshot; portfolio: PortfolioData } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState('VOO');
  useEffect(() => {
    let disposed = false;
    let active: AbortController | null = null;
    async function load() {
      active?.abort();
      active = new AbortController();
      const controller = active;
      try {
        const [macroResponse, portfolioResponse] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}data/macro.json`, { signal: controller.signal, cache: 'no-cache' }),
          fetch(`${import.meta.env.BASE_URL}data/portfolio.json`, { signal: controller.signal, cache: 'no-cache' }),
        ]);
        if (!macroResponse.ok || !portfolioResponse.ok) throw new Error('Research data unavailable');
        const snapshot = await macroResponse.json() as MacroSnapshot;
        const portfolio = parsePortfolioData(await portfolioResponse.json());
        if (snapshot.holdingsAsOf !== portfolio.holdingsAsOfDate) throw new Error('Macro data does not match current holdings');
        if (!disposed && controller === active) { setData({ snapshot, portfolio }); setFailed(false); }
      } catch {
        if (!disposed && controller === active && !controller.signal.aborted) setFailed(true);
      }
    }
    void load();
    const poll = setInterval(() => { if (!document.hidden) void load(); }, 300_000);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { disposed = true; active?.abort(); clearInterval(poll); document.removeEventListener('visibilitychange', onVisible); };
  }, [retry]);

  if (!data) return <div className="macro-page"><div className="macro-content macro-state" role={failed ? 'alert' : 'status'}>{failed ? <>Macro data could not be loaded. <button onClick={() => { setFailed(false); setRetry(value => value + 1); }}>Try again</button></> : 'Loading macro data…'}</div></div>;
  const { snapshot, portfolio } = data;
  const responses = new Map(snapshot.positions.map(position => [position.ticker, position]));
  const positions = portfolio.positions.filter(position => position.symbol).map(position => ({ ticker: position.symbol!, name: position.description, result: responses.get(position.symbol!) }));
  const modeled = positions.filter(position => position.result?.cpi && position.result?.ppi);
  const activeTicker = modeled.some(position => position.ticker === selected) ? selected : modeled[0]?.ticker ?? '';
  const active = responses.get(activeTicker);
  const target = monthName(snapshot.targetMonth);
  return <div className="macro-page"><div className="macro-content">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Macro</span></nav>
    <header className="macro-heading"><div><h1>Macro</h1><p>CPI, PPI, and portfolio responses.</p></div><span>IRF estimation through {snapshot.modelCutoff}</span></header>

    <div className="macro-forecast-grid" aria-label="Inflation forecasts">
      <section className="macro-panel macro-forecast"><div className="macro-panel-heading"><h2>CPI forecast</h2><span>{target}</span></div><strong>{pct(snapshot.forecast.cpi)}</strong><p>{snapshot.forecast.cpiRange80 ? `Approx. 80% range · ${range(snapshot.forecast.cpiRange80)}` : 'Month-over-month change'}</p></section>
      <section className="macro-panel macro-forecast macro-ppi"><div className="macro-panel-heading"><h2>PPI forecast</h2><span>{target}</span></div><strong>{pct(snapshot.forecast.ppi)}</strong><p>{snapshot.forecast.ppiRange80 ? `Approx. 80% range · ${range(snapshot.forecast.ppiRange80)}` : 'Month-over-month change'}</p></section>
    </div>

    <section className="macro-panel macro-data" aria-labelledby="macro-forecast-heading"><div className="macro-panel-heading"><h2 id="macro-forecast-heading">Forecast data</h2><span>Research snapshot</span></div>
      <div className="macro-table-wrap" role="region" tabIndex={0} aria-label="Scrollable forecast data"><table><thead><tr><th scope="col">Target month</th><th scope="col">CPI</th>{snapshot.forecast.cpiRange80 && <th scope="col">CPI 80% range</th>}<th scope="col">PPI</th>{snapshot.forecast.ppiRange80 && <th scope="col">PPI 80% range</th>}</tr></thead><tbody><tr><th scope="row">{target}</th><td>{pct(snapshot.forecast.cpi)}</td>{snapshot.forecast.cpiRange80 && <td>{range(snapshot.forecast.cpiRange80)}</td>}<td>{pct(snapshot.forecast.ppi)}</td>{snapshot.forecast.ppiRange80 && <td>{range(snapshot.forecast.ppiRange80)}</td>}</tr></tbody></table></div>
    </section>

    <section className="macro-panel macro-irf" aria-labelledby="macro-irf-heading"><div className="macro-panel-heading"><div><h2 id="macro-irf-heading">Impulse response functions</h2><p>One standard-deviation inflation shock</p></div><label className="macro-select">Position <select value={activeTicker} onChange={event => setSelected(event.target.value)}>{modeled.map(position => <option key={position.ticker} value={position.ticker}>{position.ticker}</option>)}</select></label></div>
      {active?.cpi && active.ppi && <div className="macro-irf-grid"><figure><figcaption><span className="macro-key macro-cpi-key" />CPI response</figcaption><ResponseChart response={active.cpi} label={`${activeTicker} CPI`} color="#1768c3" /></figure><figure><figcaption><span className="macro-key macro-ppi-key" />PPI response</figcaption><ResponseChart response={active.ppi} label={`${activeTicker} PPI`} color="#db8420" /></figure></div>}
    </section>

    <section className="macro-panel macro-positions" aria-labelledby="macro-positions-heading"><div className="macro-panel-heading"><h2 id="macro-positions-heading">Position responses</h2><span>{modeled.length} of {positions.length} positions modeled</span></div>
      <div className="macro-table-wrap" role="region" tabIndex={0} aria-label="Scrollable position responses"><table><thead><tr><th scope="col">Ticker</th><th scope="col">Position</th><th scope="col">CPI shock</th><th scope="col">PPI shock</th><th scope="col">Status</th></tr></thead><tbody>{positions.map(position => {
        const result = position.result;
        const available = !!result?.cpi && !!result.ppi;
        return <tr key={position.ticker} className={activeTicker === position.ticker ? 'is-selected' : ''}><th scope="row">{available ? <button type="button" onClick={() => { setSelected(position.ticker); document.getElementById('macro-irf-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} aria-label={`Show ${position.ticker} impulse response charts`}>{position.ticker}</button> : position.ticker}</th><td className="macro-position-name" title={position.name}>{position.name}</td><td className={available && result.cpi!.estimate[1] < 0 ? 'macro-negative' : ''}>{available ? responseAt(result.cpi!, 1) : '—'}</td><td className={available && result.ppi!.estimate[1] < 0 ? 'macro-negative' : ''}>{available ? responseAt(result.ppi!, 1) : '—'}</td><td>{available ? 'Modeled' : unavailable(position)}</td></tr>;
      })}</tbody></table></div>
      <p className="macro-table-note">IRF holdings: {snapshot.holdingsAsOf} · current holdings: {portfolio.holdingsAsOfDate}</p>
    </section>
  </div></div>;
}
