import { Link, useLocation, useParams } from 'react-router-dom';
import { articles } from '../data/content';
import { NotFoundPage } from './NotFoundPage';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ArticlePage() {
  const { slug } = useParams();
  const location = useLocation();
  const article = articles.find(item => item.id === slug);
  if (!article) return <NotFoundPage />;
  const savedSearch = location.state?.blogSearch;
  const backToBlog = `/blog${typeof savedSearch === 'string' && savedSearch.startsWith('?') ? savedSearch : ''}`;

  return (
    <article className="article-page content-width">
      <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><Link to={backToBlog}>Blog</Link><span aria-hidden="true">/</span><span aria-current="page">Article</span></nav>
      <header className="article-heading">
        <Link className="research-category" to={`/blog?category=${encodeURIComponent(article.category)}`}>{article.category}</Link>
        <h1>{article.title}</h1>
        {(article.author || article.date) && <p className="article-byline">{article.author && <span>{article.author}</span>}{article.date && <time dateTime={article.date}>{new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(article.date))}</time>}</p>}
      </header>
      <img className="article-cover" src={article.image} alt={article.imageAlt} width="1200" height="700" fetchPriority="high" />
      <div className="article-body">
        <div className="markdown-content"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
          h1: ({ children }) => <h2>{children}</h2>,
          table: ({ children }) => <div className="markdown-table"><table>{children}</table></div>,
          img: ({ src, alt }) => <img src={src} alt={alt ?? ''} loading="lazy" />,
        }}>{article.body}</Markdown></div>
        <Link className="text-link" to={backToBlog}><span aria-hidden="true">←</span>Back to blog</Link>
      </div>
    </article>
  );
}
