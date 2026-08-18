import manifest from '../data/photos.json';

export interface Photo {
  id: string;
  file: string;
  stem: string;
  hash: string;
  width: number;
  height: number;
  widths: number[];
  lqip: string;
  alt: string;
  caption: string;
}

export interface Gallery {
  slug: string;
  section: string | null;
  sectionTitle: string | null;
  title: string;
  description: string;
  order: number;
  cover: string;
  photos: Photo[];
}

export interface Section {
  slug: string;
  title: string;
  galleries: Gallery[];
}

export const IMG_BASE = (import.meta.env.PUBLIC_IMG_BASE ?? 'https://img.ryantaylor.photos').replace(/\/$/, '');

export const galleries = manifest.galleries as Gallery[];

export const allPhotos = galleries.flatMap((g) => g.photos);

function titleize(slug: string) {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const sectionTitles = new Map<string, string>();
for (const gallery of galleries) {
  if (gallery.section) sectionTitles.set(gallery.section, gallery.sectionTitle ?? titleize(gallery.section));
}

export const sections: Section[] = [...sectionTitles]
  .map(([slug, title]) => ({ slug, title, galleries: galleries.filter((g) => g.section === slug) }))
  .sort((a, b) => a.title.localeCompare(b.title));

export const unsectioned = galleries.filter((g) => !g.section);

export function getSection(slug: string) {
  return sections.find((s) => s.slug === slug);
}

export function getGallery(slug: string) {
  return galleries.find((g) => g.slug === slug);
}

export function photoById(id: string) {
  return allPhotos.find((p) => p.id === id);
}

export function srcset(photo: Photo, format: 'avif' | 'webp') {
  return photo.widths.map((w) => `${IMG_BASE}/${photo.stem}-${w}.${format} ${w}w`).join(', ');
}

export function fallbackSrc(photo: Photo) {
  const w = photo.widths[Math.min(1, photo.widths.length - 1)];
  return `${IMG_BASE}/${photo.stem}-${w}.webp`;
}

export function largestSrc(photo: Photo) {
  return `${IMG_BASE}/${photo.stem}-${photo.widths.at(-1)}.webp`;
}
