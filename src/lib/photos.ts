import manifest from '../data/photos.json';

export interface PhotoExif {
  camera: string | null;
  lens: string | null;
  focalLength: string | null;
  aperture: string | null;
  shutterSpeed: string | null;
  iso: number | null;
  takenAt: string | null;
}

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
  note: string;
  exif: PhotoExif | null;
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

export function sizedSrc(photo: Photo, width: number, format: 'avif' | 'webp' = 'webp') {
  return `${IMG_BASE}/${photo.stem}-${width}.${format}`;
}

export function srcset(photo: Photo, format: 'avif' | 'webp') {
  return photo.widths.map((w) => `${sizedSrc(photo, w, format)} ${w}w`).join(', ');
}

export function fallbackSrc(photo: Photo) {
  return sizedSrc(photo, photo.widths[Math.min(1, photo.widths.length - 1)]);
}

export function largestSrc(photo: Photo) {
  return sizedSrc(photo, photo.widths.at(-1)!);
}

export function ogImage(photo: Photo, targetWidth = 1440) {
  const width = photo.widths.includes(targetWidth) ? targetWidth : photo.widths.at(-1)!;
  return {
    url: sizedSrc(photo, width, 'webp'),
    width,
    height: Math.round((photo.height / photo.width) * width),
  };
}
