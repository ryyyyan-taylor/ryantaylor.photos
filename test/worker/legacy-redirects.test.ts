import { describe, expect, it } from 'vitest';
import manifest from '../../src/data/photos.json';
import { legacyRedirect } from '../../worker/legacy-redirects';

const redirect = (path: string) => legacyRedirect(new URL(path, 'https://ryantaylor.photos'));
const slugs = new Set(manifest.galleries.map((g) => g.slug));
const archived = [...slugs].find((s) => s.startsWith('archive/') && !slugs.has(s.slice('archive/'.length)))!;

describe('legacyRedirect', () => {
  it.each([
    ['/about/', 'https://ryantaylor.photos/'],
    ['/sections/events/', 'https://ryantaylor.photos/events/'],
    ['/sections/archive', 'https://ryantaylor.photos/archive/'],
  ])('redirects %s', (from, to) => {
    const res = redirect(from)!;
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(to);
  });

  it('sends pre-archive gallery URLs to their archive home, keeping the query', () => {
    const name = archived.slice('archive/'.length);
    for (const prefix of ['', 'events/', 'sports/']) {
      if (slugs.has(prefix + name)) continue;
      expect(redirect(`/${prefix}${name}/?ref=old`)!.headers.get('location')).toBe(
        `https://ryantaylor.photos/${archived}/?ref=old`,
      );
    }
  });

  it('leaves current pages alone', () => {
    expect(redirect('/')).toBeNull();
    expect(redirect(`/${archived}/`)).toBeNull();
    expect(redirect('/contact/')).toBeNull();
  });
});
