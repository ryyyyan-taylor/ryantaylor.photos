# ryantaylor.photos

Static Astro site on Cloudflare Workers. Photos live in R2 and are served from `img.ryantaylor.photos`.

## How it works

`photos/` (local, gitignored) is the source of truth — or any directory you point `PHOTOS_DIR` at, so the
library can live outside the repo. `npm run photos:sync` resizes each image into
AVIF + WebP at 480/960/1440/2048px, uploads them to R2 alongside the untouched original, and rewrites
`src/data/photos.json`. The site build reads only that committed manifest — it never touches R2 or sharp,
so a clean clone with no photos still builds.

## Adding photos

    photos/travel/iceland/0001-glacier.jpg
    photos/travel/iceland/0002-ice-cave.jpg

    npm run photos:sync
    git add src/data/photos.json && git commit -m "feat(photos): add iceland"
    npm run deploy

Files sort by filename, so number them to control order. Unchanged files are skipped on re-runs
(`--force` re-encodes everything). Deleting a local file removes it from the site on the next sync;
the R2 objects stay as backup.

Optional `photos/<gallery>/gallery.json` sets the title, blurb, cover, order, and per-photo alt text —
see `photos/README.md`.

## Sections

Any folder holding images is a gallery. Nest it one level and the parent folder becomes a section:
`photos/travel/iceland/` publishes at `/travel/iceland/` under the *Travel* section. A top-level
`photos/portraits/` still works and simply has no section.

- `/` lists every gallery flat, each card tagged with its section.
- `/sections/` lists them grouped, with a chip per section.
- `/sections/travel/` is that filter applied — a real prerendered URL, no JavaScript.

Section names are derived from the folder name (`black-and-white` → "Black And White"), so renaming the
folder is how you rename a section.

Folder and file names are slugified for URLs but kept as-is for display: `Sports/McKay Bike Park/`
publishes at `/sports/mckay-bike-park/` and is titled "McKay Bike Park".

## Cloudflare setup

Once, in the dashboard:

1. **R2 → Create bucket** named `ryantaylor-photos`.
2. That bucket → **Settings → Public access → Custom domain** → `img.ryantaylor.photos`.
   The DNS record is created for you since the zone is already on Cloudflare.
3. **R2 → API → Manage API tokens → Create token**, permission *Object Read & Write*, scoped to that
   bucket. Copy the Access Key ID, Secret Access Key, and Account ID. The token screen also shows an
   S3 endpoint — confirm it reads `https://<account-id>.r2.cloudflarestorage.com`, which is the form
   `scripts/sync-photos.mjs` builds. A mismatch here is the usual cause of a failed first sync.
4. `cp .env.example .env` and fill those in. `.env` is gitignored.
5. `npx wrangler login`, then `npm run deploy`.
6. **Workers & Pages → ryantaylor-photos → Settings → Domains & Routes** → add `ryantaylor.photos`.

`PUBLIC_IMG_BASE` is read at build time only, and `.env` is gitignored — a build on Cloudflare's side
falls back to the default in `src/lib/photos.ts`. If the image domain ever changes, edit that line too.

## Commands

| | |
|---|---|
| `npm run dev` | local dev server |
| `npm run photos:check` | dry run — what sync would do, no uploads |
| `npm run photos:sync` | encode, upload to R2, rewrite the manifest |
| `npm run build` | build to `dist/` |
| `npm run preview` | serve `dist/` through Wrangler, as Workers will |
| `npm run deploy` | build and deploy |
