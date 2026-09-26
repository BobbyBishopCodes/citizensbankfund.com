import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArticle } from '../src/lib/article-files.ts';

const root = process.cwd();
const dist = join(root, process.argv[2] ?? 'docs');
const template = await readFile(join(dist, 'index.html'));
const routes = ['blog', 'contact', 'fund-history', 'scholarships', 'leadership', 'legacy', 'partnerships', 'members', 'portfolio'];

for (const filename of await readdir(join(root, 'content', 'blog'))) {
  if (!filename.toLowerCase().endsWith('.md')) continue;
  const article = parseArticle(filename, await readFile(join(root, 'content', 'blog', filename), 'utf8'));
  if (article) routes.push(`blog/${article.id}`);
}

for (const route of routes) {
  const directory = join(dist, route);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'index.html'), template);
}

await writeFile(join(dist, '404.html'), template);
