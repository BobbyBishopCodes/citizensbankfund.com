import { lazy, Suspense, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { Footer } from './components/Footer';
import { Modal } from './components/Modal';
import { RouteEffects } from './components/RouteEffects';
import { HomePage } from './pages/HomePage';
import { BlogPage } from './pages/BlogPage';
import { ArticlePage } from './pages/ArticlePage';
import { NotFoundPage } from './pages/NotFoundPage';
const ContactPage = lazy(() => import('./pages/ContactPage').then(module => ({ default: module.ContactPage })));
import { ApplyPage } from './pages/ApplyPage';
import { ScholarshipsPage } from './pages/ScholarshipsPage';
import { LeadershipPage } from './pages/LeadershipPage';
import { LegacyPage } from './pages/LegacyPage';
import { FundHistoryPage } from './pages/FundHistoryPage';
import { PartnershipsPage } from './pages/PartnershipsPage';
import { InvestorsPage } from './pages/InvestorsPage';
const MembersPage = lazy(() => import('./pages/MembersPage').then(module => ({ default: module.MembersPage })));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage').then(module => ({ default: module.PortfolioPage })));
import { information, type InformationKey } from './data/content';

export function App() {
  const [informationKey, setInformationKey] = useState<InformationKey | null>(null);
  const info = informationKey ? information[informationKey] : null;

  return (
    <>
      <RouteEffects />
      <a className="skip-link" href="#main">Skip to content</a>
      <Header />
      <Navigation onInformation={setInformationKey} />
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/portfolio" element={<Suspense fallback={<div className="content-width section-space" role="status">Loading portfolio…</div>}><PortfolioPage /></Suspense>} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:slug" element={<ArticlePage />} />
          <Route path="/contact" element={<Suspense fallback={<div className="content-width section-space" role="status">Loading contact…</div>}><ContactPage /></Suspense>} />
          <Route path="/apply" element={<ApplyPage />} />
          <Route path="/scholarships" element={<ScholarshipsPage />} />
          <Route path="/leadership" element={<LeadershipPage />} />
          <Route path="/legacy" element={<LegacyPage />} />
          <Route path="/fund-history" element={<FundHistoryPage />} />
          <Route path="/partnerships" element={<PartnershipsPage />} />
          <Route path="/investors" element={<InvestorsPage />} />
          <Route path="/members" element={<Suspense fallback={<div className="content-width section-space" role="status">Loading members…</div>}><MembersPage /></Suspense>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
      {info && <Modal title={info.title} onClose={() => setInformationKey(null)}>{info.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}{info.link && (info.link.href.startsWith('/') ? <Link className="button" to={info.link.href} onClick={() => setInformationKey(null)}>{info.link.label}<span aria-hidden="true">→</span></Link> : <a className="button" href={info.link.href} target="_blank" rel="noreferrer">{info.link.label}<span aria-hidden="true">↗</span></a>)}</Modal>}
    </>
  );
}
