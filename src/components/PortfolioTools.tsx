import { useEffect, useRef, useState, type FormEvent } from 'react';
import { money, signedMoney, dateLabel, type PortfolioData } from '../lib/portfolio/display';
import { modelViewMonths, modelAssetClasses, modelClassLabel, validateBlackLittermanResult, type ModelAssetClass, type BlackLittermanResult } from '../lib/portfolio/black-litterman';
import './portfolio-tools.css';
import { prepareTickerAnalysis } from '../lib/portfolio/ticker-data';

type ToolInputs = { ticker: string; targetPrice: string; confidence: string; assetClass: ModelAssetClass | '' };
type CompletedModel = { inputs: ToolInputs; model: BlackLittermanResult; data: PortfolioData; annualYield: number | null };
const weightLabel = (weight: number) => `${(weight * 100).toFixed(2)}%`;

function ModelResults({ result, onEdit }: { result: CompletedModel; onEdit: () => void }) {
  const [exported, setExported] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const { inputs, model, data, annualYield } = result;
  const selected = model.positions.find(position => position.ticker === model.ticker)!;
  const pricing = data.blackLitterman!.assets.find(asset => asset.symbol === model.ticker)!;
  const allocations = ['Cash', ...modelAssetClasses.map(modelClassLabel)].map(assetClass => ({
    assetClass,
    current: model.positions.filter(position => position.assetClass === assetClass).reduce((sum, position) => sum + position.currentWeight, 0),
    suggested: model.positions.filter(position => position.assetClass === assetClass).reduce((sum, position) => sum + position.suggestedWeight, 0),
  }));

  function exportCsv() {
    const headers = ['Ticker', 'Asset Class', 'Current Weight', 'Suggested Weight', 'Current Value', 'Suggested Value', 'Change in USD'];
    const rows = model.positions.map(position => [
      position.ticker, position.assetClass, `${(position.currentWeight * 100).toFixed(6)}%`, `${(position.suggestedWeight * 100).toFixed(6)}%`,
      (position.currentValueCents / 100).toFixed(2), (position.suggestedValueCents / 100).toFixed(2), (position.changeCents / 100).toFixed(2),
    ]);
    const csv = [headers, ...rows].map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `cbf-black-litterman-${model.ticker}-${data.calculatedAt.slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(true);
  }

  return <div className="pf-tool-results" aria-labelledby="pf-tool-results-heading">
    <div className="pf-tool-results-heading">
      <h3 id="pf-tool-results-heading" tabIndex={-1} ref={heading}>CBF Modified Black Litterman test</h3>
      <button type="button" className="pf-tool-button pf-tool-secondary" onClick={exportCsv}>Export CSV <span aria-hidden="true">↓</span></button>
    </div>
    <div className="pf-tool-scenario"><span><strong>{model.ticker}</strong> · {model.assetClass}</span><span>Target {money(Number(inputs.targetPrice) * 100)}</span><span>{modelViewMonths} months</span><span>{annualYield === null ? 'Yield unavailable' : `${weightLabel(annualYield)} annual yield`}</span><span>{inputs.confidence}% confidence</span><button type="button" className="pf-tool-edit" onClick={onEdit}>Edit Inputs</button></div>
    <p className="sr-only" role="status">{exported ? 'Model CSV downloaded.' : 'Black Litterman calculation complete.'}</p>
    <div className="pf-tool-results-grid">
      <section className="pf-tool-card pf-tool-allocation" aria-labelledby="pf-tool-allocation-heading">
        <div className="pf-tool-chart-heading"><h4 id="pf-tool-allocation-heading">Asset-class Allocation</h4><div className="pf-tool-chart-key"><span><i />Current</span><span><i />Suggested</span></div></div>
        <p className="pf-tool-caption">Portfolio weight · cash included</p>
        <div className="pf-tool-bars">{allocations.map(allocation => <div className="pf-tool-bar-group" key={allocation.assetClass}>
          <strong>{allocation.assetClass}</strong>
          <div className="pf-tool-bar-pair">
            <div className="pf-tool-bar-row"><span className="sr-only">Current {allocation.assetClass} allocation</span><div className="pf-tool-bar-track" aria-hidden="true"><span style={{ width: `${allocation.current * 100}%` }} /></div><span>{weightLabel(allocation.current)}</span></div>
            <div className="pf-tool-bar-row pf-tool-bar-suggested"><span className="sr-only">Suggested {allocation.assetClass} allocation</span><div className="pf-tool-bar-track" aria-hidden="true"><span style={{ width: `${allocation.suggested * 100}%` }} /></div><span>{weightLabel(allocation.suggested)}</span></div>
          </div>
        </div>)}</div>
        <div className="pf-tool-chart-axis" aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></div>
      </section>
      <aside className="pf-tool-card pf-tool-selected" aria-labelledby="pf-tool-selected-heading">
        <span className="pf-tool-eyebrow">Selected ticker</span><h4 id="pf-tool-selected-heading">{model.ticker}<span>{model.assetClass}</span></h4>
        <dl><div><dt>Suggested portfolio weight</dt><dd>{weightLabel(selected.suggestedWeight)}</dd></div><div><dt>Target position value</dt><dd>{money(selected.suggestedValueCents)}</dd></div><div><dt>Modeled increase / decrease</dt><dd className={selected.changeCents > 0 ? 'pf-positive' : selected.changeCents < 0 ? 'pf-negative' : undefined}>{signedMoney(selected.changeCents)}</dd></div></dl>
        <p className="pf-tool-caption">Current position {money(selected.currentValueCents)} · {weightLabel(selected.currentWeight)}</p>
        <p className="pf-tool-caption">Price {money(model.currentPrice * 100)} · {dateLabel(pricing.priceAsOf)} · {pricing.priceSource.startsWith('Yahoo') ? 'Yahoo' : pricing.priceSource}</p>
      </aside>
      <section className="pf-tool-card pf-tool-matrix" aria-labelledby="pf-tool-matrix-heading">
        <h4 id="pf-tool-matrix-heading">Position Comparison <span>Portfolio {money(model.navCents)}</span></h4>
        <div className="pf-table-wrap" role="region" aria-label="Scrollable modeled position comparison" tabIndex={0}><table>
          <caption className="sr-only">Current and suggested position weights and values, including cash. Scroll horizontally to view all columns.</caption>
          <thead><tr>{['Ticker', 'Asset Class', 'Current Weight', 'Suggested Weight', 'Current Value', 'Suggested Value', 'Change in USD'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{model.positions.map(position => <tr key={position.ticker} className={position.ticker === model.ticker ? 'pf-tool-selected-row' : undefined}><th scope="row">{position.ticker}{position.ticker === model.ticker && <span className="sr-only"> (selected ticker)</span>}</th><td>{position.assetClass}</td><td>{weightLabel(position.currentWeight)}</td><td>{weightLabel(position.suggestedWeight)}</td><td>{money(position.currentValueCents)}</td><td>{money(position.suggestedValueCents)}</td><td className={position.changeCents > 0 ? 'pf-positive' : position.changeCents < 0 ? 'pf-negative' : undefined}>{signedMoney(position.changeCents)}</td></tr>)}</tbody>
          <tfoot><tr><th scope="row">Total</th><td>All classes</td><td>100.00%</td><td>100.00%</td><td>{money(model.navCents)}</td><td>{money(model.navCents)}</td><td>{money(0)}</td></tr></tfoot>
        </table></div>
      </section>
    </div>
    <details className="pf-tool-method"><summary>Model inputs and assumptions</summary>
      <p>Algorithmic math statements, no need to really worry about this, just for review double checking stuff.</p>
      <p>Holdings {dateLabel(data.holdingsAsOfDate)} · portfolio valuation {dateLabel(data.calculatedAt)} · history through {dateLabel(data.blackLitterman!.historyAsOf)}.</p>
      <p>Eq. proxy: current weights · Rf: {weightLabel(model.riskFreeRate)} (1-year Treasury{data.blackLitterman!.riskFreeRateAsOf ? `, ${dateLabel(data.blackLitterman!.riskFreeRateAsOf)}` : ''}) · MRP: 5% · τ: 0.025 · Ann. factor: 52 · Cov. shrinkage: 10% (off-diag.)</p>
      <p>Our Current Targets: {Object.entries(data.blackLitterman!.caps).map(([assetClass, weight]) => `${assetClass} ${weightLabel(weight)}`).join(', ')}.</p>
      <p>Available annual dividend / distribution yield is added to annualized price appreciation without reinvestment. Target price excludes distributions.{annualYield === null ? ' Distribution yield was unavailable, so the model used price appreciation only.' : ''}</p>
      <p>Annualized total target return {weightLabel(model.annualizedTargetReturn)} · posterior excess return {weightLabel(model.posterior[model.positions.findIndex(position => position.ticker === model.ticker)])}.</p>
    </details>
  </div>;
}

export function PortfolioTools({ data }: { data: PortfolioData }) {
  const [open, setOpen] = useState(false);
  const [inputs, setInputs] = useState<ToolInputs>({ ticker: '', targetPrice: '', confidence: '', assetClass: '' });
  const [submitted, setSubmitted] = useState<ToolInputs | null>(null);
  const [result, setResult] = useState<CompletedModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const tickerInput = useRef<HTMLInputElement>(null);
  const knownClass = data.positions.some(position => position.assetType !== 'cash' && position.symbol === inputs.ticker.trim().toUpperCase()) ? data.blackLitterman?.assets.find(asset => asset.symbol === inputs.ticker.trim().toUpperCase())?.assetClass : undefined;
  const effectiveClass = knownClass ?? inputs.assetClass;
  const currentResult = result?.data.calculatedAt === data.calculatedAt ? result : null;

  useEffect(() => {
    if (!submitted) return;
    let worker: Worker | null = null;
    let disposed = false;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setLoading(true); setError(''); setResult(null);
    function fail(message: string) { if (!disposed) { setError(message); setLoading(false); } controller.abort(); worker?.terminate(); clearTimeout(timeout); }
    timeout = setTimeout(() => fail('The calculation timed out. Check your inputs and try again.'), 120_000);
    async function calculate() {
      try {
        const prepared = await prepareTickerAnalysis(data, { ticker: submitted!.ticker, assetClass: submitted!.assetClass as ModelAssetClass,
          targetPrice: Number(submitted!.targetPrice), months: modelViewMonths, confidence: Number(submitted!.confidence) }, { endpoint: import.meta.env.VITE_TICKER_DATA_URL, signal: controller.signal });
        if (disposed) return;
        const { request, data: modelData } = prepared;
        worker = new Worker(new URL('../lib/portfolio/black-litterman.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = event => {
          if (disposed) return;
          try {
            if (!event.data.ok) throw new Error(event.data.error || 'The calculation could not be completed.');
            const model = validateBlackLittermanResult(event.data.result, modelData, request.view.ticker);
            setResult({ inputs: { ...submitted!, assetClass: request.view.assetClass }, model, data: modelData,
              annualYield: request.view.expectedAnnualYield ?? null }); setLoading(false);
            worker?.terminate(); clearTimeout(timeout);
          } catch (cause) { fail(cause instanceof Error ? cause.message : 'Invalid calculation result.'); }
        };
        worker.onerror = () => fail('The Rust engine could not run. Reload the page and try again.');
        worker.postMessage(request);
      } catch (cause) { fail(cause instanceof Error ? cause.message : 'The calculation could not be started.'); }
    }
    void calculate();
    return () => { disposed = true; controller.abort(); worker?.terminate(); clearTimeout(timeout); };
  }, [submitted, data]);

  function updateInput(key: keyof ToolInputs, value: string) {
    setInputs(previous => ({ ...previous, [key]: value })); }
  function runModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted({ ...inputs, ticker: inputs.ticker.trim().toUpperCase(), assetClass: effectiveClass });
  }
  function editInputs() {
    setSubmitted(null); setResult(null); setError(''); setLoading(false);
    requestAnimationFrame(() => tickerInput.current?.focus());
  }

  return <section className="pf-panel pf-tools" aria-labelledby="portfolio-tools-heading">
    <div className="pf-panel-heading"><h2 id="portfolio-tools-heading">Tools</h2><button className="pf-analysis-toggle" type="button" aria-expanded={open} aria-controls="portfolio-tools-content" onClick={() => setOpen(previous => !previous)}>{open ? 'Hide Tools' : 'View Tools'}<span aria-hidden="true" /></button></div>
    <div id="portfolio-tools-content" hidden={!open}>
      {currentResult ? <ModelResults result={currentResult} onEdit={editInputs} /> : <div className="pf-tool-card pf-tool-form-card">
        <div className="pf-tool-form-heading"><h3>CBF Modified Black Litterman test</h3></div>
        <form onSubmit={runModel}>
          <div className="pf-tool-fields">
            <div className="pf-tool-field"><label htmlFor="pf-tool-ticker">Enter Ticker</label><input ref={tickerInput} id="pf-tool-ticker" name="ticker" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="e.g. MSFT" required maxLength={15} pattern="[A-Za-z][A-Za-z0-9.\-]{0,14}" title="Enter a USD-listed stock or fund ticker." value={inputs.ticker} onChange={event => updateInput('ticker', event.target.value.toUpperCase())} /></div>
            <div className="pf-tool-field"><label htmlFor="pf-tool-price">12-Month Target Price in USD</label><div className="pf-tool-input-unit"><span aria-hidden="true">$</span><input id="pf-tool-price" name="targetPrice" type="number" inputMode="decimal" placeholder="450.00" min="0.01" step="0.01" required value={inputs.targetPrice} onChange={event => updateInput('targetPrice', event.target.value)} /></div></div>
            <div className="pf-tool-field"><label htmlFor="pf-tool-horizon">Forecast Horizon</label><output id="pf-tool-horizon" className="pf-tool-fixed"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M6 8V5a4 4 0 0 1 8 0v3M5 8h10a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.5" /><path d="M10 12v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg><span>{modelViewMonths} months</span><span className="pf-tool-fixed-label">Fixed</span></output></div>
            <div className="pf-tool-field"><label htmlFor="pf-tool-confidence">Confidence</label><div className="pf-tool-input-unit pf-tool-unit-end"><input id="pf-tool-confidence" name="confidence" type="number" inputMode="decimal" placeholder="50" min="0" max="100" step="any" required value={inputs.confidence} onChange={event => updateInput('confidence', event.target.value)} /><span aria-hidden="true">%</span></div></div>
          </div>
          <fieldset className="pf-tool-classes"><legend>Asset Class</legend><div>
            {/* Future integration: known ticker classifications should override this selection. */}
            {modelAssetClasses.map(assetClass => <label key={assetClass}><input type="radio" name="assetClass" value={assetClass} required checked={effectiveClass === assetClass} disabled={!!knownClass} onChange={() => updateInput('assetClass', assetClass)} /><span>{modelClassLabel(assetClass)}</span></label>)}
          </div></fieldset>
          {loading && <p className="pf-tool-status" role="status">Calculating portfolio allocation…</p>}
          {error && <p className="pf-tool-error" role="alert">{error}</p>}
          <div className="pf-tool-form-footer">{loading && <button className="pf-tool-edit" type="button" onClick={editInputs}>Cancel</button>}<button className="pf-tool-button" type="submit" disabled={loading || !data.blackLitterman}>{loading ? 'Running…' : 'Run'} <span aria-hidden="true">→</span></button></div>
        </form>
        {!data.blackLitterman && <p className="pf-tool-error" role="status">Model history is unavailable. Wait for the next portfolio refresh.</p>}
      </div>}
    </div>
  </section>;
}
