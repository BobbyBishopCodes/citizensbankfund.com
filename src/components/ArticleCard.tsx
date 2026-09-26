import { Link, useLocation } from 'react-router-dom';
import type { Article } from '../data/content';

export function ArticleCard({ article, showSummary = false, headingLevel = 3 }: { article: Article; showSummary?: boolean; headingLevel?: 2 | 3 }) {
  const location = useLocation();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <article className="research-card">
      <Link className="research-card-link" to={`/blog/${article.id}`} state={{ blogSearch: location.pathname === '/blog' ? location.search : '' }}>
        <div className="research-image"><img src={article.image} alt={article.imageAlt} loading="lazy" width="480" height="280" /></div>
        <div className="research-card-body">
          <span className="research-category">{article.category}</span>
          <Heading className="research-card-title">{article.title}</Heading>
          {showSummary && <p className="article-summary">{article.summary}</p>}
          <span className="text-link">{article.preview ? 'Read preview' : 'Read article'} <span aria-hidden="true">→</span></span>
        </div>
      </Link>
    </article>
  );
}
