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

export interface VideoSources {
  mp4: string;
}

export interface VideoMeta {
  fps: number | null;
}

// For kind: 'video', width/height/widths/lqip/stem all describe the poster
// frame — a video is a Photo (its poster) plus video-only fields, so every
// existing image-only consumer (cards, covers, og:image) needs no changes.
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
  kind: 'photo' | 'video';
  duration: number | null;
  videoSources: VideoSources | null;
  videoMeta: VideoMeta | null;
}

export interface GalleryZip {
  key: 'small' | 'medium' | 'large' | 'full';
  label: string;
  path: string;
  size: number;
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
  // Unlisted galleries still get their own page (for direct client links)
  // but are left out of the home grid, section nav, and the sitemap.
  unlisted: boolean;
  availableUntil: string | null;
  zips: GalleryZip[] | null;
}

export interface Section {
  slug: string;
  title: string;
  galleries: Gallery[];
}

export const IMG_BASE = (import.meta.env.PUBLIC_IMG_BASE ?? 'https://img.ryantaylor.photos').replace(/\/$/, '');

// The full set, including unlisted galleries — [...gallery].astro builds a
// page for every one of these so a direct client link still works.
export const galleries = manifest.galleries as Gallery[];

// Everything that should actually appear somewhere a visitor can browse to:
// the home grid, section pages, section chips, the sitemap.
export const listedGalleries = galleries.filter((g) => !g.unlisted);

export const allPhotos = galleries.flatMap((g) => g.photos);

function titleize(slug: string) {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const sectionTitles = new Map<string, string>();
for (const gallery of listedGalleries) {
  if (gallery.section) sectionTitles.set(gallery.section, gallery.sectionTitle ?? titleize(gallery.section));
}

export const sections: Section[] = [...sectionTitles]
  .map(([slug, title]) => ({ slug, title, galleries: listedGalleries.filter((g) => g.section === slug) }))
  .sort((a, b) => a.title.localeCompare(b.title));

export const unsectioned = listedGalleries.filter((g) => !g.section);

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

export function describeMedia(photos: Photo[]) {
  const videos = photos.filter((p) => p.kind === 'video').length;
  const stills = photos.length - videos;
  if (!videos) return `${stills} photograph${stills === 1 ? '' : 's'}`;
  if (!stills) return `${videos} video${videos === 1 ? '' : 's'}`;
  return `${stills} photo${stills === 1 ? '' : 's'}, ${videos} video${videos === 1 ? '' : 's'}`;
}

export function videoSrc(photo: Photo) {
  return photo.videoSources ? `${IMG_BASE}/${photo.videoSources.mp4}` : '';
}

export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

export function zipHref(zip: GalleryZip) {
  return `${IMG_BASE}/${zip.path}`;
}

export function ogImage(photo: Photo, targetWidth = 1440) {
  const width = photo.widths.includes(targetWidth) ? targetWidth : photo.widths.at(-1)!;
  return {
    url: sizedSrc(photo, width, 'webp'),
    width,
    height: Math.round((photo.height / photo.width) * width),
  };
}
