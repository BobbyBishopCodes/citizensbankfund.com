import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { articles } from '../data/content';

export function RouteEffects() {
  const { pathname: rawPathname, hash } = useLocation();
  const pathname = rawPathname.replace(/\/+$/, '') || '/';

  useLayoutEffect(() => {
    const article = articles.find(item => pathname === `/blog/${item.id}`);
    const title = pathname === '/' ? 'East Tennessee State University' : pathname === '/blog' ? 'Blog' : pathname === '/contact' ? 'Contact' : pathname === '/fund-history' ? 'Fund History' : pathname === '/scholarships' ? 'Scholarships' : pathname === '/leadership' ? 'Leadership' : pathname === '/legacy' ? 'Legacy' : pathname === '/partnerships' ? 'Partnerships' : pathname === '/members' ? 'Members' : pathname === '/portfolio' ? 'Portfolio' : article?.title ?? 'Page not found';
    document.title = `${title} | Citizen’s Bank Fund`;
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
