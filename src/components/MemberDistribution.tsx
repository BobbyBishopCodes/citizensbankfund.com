import { useEffect, useRef } from 'react';
import { Chart, DoughnutController, ArcElement, Tooltip } from 'chart.js';
import { distributionTeams, memberShare, totalMembers } from '../data/membership';

Chart.register(DoughnutController, ArcElement, Tooltip);

export function MemberDistribution() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const chart = new Chart(canvas.current!, {
      type: 'doughnut',
      data: { labels: distributionTeams.map(team => team.name), datasets: [{ data: distributionTeams.map(team => team.count), backgroundColor: distributionTeams.map(team => team.color), borderWidth: 2, borderColor: '#f5f7f9', hoverOffset: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '56%', animation: false, layout: { padding: 5 }, plugins: { tooltip: { callbacks: { label: context => ` ${context.raw} members · ${memberShare(Number(context.raw))}` } } } },
      plugins: [{ id: 'percent-labels', afterDatasetsDraw(instance) {
        const ctx = instance.ctx;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.font = '600 13px Inter, Arial, sans-serif';
        instance.getDatasetMeta(0).data.forEach((element, index) => {
          if (!distributionTeams[index].count) return;
          const point = element.tooltipPosition(true);
          if (point.x !== null && point.y !== null) ctx.fillText(memberShare(distributionTeams[index].count), point.x, point.y);
        });
        ctx.restore();
      } }],
    });
    return () => chart.destroy();
  }, [distributionTeams, totalMembers]);

  return <section className="member-distribution" aria-labelledby="distribution-title">
    <h2 id="distribution-title">Member Distribution by Team</h2>
    <div className="member-distribution-body">
      <div className="member-chart"><canvas ref={canvas} role="img" aria-label={`Team distribution: ${distributionTeams.map(team => `${team.name}, ${team.count} members`).join('; ')}.`} /><div className="member-chart-total"><strong>{totalMembers}</strong><span>Total Members</span></div></div>
      <ul className="member-legend">{distributionTeams.map(team => <li key={team.id}><span className="member-swatch" style={{ background: team.color }} aria-hidden="true" /><span className="member-legend-name">{team.name}</span><span className="member-legend-value"><strong>{memberShare(team.count)}</strong><span>{team.count} members</span></span></li>)}</ul>
    </div>
  </section>;
}
