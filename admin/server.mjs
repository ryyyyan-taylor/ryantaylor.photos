import { createServer } from 'node:http';
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { IMAGE_EXT, MEDIA_EXT, titleize, galleryDirs, readJson, reorderFiles } from '../scripts/lib/gallery-fs.mjs';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '..');
const SRC_DIR = resolve(REPO_ROOT, process.env.PHOTOS_DIR || 'photos');
const PORT = Number(process.env.ADMIN_PORT) || 5050;
const THUMB_DIR = join(tmpdir(), 'rtp-admin-thumbs');

const STATIC_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

// Actions the UI can trigger, mapped to fixed argv — never built from
// request input, so there's no shell-injection surface here.
const NPM_ACTIONS = {
  'sync-check': ['run', 'photos:check'],
  sync: ['run', 'photos:sync'],
  'prune-check': ['run', 'photos:prune:check'],
  prune: ['run', 'photos:prune'],
  deploy: ['run', 'deploy'],
};

let running = null; // name of the in-flight action, or null

await mkdir(THUMB_DIR, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;

    if (req.method === 'GET' && pathname === '/') return serveStatic(res, 'index.html');
    if (req.method === 'GET' && (pathname === '/app.js' || pathname === '/style.css')) {
      return serveStatic(res, pathname.slice(1));
    }
    if (req.method === 'GET' && pathname === '/api/config') return sendJson(res, { photosDir: SRC_DIR });
    if (req.method === 'GET' && pathname === '/api/galleries') return await listGalleries(res);
    if (req.method === 'GET' && pathname === '/api/gallery') return await getGallery(res, url.searchParams.get('id'));
    if (req.method === 'PUT' && pathname === '/api/gallery') return await putGallery(req, res, url.searchParams.get('id'));
    if (req.method === 'GET' && pathname === '/media') return await serveMedia(res, url.searchParams);
    if (req.method === 'POST' && pathname === '/api/run') return await runAction(req, res);

    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end(String(err?.message || err));
  }
});

server.listen(PORT, () => {
  console.log(`Portfolio admin: http://localhost:${PORT}`);
  console.log(`Photos: ${SRC_DIR}`);
});

async function serveStatic(res, name) {
  const file = join(__dirname, 'public', name);
  const body = await readFile(file);
  res.writeHead(200, { 'Content-Type': STATIC_TYPES[extname(file)] || 'application/octet-stream' });
  res.end(body);
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((res, rej) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => res(data));
    req.on('error', rej);
  });
}

// A gallery's id is its path relative to PHOTOS_DIR (e.g. "Sports/McKay Bike
// Park") — the real directory name, not the slugified site URL — since that's
// what every filesystem operation below needs. Rejects anything that would
// resolve outside PHOTOS_DIR.
function resolveGalleryDir(id) {
  if (!id || typeof id !== 'string') throw new Error('missing gallery id');
  const dir = resolve(join(SRC_DIR, ...id.split('/')));
  if (dir !== SRC_DIR && !dir.startsWith(SRC_DIR + sep)) throw new Error('invalid gallery id');
  return dir;
}

