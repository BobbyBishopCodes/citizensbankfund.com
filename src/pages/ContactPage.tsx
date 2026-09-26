import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

const contactEndpoint = 'https://formsubmit.co/ajax/robertbishoptn@gmail.com';

export function ContactPage() {
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
      const response = await fetch(contactEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...fields, _subject: `CBF contact: ${fields.subject}`, _replyto: fields.email, _cc: 'murrayriley5@gmail.com' }),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok || (result.success !== true && result.success !== 'true')) throw new Error('Your message could not be sent. Please try again or email us directly.');
      setStatus('sent');
      form.reset();
    } catch (reason) {
      setError(reason instanceof Error && reason.name === 'Error' ? reason.message : 'We could not confirm your message was sent. Please try again or email us directly.');
      setStatus('error');
    } finally { busy.current = false; }
  }

  return <div className="contact-page content-width">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Contact</span></nav>
    <h1>Contact</h1>
    <div className="contact-grid">
      <aside className="contact-details">
        <h2>Citizen’s Bank Fund</h2>
        <p>East Tennessee State University<br />Johnson City, Tennessee</p>
        <h3>Email</h3>
        <a href="mailto:robertbishoptn@gmail.com">robertbishoptn@gmail.com</a>
      </aside>
      <div className="contact-form-panel">
        {status === 'sent' ? <div className="contact-success" role="status"><span className="contact-check" aria-hidden="true">✓</span><h2>Message sent</h2><p>Thank you for contacting Citizen’s Bank Fund.</p><button className="button" onClick={() => setStatus('idle')}>Send another message</button></div> :
          <form onSubmit={submit} aria-label="Contact form" aria-busy={status === 'sending'}>
            <h2>Send a message</h2>
            <fieldset disabled={status === 'sending'}>
              <div className="contact-field-row">
                <div className="contact-field"><label htmlFor="contact-name">Name</label><input id="contact-name" name="name" autoComplete="name" required minLength={2} maxLength={100} /></div>
                <div className="contact-field"><label htmlFor="contact-email">Email</label><input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={254} /></div>
              </div>
              <div className="contact-field"><label htmlFor="contact-subject">Subject</label><input id="contact-subject" name="subject" required minLength={3} maxLength={150} /></div>
              <div className="contact-field"><label htmlFor="contact-message">Message</label><textarea id="contact-message" name="message" required minLength={10} maxLength={5000} rows={7} /></div>
              <div className="contact-trap" aria-hidden="true"><label htmlFor="contact-honey">Website</label><input id="contact-honey" name="_honey" tabIndex={-1} autoComplete="off" /></div>
              {status === 'error' && <p className="contact-error" role="alert">{error}</p>}
              <button className="button contact-submit" type="submit">{status === 'sending' ? 'Sending…' : 'Send message'}<span aria-hidden="true">→</span></button>
            </fieldset>
          </form>}
      </div>
    </div>
  </div>;
}
