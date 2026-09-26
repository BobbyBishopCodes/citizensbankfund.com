import { Link, useSearchParams } from 'react-router-dom';
import { ArticleCard } from '../components/ArticleCard';
import { articles } from '../data/content';

const categories = Array.from(new Set(articles.map(article => article.category)));

export function BlogPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const requestedCategory = params.get('category') ?? '';
  const category = categories.includes(requestedCategory) ? requestedCategory : '';
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = articles.filter(article => {
    const searchable = `${article.title} ${article.summary} ${article.category} ${article.author ?? ''} ${article.body}`.toLowerCase();
    return (!category || article.category === category) && words.every(word => searchable.includes(word));
  });
  const featured = !category && !words.length ? articles.find(article => article.featured) ?? articles[0] : undefined;
  const remaining = filtered.filter(article => article.id !== featured?.id);

  function setFilter(key: string, value: string, replace = false) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace, preventScrollReset: true });
  }

  return (
    <div className="blog-page content-width">
      <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Blog</span></nav>
      <div className="blog-heading">
        <h1>Blog</h1>
        <div className="blog-search" role="search" aria-label="Blog search">
          <label className="sr-only" htmlFor="blog-search">Search articles</label>
          <input id="blog-search" type="search" placeholder="Search articles" value={query} onChange={event => setFilter('q', event.target.value, true)} maxLength={150} />
          <span className="blog-search-icon" aria-hidden="true"><img src="/assets/icons/search.svg" alt="" /></span>
        </div>
      </div>
      <div className="blog-toolbar">
        <div className="category-filters" role="group" aria-label="Filter by category">
          <button aria-pressed={!category} onClick={() => setFilter('category', '')}>All posts</button>
          {categories.map(item => <button key={item} aria-pressed={category === item} onClick={() => setFilter('category', item)}>{item}</button>)}
        </div>
        <p className="blog-result-count" role="status">{filtered.length} {filtered.length === 1 ? 'article' : 'articles'}</p>
      </div>

      {featured && <article className="featured-article">
        <Link to={`/blog/${featured.id}`} state={{ blogSearch: '' }}>
          <div className="featured-article-image"><img src={featured.image} alt={featured.imageAlt} width="800" height="533" fetchPriority="high" /></div>
          <div className="featured-article-copy"><span className="research-category">{featured.category}</span><h2>{featured.title}</h2><p className="article-summary">{featured.summary}</p><span className="text-link">{featured.preview ? 'Read preview' : 'Read article'} <span aria-hidden="true">→</span></span></div>
        </Link>
      </article>}

      {remaining.length > 0 && <div className="blog-grid">{remaining.map(article => <ArticleCard key={article.id} article={article} showSummary headingLevel={2} />)}</div>}
      {filtered.length === 0 && <div className="blog-empty"><h2>No articles found</h2><button className="button" onClick={() => setParams({})}>Clear filters</button></div>}
    </div>
  );
}