async function readMediaFiles(dir) {
  const entries = await readdir(dir);
  return entries
    .filter((f) => MEDIA_EXT.has(extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

// What the cover would be with no explicit override: the first image in
// display order, falling back to the first file at all only if the gallery
// has no images (a video can't be rendered as a thumbnail, unlike the site
// build's own default of "just the first photo").
function autoCoverOf(order) {
  return order.find((f) => IMAGE_EXT.has(extname(f).toLowerCase())) ?? order[0];
}

function effectiveCover(order, config) {
  return config?.cover && order.includes(config.cover) ? config.cover : autoCoverOf(order);
}

async function listGalleries(res) {
  const dirs = await galleryDirs(SRC_DIR);
  const galleries = [];
  for (const rel of dirs) {
    const dir = join(SRC_DIR, ...rel.split('/'));
    const names = rel.split('/');
    const [config, files] = await Promise.all([readJson(join(dir, 'gallery.json')), readMediaFiles(dir)]);
    if (!files.length) continue;
    const order = reorderFiles(files, config?.photoOrder);
    const cover = effectiveCover(order, config);
    galleries.push({
      id: rel,
      section: names.length > 1 ? titleize(names[0]) : null,
      title: config?.title ?? titleize(names.at(-1)),
      order: config?.order ?? 999,
      unlisted: !!config?.unlisted,
      photoCount: files.length,
      cover,
      coverKind: IMAGE_EXT.has(extname(cover).toLowerCase()) ? 'photo' : 'video',
    });
  }
  galleries.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  sendJson(res, galleries);
}

async function getGallery(res, id) {
  const dir = resolveGalleryDir(id);
  const [config, files] = await Promise.all([readJson(join(dir, 'gallery.json')), readMediaFiles(dir)]);
  if (!files.length) return sendJson(res, { error: 'no media files in this gallery' }, 404);

  const order = reorderFiles(files, config?.photoOrder);
  const photos = order.map((file) => {
    const meta = config?.photos?.[file] ?? {};
    return {
      file,
      kind: IMAGE_EXT.has(extname(file).toLowerCase()) ? 'photo' : 'video',
      alt: meta.alt ?? '',
      caption: meta.caption ?? '',
      note: meta.note ?? '',
      subsection: meta.subsection ?? '',
    };
  });

  sendJson(res, {
    id,
    title: config?.title ?? '',
    defaultTitle: titleize(id.split('/').at(-1)),
    description: config?.description ?? '',
    order: config?.order ?? 999,
    unlisted: !!config?.unlisted,
    availableUntil: config?.availableUntil ?? '',
    password: config?.password ?? '',
    cover: effectiveCover(order, config),
    autoCover: autoCoverOf(order),
    savedPhotoOrder: config?.photoOrder ?? null,
    naturalOrder: files,
    photos,
  });
}

async function putGallery(req, res, id) {
  const dir = resolveGalleryDir(id);
  await stat(dir);
  const data = JSON.parse(await readBody(req));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('gallery.json must be an object');
  await writeFile(join(dir, 'gallery.json'), JSON.stringify(data, null, 2) + '\n');
  sendJson(res, { ok: true });
}

async function serveMedia(res, params) {
  const id = params.get('id');
  const file = params.get('file') || '';
  if (!file || file.includes('/') || file.includes('\\')) throw new Error('invalid file');
  const dir = resolveGalleryDir(id);
  const full = join(dir, file);
  const ext = extname(file).toLowerCase();
  if (!IMAGE_EXT.has(ext)) return res.writeHead(404).end();

  const info = await stat(full);
  const width = Math.min(Math.max(Number(params.get('w')) || 320, 80), 1600);
  const cacheKey = createHash('sha1').update(`${full}:${info.mtimeMs}:${width}`).digest('hex');
  const cachePath = join(THUMB_DIR, `${cacheKey}.webp`);

  try {
    await stat(cachePath);
  } catch {
    const bytes = await readFile(full);
    const resized = await sharp(bytes).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    await writeFile(cachePath, resized);
  }

  res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' });
  createReadStream(cachePath).pipe(res);
}

async function runAction(req, res) {
  if (running) return sendJson(res, { error: `already running: ${running}` }, 409);
  const { action, message } = JSON.parse(await readBody(req));

  if (action !== 'commit' && action !== 'push' && !NPM_ACTIONS[action]) {
    return sendJson(res, { error: 'unknown action' }, 400);
  }
  if (action === 'commit' && !message?.trim()) {
    return sendJson(res, { error: 'commit message required' }, 400);
  }

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  running = action;
  try {
    if (action === 'commit') {
      const addCode = await streamProc(res, 'git', ['add', 'src/data/photos.json']);
      if (addCode === 0) await streamProc(res, 'git', ['commit', '-m', message]);
    } else if (action === 'push') {
      await streamProc(res, 'git', ['push']);
    } else {
      await streamProc(res, 'npm', NPM_ACTIONS[action]);
    }
  } finally {
    running = null;
    res.end();
  }
}

function streamProc(res, cmd, args) {
  return new Promise((resolvePromise) => {
    const proc = spawn(cmd, args, { cwd: REPO_ROOT, env: process.env });
    proc.stdout.on('data', (d) => res.write(d));
    proc.stderr.on('data', (d) => res.write(d));
    proc.on('close', (code) => {
      res.write(`\n[${cmd} ${args.join(' ')} exited ${code}]\n`);
      resolvePromise(code);
    });
    proc.on('error', (err) => {
      res.write(`\n[error running ${cmd}] ${err.message}\n`);
      resolvePromise(1);
    });
  });
}
