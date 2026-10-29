import manifest from '../src/data/photos.json';

// Galleries moved under Archive/ used to live at /<name>/, /events/<name>/ or
// /sports/<name>/ — keep those links working for people who already have them.
const LEGACY_PREFIXES = ['', 'events/', 'sports/'];

const slugs = new Set((manifest.galleries as { slug: string }[]).map((g) => g.slug));

const legacyTargets = new Map<string, string>();
for (const slug of slugs) {
  if (!slug.startsWith('archive/')) continue;
  const name = slug.slice('archive/'.length);
  for (const prefix of LEGACY_PREFIXES) {
    if (!slugs.has(prefix + name)) legacyTargets.set(prefix + name, slug);
  }
}

// Pages that no longer exist: /sections/<name>/ became the showcase pages and
// /archive/, and /about/ folded into the home page hero.
legacyTargets.set('sections/events', 'events');
legacyTargets.set('sections/sports', 'sports');
legacyTargets.set('sections/archive', 'archive');
legacyTargets.set('about', '');

export function legacyRedirect(url: URL): Response | null {
  const target = legacyTargets.get(url.pathname.replace(/^\/|\/$/g, ''));
  if (target === undefined) return null;
  return Response.redirect(new URL(`/${target ? `${target}/` : ''}${url.search}`, url), 302);
}
