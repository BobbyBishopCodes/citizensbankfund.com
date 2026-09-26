/// <reference types="vite/client" />

declare module 'virtual:articles' {
  const articles: import('./lib/article-files').Article[];
  export default articles;
}
