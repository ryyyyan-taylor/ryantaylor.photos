import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

export const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']);
export const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm']);
export const MEDIA_EXT = new Set([...IMAGE_EXT, ...VIDEO_EXT]);

const COMBINING_MARKS = new RegExp(String.fromCharCode(0x5b) + '\\u0300-\\u036f' + String.fromCharCode(0x5d), 'g');

export function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function titleize(name) {
  return name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Recursively finds gallery folders under root: any directory (at any depth)
// containing at least one media file, one level of nesting = section. Mirrors
// the rule photos/README.md documents. Returns slash-joined relative paths.
export async function galleryDirs(root, prefix = '') {
  let entries;
  try {
    entries = await readdir(prefix ? join(root, ...prefix.split('/')) : root, { withFileTypes: true });
  } catch {
    return [];
  }

  const found = [];
  if (prefix && entries.some((e) => e.isFile() && MEDIA_EXT.has(extname(e.name).toLowerCase()))) {
    found.push(prefix);
  }
  for (const entry of entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    found.push(...(await galleryDirs(root, prefix ? `${prefix}/${entry.name}` : entry.name)));
  }
  return found;
}

export async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

// Files you list come first, in that order; anything unlisted keeps its
// filename-sorted position at the end. Shared with sync-photos.mjs so both
// tools order photos identically.
export function reorderFiles(files, order) {
  if (!order?.length) return files;
  const set = new Set(files);
  const ordered = order.filter((f) => set.has(f));
  const orderedSet = new Set(ordered);
  return [...ordered, ...files.filter((f) => !orderedSet.has(f))];
}
