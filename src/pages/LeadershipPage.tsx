import { Link } from 'react-router-dom';
import { leadership } from '../data/leadership';

export function LeadershipPage() {
  let position = 0;
  return <div className="leadership-page">
    <div className="content-width">
      <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Leadership</span></nav>
      <h1>Our Leadership</h1>
      {leadership.map(group => <section className="leadership-group" key={group.id} aria-labelledby={group.id}>
        <h2 className="leadership-section-title" id={group.id}>{group.title}</h2>
        <div className="leadership-list">{group.members.map(member => {
          const reverse = position++ % 2 === 1;
          return <article className={`leader-row${reverse ? ' leader-row-reverse' : ''}`} key={member.name}>
            {member.photo ? <div className="leader-portrait leader-photo-frame"><img className={member.name === 'Riley Murray' ? 'leader-photo-riley' : undefined} src={member.photo} alt={member.name} width="180" height="190" loading="lazy" /></div> : <div className="leader-portrait leader-initials" aria-hidden="true">{member.name.split(' ').map(part => part[0]).join('')}</div>}
            <div className="leader-details">
              <div className="leader-heading">
                <h3>{member.name}</h3>
                <a className="leader-linkedin" href={member.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${member.name} on LinkedIn (opens in a new tab)`}>
                  <img src="/assets/icons/linkedin-navy.svg" alt="" width="16" height="16" />
                </a>
              </div>
              <p className="leader-role">{member.role}</p>
              <span className="leader-accent" aria-hidden="true" />
              <p className="leader-biography">{member.biography}</p>
            </div>
          </article>;
        })}</div>
      </section>)}
    </div>
  </div>;
}
