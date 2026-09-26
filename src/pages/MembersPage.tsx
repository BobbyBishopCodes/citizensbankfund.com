import { Link } from 'react-router-dom';
import { MemberDistribution } from '../components/MemberDistribution';
import { memberTeams, memberShare } from '../data/membership';

export function MembersPage() {
  return <div className="members-page">
    <div className="content-width members-content">
    <div className="members-overview">
      <div className="members-introduction">
        <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Members</span></nav>
        <h1>Our Members</h1>
        <p>The Citizen’s Bank Fund gives East Tennessee State University students hands-on experience in investment research and portfolio decisions. Many of our members have gone on to work at major financial firms, building on the experience they gained here.</p>
      </div>
      <MemberDistribution />
    </div>
    <section className="members-teams" aria-labelledby="members-teams-title">
      <h2 id="members-teams-title" className="leadership-section-title">Our Teams</h2>
      <div className="member-team-grid">{memberTeams.map(team => <article className="member-team" key={team.id}>
        <h3 style={{ borderColor: team.color }}>{team.name}</h3>
        <p>{team.description}</p>
        <dl><div><dt>Members</dt><dd>{team.count}</dd></div><div><dt>of total</dt><dd>{memberShare(team.count)}</dd></div></dl>
      </article>)}</div>
    </section>
    </div>
    <section className="member-verification" aria-labelledby="member-verification-title">
      <div className="content-width member-verification-inner">
        <div>
          <h2 id="member-verification-title">Need to verify a member’s involvement?</h2>
          <p>Look for the fund on their LinkedIn, or contact us and we’ll confirm their time with CBF.</p>
        </div>
        <Link className="member-verification-link" to="/contact">Contact us</Link>
      </div>
    </section>
  </div>;
}
