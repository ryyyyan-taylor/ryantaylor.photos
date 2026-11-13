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
    git push    # GitHub Actions builds and deploys

Files sort by filename, so number them to control order. Unchanged files are skipped on re-runs
(`--force` re-encodes everything). Deleting a local file removes it from the site on the next sync;
the R2 objects stay as backup.

Optional `photos/<gallery>/gallery.json` sets the title, blurb, cover, order, and per-photo alt text —
see `photos/README.md`. `npm run admin` starts a local web UI for editing those files visually and
running sync/deploy without the CLI — see [Admin UI](#admin-ui).

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

## Admin UI

`npm run admin` starts a local-only web app at `http://localhost:5050` (change the port with
`ADMIN_PORT`) for managing the library without touching JSON or the CLI by hand:

- Browse galleries, edit every `gallery.json` field (title, description, tags, order,
  availableUntil, password) through a form.
- View, reorder (drag and drop), and set the cover among a gallery's photos and videos; edit each
  photo's alt/caption/note (subsections are shown read-only; they come from folders).
- Buttons for `photos:check`, `photos:sync`, `photos:prune:check`, and `photos:prune`, streaming
  live command output; a commit button stages and commits `src/data/photos.json`, and push sends it
  to `main`, which deploys.

It only ever writes `gallery.json` files under `PHOTOS_DIR` and shells out to the same npm scripts
listed below — nothing it does bypasses them. Meant to run on the same machine as the photo library;
not meant to be exposed beyond localhost.

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
| `npm run admin` | local web UI for editing galleries and running the commands below |
| `npm run photos:check` | dry run — what sync would do, no uploads |
| `npm run photos:sync` | encode, upload to R2, rewrite the manifest |
| `npm run photos:prune:check` | dry run — what prune would delete from R2 |
| `npm run photos:prune` | delete R2 objects no longer in the manifest |
| `npm run build` | build to `dist/` |
| `npm run preview` | serve `dist/` through Wrangler, as Workers will |
| `npm run deploy` | build and deploy by hand (normally CI does this on push to `main`) |

## CI/CD

GitHub Actions, in `.github/workflows/`:

- `ci.yml` — every PR and push runs typecheck + Worker tests, Playwright smoke tests, Lighthouse
  budgets, and `terraform fmt`/`validate`. On `main`, a `deploy` job runs only once all of those
  pass, in the `production` environment with a Workers-only token (`CLOUDFLARE_DEPLOY_TOKEN`).
- `terraform.yml` — PRs touching `infra/` get the plan as a comment; on merge, `apply` waits for
  approval in the `infrastructure` environment.

Photo sync stays local — it reads originals from `PHOTOS_DIR` — so the flow is sync, commit
`photos.json`, push.

`drift.yml` runs `terraform plan` nightly and fails (GitHub emails you) if the live config no longer
matches `infra/`.

## Testing

| | |
|---|---|
| `npm run typecheck` | `wrangler types` + `tsc --noEmit` |
| `npm test` | Worker unit + integration tests (Vitest in the Workers runtime via `@cloudflare/vitest-plugin`) — needs `npm run build` first for the assets binding |
| `npm run test:e2e` | Playwright smoke tests (desktop + mobile) against `wrangler dev` serving `dist/`; email is simulated |
| `npm run lighthouse` | Lighthouse CI against the same local server; budgets in `lighthouserc.json` (set `CHROME_PATH` locally) |

Worker tests cover Access JWT verification, gallery passwords and session cookies, legacy
redirects, the contact handler (validation, honeypot, owner-only delivery, failure → KV + alert),
the `/utils/api` gate, and the health check's alert/recovery logic.

## Observability

- **Logs** — Workers Logs is on; business events are logged as structured objects
  (`{ event, outcome, detail }`): `contact`, `contact_source`, `gallery_unlock`, `confirmation`,
  `access_denied`, `health`.
- **Metrics** — the same events, plus every request's route/status/worker time, go to the
  `ryantaylor_photos_events` Analytics Engine dataset (`worker/telemetry.ts`).
- **Health checks** — a 5-minute cron (`worker/health.ts`) probes the home page, an image, and the
  `/utils/` Access redirect, keeping state in the `MONITOR` KV namespace. A check failing for 10
  minutes emails an alert; recovery emails again.
- **Email failures** — a failed contact or booking email alerts too. A failed inquiry is also saved
  to KV for 30 days, since the alert may fail for the same reason.
- **Stats** — `/utils/stats/` (behind Access) shows health, uptime, events, request latency, edge
  cache, and Web Analytics pages/referrers/Core Web Vitals. The Worker queries these with the
  read-only `STATS_API_TOKEN` secret.
- **Lead source** — the first page of a visit, plus any `utm_*` tags and external referrer, is kept
  in `sessionStorage` and attached to contact form submissions.
