// Canonical paths for content. The id leads; the slug is decoration, so a renamed title never
// breaks a link (an old slug redirects to the current one).

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/ë/g, 'e')
    .replace(/ç/g, 'c')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

const withSlug = (base: string, id: string, title: string) => {
  const s = slugify(title);
  return `${base}/${id}${s ? '-' + s : ''}`;
};

export function postPath(p: { kind: string; id: string; title: string }) {
  if (p.kind === 'proposal') return withSlug('/propozime', p.id, p.title);
  if (p.kind === 'news') return withSlug('/vendime', p.id, p.title);
  return withSlug('/tema', p.id, p.title);
}
export const eventPath = (e: { id: string; title: string }) => withSlug('/ngjarje', e.id, e.title);
export const townHallPath = (t: { id: string; title: string }) => withSlug('/live', t.id, t.title);

/** "abc123xyz-some-title" → "abc123xyz" (ids are 16 chars of [0-9a-z]) */
export const idFromParam = (param: string | undefined) => (param ?? '').slice(0, 16);
