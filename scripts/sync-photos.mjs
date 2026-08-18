import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const SRC_DIR = process.env.PHOTOS_DIR || 'photos';
const MANIFEST = 'src/data/photos.json';
const WIDTHS = [480, 960, 1440, 2048];
const FORMATS = [
  { ext: 'avif', opts: { quality: 55, effort: 4 } },
  { ext: 'webp', opts: { quality: 78 } },
];
const SOURCE_EXT = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']);
const CONCURRENCY = 4;

const argv = new Set(process.argv.slice(2));
const dryRun = argv.has('--dry-run');
const force = argv.has('--force');

const env = process.env;
const bucket = env.R2_BUCKET;
const s3 = dryRun ? null : new S3Client({
  region: 'auto',
  endpoint: `https://${requireEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
  },
});

function requireEnv(name) {
  const value = env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}
if (!dryRun && !bucket) requireEnv('R2_BUCKET');

const previous = new Map();
try {
  const old = JSON.parse(await readFile(MANIFEST, 'utf8'));
  for (const gallery of old.galleries ?? []) {
    for (const photo of gallery.photos ?? []) previous.set(photo.file, photo);
  }
} catch {}

const galleries = [];
let uploaded = 0;
let skipped = 0;

for (const rel of await galleryDirs(SRC_DIR)) {
  const dir = join(SRC_DIR, ...rel.split('/'));
  const names = rel.split('/');
  const slug = names.map(slugify).join('/');
  const config = await readJson(join(dir, 'gallery.json'));
  const files = (await readdir(dir))
    .filter((f) => SOURCE_EXT.has(extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  const photos = await mapPool(files, CONCURRENCY, (file) => processPhoto(rel, slug, dir, file, config));
  if (!photos.length) continue;

  const coverFile = config?.cover && photos.find((p) => basename(p.file) === config.cover);
  galleries.push({
    slug,
    section: names.length > 1 ? slugify(names[0]) : null,
    sectionTitle: names.length > 1 ? titleize(names[0]) : null,
    title: config?.title ?? titleize(names.at(-1)),
    description: config?.description ?? '',
    order: config?.order ?? 999,
    cover: (coverFile ?? photos[0]).id,
    photos,
  });
}

galleries.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

const manifest = {
  generatedAt: new Date().toISOString(),
  widths: WIDTHS,
  galleries,
};

if (dryRun) {
  console.log(`\n[dry run] ${galleries.length} galleries, ${galleries.reduce((n, g) => n + g.photos.length, 0)} photos`);
  for (const g of galleries) console.log(`  ${g.slug.padEnd(28)} ${g.photos.length}`);
} else {
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\n${uploaded} uploaded, ${skipped} unchanged -> ${MANIFEST}`);
  console.log('Commit the manifest, then: npm run deploy');
}

async function processPhoto(rel, slug, dir, file, config) {
  const path = join(dir, file);
  const bytes = await readFile(path);
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
  const name = slugify(basename(file, extname(file)));
  const id = `${slug}/${name}`;
  const stem = `p/${slug}/${name}.${hash}`;
  const meta = config?.photos?.[file] ?? {};

  const cached = previous.get(`${rel}/${file}`);
  const reusable = cached?.hash === hash && !force;

  let width, height, lqip, widths;
  if (reusable) {
    ({ width, height, lqip, widths } = cached);
    skipped++;
  } else {
    const info = await sharp(bytes).rotate().metadata();
    width = info.autoOrient?.width ?? info.width;
    height = info.autoOrient?.height ?? info.height;
    widths = WIDTHS.filter((w) => w <= width);
    if (!widths.length) widths = [width];

    const jobs = [];
    for (const w of widths) {
      for (const { ext, opts } of FORMATS) {
        jobs.push(
          sharp(bytes).rotate().resize({ width: w })[ext](opts)
            .toBuffer()
            .then((buf) => upload(`${stem}-${w}.${ext}`, buf, `image/${ext}`)),
        );
      }
    }
    const lqipBuffer = await sharp(bytes).rotate().resize({ width: 24 }).webp({ quality: 40 }).toBuffer();
    lqip = `data:image/webp;base64,${lqipBuffer.toString('base64')}`;

    await Promise.all(jobs);
    await upload(`originals/${rel}/${file}`, bytes, mimeOf(file), { immutable: false });
    uploaded++;
    console.log(`  + ${id}`);
  }

  return {
    id,
    file: `${rel}/${file}`,
    stem,
    hash,
    width,
    height,
    widths,
    lqip,
    alt: meta.alt ?? '',
    caption: meta.caption ?? '',
  };
}

async function upload(key, body, contentType, { immutable = true } = {}) {
  if (dryRun) return;
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: immutable ? 'public, max-age=31536000, immutable' : 'no-store',
  }));
}

async function galleryDirs(root, prefix = '') {
  let entries;
  try {
    entries = await readdir(prefix ? join(root, ...prefix.split('/')) : root, { withFileTypes: true });
  } catch {
    if (prefix) return [];
    console.error(`No ${root}/ directory. Create ${root}/<gallery-name>/ and drop images in.`);
    process.exit(1);
  }

  const found = [];
  if (prefix && entries.some((e) => e.isFile() && SOURCE_EXT.has(extname(e.name).toLowerCase()))) {
    found.push(prefix);
  }
  for (const entry of entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    found.push(...(await galleryDirs(root, prefix ? `${prefix}/${entry.name}` : entry.name)));
  }
  return found;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function titleize(name) {
  return name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function mimeOf(file) {
  const ext = extname(file).toLowerCase();
  return ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext.startsWith('.tif') ? 'image/tiff' : 'image/jpeg';
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}
