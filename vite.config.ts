import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArticle, sortArticles } from './src/lib/article-files.ts';
import { parseHoldings, staticPortfolio } from './scripts/portfolio/static.mjs';

const blogDirectory = fileURLToPath(new URL('./content/blog', import.meta.url));
const virtualId = '\0virtual:articles';
const holdingsPath = fileURLToPath(new URL('./content/portfolio/holdings.json', import.meta.url));

export default defineConfig({
  build: { outDir: 'docs' },
  plugins: [react(), {
    name: 'portfolio-development-data',
    configureServer(server) {
      server.middlewares.use('/data/portfolio.json', async (request, response) => {
        if (request.method !== 'GET') { response.statusCode = 405; response.end(); return; }
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        try {
          const holdings = parseHoldings(readFileSync(holdingsPath, 'utf8'));
          response.end(JSON.stringify(await staticPortfolio(holdings)));
        } catch {
          response.statusCode = 503;
          response.end(JSON.stringify({ error: 'Prepared portfolio data is unavailable' }));
        }
      });
      server.watcher.add(holdingsPath);
      const update = (path: string) => { if (resolve(path) === holdingsPath) server.ws.send({ type: 'full-reload' }); };
      server.watcher.on('change', update);
      server.httpServer?.once('close', () => server.watcher.off('change', update));
    },
  }, {
    name: 'markdown-articles',
    resolveId(id) { if (id === 'virtual:articles') return virtualId; },
    load(id) {
      if (id !== virtualId) return;
      const articles = readdirSync(blogDirectory).filter(name => /\.md$/i.test(name)).flatMap(name => {
        const path = resolve(blogDirectory, name);
        this.addWatchFile(path);
        const article = parseArticle(name, readFileSync(path, 'utf8'));
        return article ? [article] : [];
      });
      return `export default ${JSON.stringify(sortArticles(articles))};`;
    },
    configureServer(server) {
      server.watcher.add(blogDirectory);
      const update = (path: string) => {
        if (dirname(resolve(path)) !== blogDirectory || !/\.md$/i.test(path)) return;
        const module = server.moduleGraph.getModuleById(virtualId);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', update).on('change', update).on('unlink', update);
      server.httpServer?.once('close', () => {
        server.watcher.off('add', update).off('change', update).off('unlink', update);
      });
    },
  }],
  server: { port: 5173, strictPort: true },
});
