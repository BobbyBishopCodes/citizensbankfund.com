import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { articles } from '../data/content';
import { application } from '../data/application';

export function RouteEffects() {
  const { pathname: rawPathname, hash } = useLocation();
  const pathname = rawPathname.replace(/\/+$/, '') || '/';

  useLayoutEffect(() => {
    const article = articles.find(item => pathname === `/blog/${item.id}`);
    const title = pathname === '/' ? 'East Tennessee State University' : pathname === '/blog' ? 'Blog' : pathname === '/contact' ? 'Contact' : pathname === '/apply' ? 'Apply' : pathname === '/fund-history' ? 'Fund History' : pathname === '/scholarships' ? 'Scholarships' : pathname === '/leadership' ? 'Leadership' : pathname === '/legacy' ? 'Legacy' : pathname === '/partnerships' ? 'Partnerships' : pathname === '/investors' ? 'Investors' : pathname === '/members' ? 'Members' : pathname === '/portfolio' ? 'Portfolio' : article?.title ?? 'Page not found';
    document.title = pathname === '/apply' ? application.title : `${title} | Citizens Bank Fund`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', pathname === '/apply'
      ? application.description
      : 'Meet the Citizens Bank Fund at East Tennessee State University. Student-led research, investment analysis, and real-world experience.');
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (pathname === '/apply') {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
      }
      canonical.href = application.canonical;
    } else canonical?.remove();
    const frame = requestAnimationFrame(() => {
      const target = hash ? document.getElementById(hash.slice(1)) : null;
      if (target) target.scrollIntoView({ behavior: 'instant' });
      else window.scrollTo({ top: 0, behavior: 'instant' });
      (target ?? document.getElementById('main'))?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash]);

  return null;
}
