import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

const applicationEndpoint = 'https://formsubmit.co/ajax/robertbishoptn@gmail.com';

export function ApplyPage() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const busy = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    busy.current = true;
    setStatus('sending');
    setError('');
    try {
      const response = await fetch(applicationEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          ...fields,
          _subject: `CBF application: ${fields.first_name} ${fields.last_name}`,
          _replyto: fields.etsu_email,
          _cc: 'murrayriley5@gmail.com',
        }),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok || (result.success !== true && result.success !== 'true')) throw new Error('Your application could not be sent. Please try again or contact us directly.');
      setStatus('sent');
      form.reset();
    } catch (reason) {
      setError(reason instanceof Error && reason.name === 'Error' ? reason.message : 'We could not confirm your application was sent. Please try again or contact us directly.');
      setStatus('error');
    } finally { busy.current = false; }
  }

  return <div className="apply-page content-width">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Apply</span></nav>
    <h1>Apply to the fund</h1>
    <div className="contact-grid">
      <aside className="contact-details apply-details">
        <h2>Join Citizens Bank Fund</h2>
        <p>Our student managed fund gives ETSU students the chance to research markets, discuss investment ideas, and contribute to a real portfolio.</p>
        <p>Membership is selective. We look for curiosity, commitment, and a willingness to learn and work with a team. You do not need to have a preferred team before applying.</p>
        <p>Tell us a little about yourself. Fund leadership will review your application and follow up by email.</p>
      </aside>
      <div className="contact-form-panel">
        {status === 'sent' ? <div className="contact-success" role="status"><span className="contact-check" aria-hidden="true">✓</span><h2>Application sent</h2><p>Thank you for your interest in Citizens Bank Fund. We’ll follow up by email.</p><button className="button" onClick={() => setStatus('idle')}>Submit another application</button></div> :
          <form onSubmit={submit} aria-label="Fund application" aria-busy={status === 'sending'}>
            <h2>Application form</h2>
            <fieldset disabled={status === 'sending'}>
              <div className="contact-field-row">
                <div className="contact-field"><label htmlFor="apply-first-name">First name</label><input id="apply-first-name" name="first_name" autoComplete="given-name" required maxLength={60} /></div>
                <div className="contact-field"><label htmlFor="apply-last-name">Last name</label><input id="apply-last-name" name="last_name" autoComplete="family-name" required maxLength={60} /></div>
              </div>
              <div className="contact-field-row">
                <div className="contact-field"><label htmlFor="apply-e-number">ETSU E Number</label><input id="apply-e-number" name="etsu_e_number" autoComplete="off" required maxLength={20} /></div>
                <div className="contact-field"><label htmlFor="apply-phone">Phone number</label><input id="apply-phone" name="phone" type="tel" autoComplete="tel" required maxLength={30} /></div>
              </div>
              <div className="contact-field-row">
                <div className="contact-field"><label htmlFor="apply-etsu-email">ETSU email</label><input id="apply-etsu-email" name="etsu_email" type="email" autoComplete="email" required maxLength={254} /></div>
                <div className="contact-field"><label htmlFor="apply-personal-email">Personal email</label><input id="apply-personal-email" name="personal_email" type="email" required maxLength={254} /></div>
              </div>
              <div className="contact-field-row">
                <div className="contact-field"><label htmlFor="apply-major">Major</label><input id="apply-major" name="major" required maxLength={100} /></div>
                <div className="contact-field"><label htmlFor="apply-year">Year in school</label><select id="apply-year" name="year_in_school" required defaultValue=""><option value="" disabled>Select your year</option><option>First year</option><option>Sophomore</option><option>Junior</option><option>Senior</option><option>Graduate student</option></select></div>
              </div>
              <div className="contact-field"><label htmlFor="apply-team">Desired team</label><select id="apply-team" name="desired_team" required defaultValue=""><option value="" disabled>Select an option</option><option>No preference yet</option><option>Macroeconomics</option><option>Equities</option><option>Fixed Income</option><option>FX &amp; Commodities</option></select></div>
              <div className="contact-trap" aria-hidden="true"><label htmlFor="apply-honey">Website</label><input id="apply-honey" name="_honey" tabIndex={-1} autoComplete="off" /></div>
              <p className="apply-form-note">Your application is emailed to fund leadership. Please double-check your information before sending.</p>
              {status === 'error' && <p className="contact-error" role="alert">{error}</p>}
              <button className="button contact-submit" type="submit">{status === 'sending' ? 'Sending…' : 'Send application'}<span aria-hidden="true">→</span></button>
            </fieldset>
          </form>}
      </div>
    </div>
  </div>;
}
