import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return <div className="not-found content-width"><h1>Page not found</h1><Link className="button" to="/reports">Browse reports<span aria-hidden="true">→</span></Link></div>;
}
