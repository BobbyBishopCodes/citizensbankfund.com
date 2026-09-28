import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArticle } from '../src/lib/article-files.ts';
import { application } from '../src/data/application.ts';

const root = process.cwd();
const dist = join(root, process.argv[2] ?? 'docs');
const template = await readFile(join(dist, 'index.html'), 'utf8');
const routes = ['blog', 'contact', 'apply', 'fund-history', 'scholarships', 'leadership', 'legacy', 'partnerships', 'investors', 'members', 'portfolio'];

for (const filename of await readdir(join(root, 'content', 'blog'))) {
  if (!filename.toLowerCase().endsWith('.md')) continue;
  const article = parseArticle(filename, await readFile(join(root, 'content', 'blog', filename), 'utf8'));
  if (article) routes.push(`blog/${article.id}`);
}

for (const route of routes) {
  const directory = join(dist, route);
  await mkdir(directory, { recursive: true });
  const html = route === 'apply' ? template
    .replace(/<title>[^<]*<\/title>/, `<title>${application.title}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${application.description}" />`)
    .replace('</head>', `  <link rel="canonical" href="${application.canonical}" />\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root"></div>\n    <noscript><h1>Apply to Citizens Bank Fund</h1><p>Complete the student membership application on Google Forms.</p><p><a href="${application.url}">Apply through Google Forms</a></p></noscript>`)
    : template;
  await writeFile(join(directory, 'index.html'), html);
}

await writeFile(join(dist, '404.html'), template);
