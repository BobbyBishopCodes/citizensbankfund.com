import { parse } from 'yaml';

export type Article = {
  id: string;
  title: string;
  category: string;
  image: string;
  imageAlt: string;
  summary: string;
  body: string;
  date?: string;
  author?: string;
  featured: boolean;
  preview: boolean;
  order: number;
};

export function parseArticle(filename: string, source: string): Article | null {
  const fail = (message: string): never => { throw new Error(`${filename}: ${message}`); };
  const id = filename.replace(/\.md$/i, '');
  if (id.startsWith('_')) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) fail('Use a lowercase, hyphen-separated filename, such as market-update.md.');
  const match = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) return fail('Start the file with YAML metadata between two --- lines.');
  let metadata: Record<string, unknown>;
  try {
    const value = parse(match[1], { uniqueKeys: true, maxAliasCount: 20 });
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('Metadata must be a list of named fields.');
    metadata = value;
  } catch (error) { return fail(`Invalid metadata: ${error instanceof Error ? error.message : String(error)}`); }
  for (const field of ['draft', 'featured', 'preview']) {
    if (metadata[field] !== undefined && typeof metadata[field] !== 'boolean') fail(`${field} must be true or false.`);
  }
  if (metadata.draft === true) return null;
  const required = (field: string): string => {
    const value = metadata[field];
    if (typeof value !== 'string' || !value.trim()) return fail(`Missing or empty ${field}.`);
    return value.trim();
  };
  const title = required('title');
  const category = required('category');
  const summary = required('summary');
  const image = required('image');
  const imageAlt = required('imageAlt');
  if (!/^\/(?!\/)/.test(image) && !/^https:\/\//.test(image)) fail('image must be a site path beginning with / or an https URL.');
  const date = metadata.date === undefined ? undefined : required('date');
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) fail('date must be a valid YYYY-MM-DD date.');
  const author = metadata.author === undefined ? undefined : required('author');
  if (metadata.order !== undefined && (typeof metadata.order !== 'number' || !Number.isFinite(metadata.order))) fail('order must be a number.');
  const body = match[2].trim();
  if (!body) fail('Add Markdown article text below the metadata.');
  return { id, title, category, summary, image, imageAlt, body, date, author, featured: metadata.featured === true, preview: metadata.preview === true, order: (metadata.order as number | undefined) ?? 0 };
}

export function sortArticles(articles: Article[]): Article[] {
  return articles.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.order - b.order || a.id.localeCompare(b.id));
}
