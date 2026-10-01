import type { ClusterAnalysis } from '../lib/portfolio/display';

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
function heatColor(value: number) {
  const start = value < 0 ? [187, 85, 80] : [245, 245, 242];
  const end = value < 0 ? [245, 245, 242] : [23, 107, 140];
  const weight = value < 0 ? value + 1 : value;
  return `rgb(${start.map((channel, index) => Math.round(channel + (end[index] - channel) * weight)).join(',')})`;
}

function Hierarchy({ analysis }: { analysis: ClusterAnalysis }) {
  const { branches, leafOrder, symbols } = analysis;
  const max = Math.max(...branches.flatMap(branch => branch.x));
  const height = Math.max(340, leafOrder.length * 22);
  const x = (value: number) => 20 + (1 - value / (max || 1)) * 350;
  const y = (value: number) => 12 + value / (leafOrder.length * 10) * (height - 24);
  return <div className="pf-analysis-scroll" role="region" aria-label="Scrollable holdings hierarchy" tabIndex={0}><svg className="pf-hierarchy" viewBox={`0 0 470 ${height}`} role="img" aria-label="Hierarchy of current holdings by return correlation">
    {branches.map((branch, index) => <path key={index} d={`M${x(branch.x[0])} ${y(branch.y[0])} L${x(branch.x[1])} ${y(branch.y[1])} L${x(branch.x[2])} ${y(branch.y[2])} L${x(branch.x[3])} ${y(branch.y[3])}`} fill="none" stroke="#24789d" strokeWidth="1.7" />)}
    {leafOrder.map((index, order) => <text key={index} x="380" y={y(5 + order * 10) + 4} className="pf-analysis-label">{symbols[index]}</text>)}
  </svg></div>;
}

function Heatmap({ analysis }: { analysis: ClusterAnalysis }) {
  const { correlation, leafOrder, symbols } = analysis;
  const cell = 22, offset = 63, size = offset + leafOrder.length * cell + 10;
  return <div className="pf-analysis-scroll" role="region" aria-label="Scrollable correlation matrix" tabIndex={0}><svg className="pf-heatmap" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Correlation matrix for current holdings, ordered by hierarchy">
    {leafOrder.map((row, i) => <g key={row}>
      <text x={offset - 7} y={offset + i * cell + 15} textAnchor="end" className="pf-analysis-label">{symbols[row]}</text>
      <text x={offset + i * cell + 8} y={offset - 7} transform={`rotate(-55 ${offset + i * cell + 8} ${offset - 7})`} className="pf-analysis-label">{symbols[row]}</text>
      {leafOrder.map((column, j) => <rect key={column} x={offset + j * cell} y={offset + i * cell} width={cell} height={cell} fill={heatColor(clamp(correlation[row][column], -1, 1))} stroke="#fff" strokeWidth=".8"><title>{symbols[row]} / {symbols[column]}: {correlation[row][column].toFixed(2)}</title></rect>)}
    </g>)}
  </svg></div>;
}

function PcaFigure({ analysis }: { analysis: ClusterAnalysis }) {
  const signature = JSON.stringify(analysis);
  let hash = 2166136261;
  for (let index = 0; index < signature.length; index++) hash = Math.imul(hash ^ signature.charCodeAt(index), 16777619);
  const version = `inter-2-${analysis.endDate}-${(hash >>> 0).toString(16)}`;
  return <div className="pf-pca-figure" role="region" aria-label="Scrollable PCA charts" tabIndex={0}>
    <img src={`${import.meta.env.BASE_URL}assets/portfolio/pca-clusters.svg?v=${version}`} alt={`Static 2D and 3D PCA scatter plots of ${analysis.symbols.length} current holdings, with ticker labels and PC axes`} loading="lazy" />
  </div>;
}

export function PortfolioClusterAnalysis({ analysis }: { analysis: ClusterAnalysis | null }) {
  if (!analysis) return <p className="pf-analysis-unavailable">Analysis is unavailable for the current holdings.</p>;
  const dates = `${analysis.startDate} to ${analysis.endDate}`;
  return <>
    <p className="pf-analysis-intro">{analysis.symbols.length} holdings · {dates}</p>
    <div className="pf-analysis-grid">
      <div className="pf-analysis-card"><h3>Hierarchy</h3><Hierarchy analysis={analysis} /></div>
      <div className="pf-analysis-card"><h3>Correlation</h3><Heatmap analysis={analysis} /><div className="pf-heat-key"><span>−1</span><i /><span>0</span><i /><span>+1</span></div></div>
      <div className="pf-analysis-card pf-pca-card"><PcaFigure analysis={analysis} /></div>
    </div>
  </>;
}
