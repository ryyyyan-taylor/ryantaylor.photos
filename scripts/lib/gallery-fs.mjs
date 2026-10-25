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

async function subdirs(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  } catch {
    return [];
  }
}

async function looseMedia(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && MEDIA_EXT.has(extname(e.name).toLowerCase()))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  } catch {
    return [];
  }
}

async function hasMedia(dir) {
  if ((await looseMedia(dir)).length) return true;
  for (const sub of await subdirs(dir)) if ((await looseMedia(join(dir, sub))).length) return true;
  return false;
}

// A top-level folder is a gallery if it holds media directly or has a
// gallery.json; otherwise it is a section and each child folder with media is
// a gallery. Folders inside a gallery are its subsections (see galleryMedia).
// Returns slash-joined paths relative to root.
export async function galleryDirs(root) {
  const found = [];
  for (const top of await subdirs(root)) {
    const topDir = join(root, top);
    if ((await looseMedia(topDir)).length || (await readJson(join(topDir, 'gallery.json')))) {
      found.push(top);
      continue;
    }
    for (const child of await subdirs(topDir)) {
      if (await hasMedia(join(topDir, child))) found.push(`${top}/${child}`);
    }
  }
  return found;
}

export function subsectionTitle(folderName) {
  return folderName.replace(/^\d+[\s._-]+/, '');
}

// A gallery's media in display order: loose files first, then each subfolder
// (a subsection) in folder order, with photoOrder applied inside each group.
// `file` is the bare filename, unique across the gallery; `path` is relative
// to the gallery folder.
export async function galleryMedia(dir, photoOrder) {
  const groups = [{ subsection: null, folder: '', files: await looseMedia(dir) }];
  for (const folder of await subdirs(dir)) {
    groups.push({ subsection: subsectionTitle(folder), folder, files: await looseMedia(join(dir, folder)) });
  }

  const seen = new Set();
  const media = [];
  for (const { subsection, folder, files } of groups) {
    for (const file of reorderFiles(files, photoOrder)) {
      if (seen.has(file)) throw new Error(`${dir}: "${file}" appears in more than one subfolder`);
      seen.add(file);
      media.push({ file, path: folder ? `${folder}/${file}` : file, subsection });
    }
  }
  return media;
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
