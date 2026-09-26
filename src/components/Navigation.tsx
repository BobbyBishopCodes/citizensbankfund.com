import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { InformationKey } from '../data/content';

const sections = ['home', 'information', 'portfolio', 'members', 'blog', 'contact'];
const links = [ ['portfolio', 'Portfolio'], ['members', 'Members'], ['blog', 'Blog'], ['contact', 'Contact'] ];

export function Navigation({ onInformation }: { onInformation: (key: InformationKey) => void }) {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  const isHome = pathname === '/';
  const isBlog = pathname === '/blog' || pathname.startsWith('/blog/');
  const [active, setActive] = useState('home');
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = pathname === '/portfolio' ? 'portfolio' : pathname === '/members' ? 'members' : ['/fund-history', '/scholarships', '/leadership', '/legacy', '/partnerships'].includes(pathname) ? 'information' : pathname === '/contact' ? 'contact' : isBlog ? 'blog' : isHome ? active : '';
  const highlighted = open ? 'information' : current;

  useEffect(() => {
    if (!isHome) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = 'home';
      const threshold = (navRef.current?.offsetHeight ?? 64) + 120;
      for (const id of sections) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= threshold) current = id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) current = 'contact';
      setActive(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, [isHome]);

  useEffect(() => {
    if (!open && !mobileOpen) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!dropdownRef.current?.contains(target)) setOpen(false);
      if (!navRef.current?.contains(target)) setMobileOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open, mobileOpen]);

  function close() { setOpen(false); setMobileOpen(false); }
  function showInformation(key: InformationKey) { close(); onInformation(key); }
  function onDropdownKey(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = dropdownRef.current?.querySelectorAll<HTMLElement>('.dropdown a, .dropdown button');
      if (!items?.length) return;
      if (!open) {
        setOpen(true);
        requestAnimationFrame(() => items[event.key === 'ArrowUp' ? items.length - 1 : 0].focus());
      } else {
        const index = Array.from(items).indexOf(document.activeElement as HTMLElement);
        const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
        items[next].focus();
      }
    }
  }

  return (
    <nav className="navigation" ref={navRef} aria-label="Main navigation" onKeyDown={event => {
      if (event.key === 'Escape') { close(); navRef.current?.querySelector<HTMLButtonElement>('.mobile-menu-button')?.focus(); }
    }}>
      <div className="nav-inner">
        <Link className={`nav-home ${highlighted === 'home' ? 'is-active' : ''}`} to="/#home" aria-label="Home" aria-current={current === 'home' ? 'location' : undefined} onClick={close}><img src="/assets/icons/home.svg" alt="" /></Link>
        <button className="mobile-menu-button" aria-expanded={mobileOpen} aria-controls="navigation-links" onClick={() => setMobileOpen(value => !value)}>
          <span>{mobileOpen ? 'Close' : 'Menu'}</span><span className={`menu-lines ${mobileOpen ? 'is-open' : ''}`} aria-hidden="true"><i /><i /><i /></span>
        </button>
        <div className={`nav-links ${mobileOpen ? 'is-open' : ''}`} id="navigation-links">
          <div className="information-nav" ref={dropdownRef} onKeyDown={onDropdownKey} onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
          }}>
            <button ref={triggerRef} className={`nav-link ${highlighted === 'information' ? 'is-active' : ''}`} aria-expanded={open} aria-current={current === 'information' ? 'location' : undefined} aria-controls="information-dropdown" onClick={() => setOpen(value => !value)}>
              Information<img className={`dropdown-chevron ${open ? 'is-open' : ''}`} src="/assets/icons/chevron-down.svg" alt="" />
            </button>
            <div className={`dropdown ${open ? 'is-open' : ''}`} id="information-dropdown" inert={!open}>
              <Link to="/fund-history" aria-current={pathname === '/fund-history' ? 'page' : undefined} onClick={close}>Fund History<span aria-hidden="true">→</span></Link>
              <Link to="/leadership" aria-current={pathname === '/leadership' ? 'page' : undefined} onClick={close}>Leadership<span aria-hidden="true">→</span></Link>
              <Link to="/legacy" aria-current={pathname === '/legacy' ? 'page' : undefined} onClick={close}>Legacy<span aria-hidden="true">→</span></Link>
              <button onClick={() => showInformation('achievements')}>Achievements<span aria-hidden="true">→</span></button>
              <Link to="/partnerships" aria-current={pathname === '/partnerships' ? 'page' : undefined} onClick={close}>Partnerships<span aria-hidden="true">→</span></Link>
              <Link to="/scholarships" aria-current={pathname === '/scholarships' ? 'page' : undefined} onClick={close}>Scholarships<span aria-hidden="true">→</span></Link>
            </div>
          </div>
          {links.map(([id, label]) => <Link key={id} className={`nav-link ${highlighted === id ? 'is-active' : ''}`} to={`/${id}`} aria-current={current === id ? (!isHome ? 'page' : 'location') : undefined} onClick={close}>{label}</Link>)}
        </div>
      </div>
    </nav>
  );
}
