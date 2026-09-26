import { useRef, useState } from 'react';
import { articles, type Article } from '../data/content';

export function NewsCarousel({ onArticle }: { onArticle: (article: Article) => void }) {
  const [selected, setCurrent] = useState(() => Math.max(0, articles.findIndex(article => article.featured)));
  const current = Math.min(selected, Math.max(0, articles.length - 1));
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const previous = (current - 1 + articles.length) % articles.length;
  const next = (current + 1) % articles.length;
  const change = (direction: number) => setCurrent(value => (value + direction + articles.length) % articles.length);

  if (!articles.length) return null;

  return (
    <section className="news-carousel" aria-label="Featured research" aria-roledescription="carousel" onKeyDown={event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); change(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); change(1); }
    }}>
      <div className={`carousel-stage${articles.length === 1 ? ' carousel-single' : ''}`} onTouchStart={event => {
        swiped.current = false;
        const touch = event.touches[0]; touchStart.current = { x: touch.clientX, y: touch.clientY };
      }} onTouchEnd={event => {
        if (!touchStart.current) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - touchStart.current.x;
        const dy = touch.clientY - touchStart.current.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped.current = true; change(dx < 0 ? 1 : -1); }
        touchStart.current = null;
      }}>
        {[previous, current, next].map((articleIndex, position) => {
          if (articles.length === 1 && position !== 1) return null;
          const article = articles[articleIndex];
          return <button key={position} className={`news-slide ${position === 1 ? 'news-slide-featured' : 'news-slide-side'}`} onClick={() => { if (swiped.current) { swiped.current = false; return; } if (position === 1) onArticle(article); else setCurrent(articleIndex); }} aria-label={position === 1 ? `${article.preview ? 'Read preview' : 'Read article'}: ${article.title}` : `Show story: ${article.title}`}>
            <img key={article.image} className="news-image" src={article.image} alt="" fetchPriority={position === 1 ? 'high' : 'auto'} />
            <div className="news-shade" />
            {position === 1 && <img className="news-shield" src="/assets/branding/etsu-shield.webp" alt="East Tennessee State University" />}
            <div className="news-caption"><span className="news-category">{article.category}</span><h2>{article.title}</h2>{position === 1 && <span className="news-read">Explore this story <span aria-hidden="true">→</span></span>}</div>
          </button>;
        })}
        {articles.length > 1 && <><button className="carousel-arrow carousel-previous" aria-label="Previous story" onClick={() => change(-1)}><img src="/assets/icons/chevron-left.svg" alt="" /></button>
        <button className="carousel-arrow carousel-next" aria-label="Next story" onClick={() => change(1)}><img src="/assets/icons/chevron-right.svg" alt="" /></button></>}
      </div>
      <div className="carousel-pagination">
        <div className="carousel-dots">{articles.map((article, index) => <button key={article.id} aria-label={`Show story ${index + 1}: ${article.category}`} aria-current={index === current ? 'true' : undefined} onClick={() => setCurrent(index)}><span /></button>)}</div>
        <span className="carousel-count" aria-live="polite" aria-atomic="true">{String(current + 1).padStart(2, '0')} <span>/ {String(articles.length).padStart(2, '0')}</span></span>
      </div>
    </section>
  );
}
