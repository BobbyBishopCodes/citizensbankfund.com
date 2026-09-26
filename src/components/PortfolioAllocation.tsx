import { useEffect, useRef } from 'react';
import { Chart, DoughnutController, ArcElement, Tooltip } from 'chart.js';
import { money, percent, type PortfolioData } from '../lib/portfolio/display';

Chart.register(DoughnutController, ArcElement, Tooltip);
const labels = { stock: 'Individual stocks', fund: 'Funds', cash: 'Cash' };
const colors = { stock: '#173e73', fund: '#528bca', cash: '#d0a263' };

export function PortfolioAllocation({ data }: { data: PortfolioData }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const chart = new Chart(canvas.current!, {
      type: 'doughnut',
      data: { labels: data.allocations.map(group => labels[group.assetType]), datasets: [{ data: data.allocations.map(group => group.marketValueCents), backgroundColor: data.allocations.map(group => colors[group.assetType]), borderColor: '#fff', borderWidth: 2, hoverOffset: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, cutout: '65%', plugins: { tooltip: { callbacks: { label: context => ` ${money(Number(context.raw))}` } } } },
    });
    return () => chart.destroy();
  }, [data]);
  return <section className="pf-panel pf-allocation" aria-labelledby="allocation-heading">
    <h2 id="allocation-heading">Portfolio Allocation</h2>
    <div className="pf-allocation-body">
      <div className="pf-donut"><canvas ref={canvas} role="img" aria-label={`Allocation: ${data.allocations.map(group => `${labels[group.assetType]} ${percent(group.weightRatio)}`).join(', ')}`} /><div className="pf-donut-label"><strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(data.summary.marketValueCents / 100)}</strong><span>Total value</span></div></div>
      <ul className="pf-legend">{data.allocations.map(group => <li key={group.assetType}><span className="pf-swatch" style={{ backgroundColor: colors[group.assetType] }} aria-hidden="true" /><span>{labels[group.assetType]}</span><strong>{percent(group.weightRatio)}</strong></li>)}</ul>
    </div>
    <p className="pf-panel-note">Funds include equity, bond, and commodity exposure.</p>
  </section>;
}
