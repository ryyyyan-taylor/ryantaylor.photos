# photos/

Source-of-truth originals. Gitignored — these live here and in R2 under `originals/`.

Set `PHOTOS_DIR` in `.env` to keep the library somewhere else entirely; this folder is then unused.

Names are slugified for URLs and kept as-is for titles — `Sports/McKay Bike Park/` publishes at
`/sports/mckay-bike-park/` titled "McKay Bike Park".

Any folder containing images is a gallery. Nest one level to group galleries into a section:

    photos/portraits/*.jpg              -> /portraits/          (no section)
    photos/sports/bike-park/*.jpg       -> /sports/bike-park/   (section: Sports)
    photos/sports/climbing/*.jpg        -> /sports/climbing/    (section: Sports)

Sections are the first path segment, titled from the folder name, and appear under /sections/.
Deeper nesting works too — the first segment is still the section.

## gallery.json

Every gallery folder may hold a `gallery.json`. The file is optional, and so is every field in it —
include only what you want to override. Copy `gallery.example.json` as a starting point.

| Field | Default | Notes |
|---|---|---|
| `title` | folder name, titleized | Display name. Does not affect the URL. |
| `description` | none | Blurb under the gallery heading. |
| `order` | `999` | Lower sorts earlier on the home page. Ties break by title. |
| `cover` | first photo | Exact filename **with extension**, case-sensitive. |
| `photos` | none | Per-file `alt`, `caption`, `note`, and `subsection`, keyed by exact filename. |
| `unlisted` | `false` | Keeps the gallery off the home grid, section nav, and sitemap. The page still builds and is reachable by direct link — for client deliveries. |
| `availableUntil` | none | `"YYYY-MM-DD"`. Purely a note shown on the page ("available to view through ...") — nothing is actually enforced or deleted automatically. |
| `password` | none | Plaintext, here only. `photos:sync` hashes it (PBKDF2) into `photos.json` and never writes the plaintext anywhere. The Worker gates the page at request time — visiting the URL shows a password prompt instead of the gallery until it's entered (see `worker/gallery-auth.ts`). Removing the field and re-syncing removes protection. |

`password` gates the gallery *page* only. Photo/zip files are still plain public objects on
`img.ryantaylor.photos` — someone with a direct file URL (e.g. copied out of the page after
logging in) can still fetch it without the password. Fine for keeping a gallery out of casual/search
traffic; not a guarantee against a client resharing a link.

`alt` is the accessibility description and is not shown. `caption` appears under the photo in the
lightbox. `note` appears in the lightbox sidebar, below the EXIF data — use it for shooting notes or
backstory. Photos you omit simply have none of these.

`subsection` groups photos *within one gallery's page* under a header — unrelated to the
folder-based section above (which groups separate galleries in the site nav). Give consecutive
photos the same `subsection` string and the gallery page splits them apart with a heading; the
lightbox shows it too, alongside the gallery title. Photos must be contiguous in filename order —
if a subsection's files aren't next to each other, its heading appears more than once. Leave it
off for a plain, ungrouped gallery (the default).

Every gallery also gets a "Download all" menu with zips for its photos — Small (1024px), Medium
(2048px), Large (3200px), and Full quality (untouched originals) — built automatically by
`photos:sync` and rebuilt whenever the gallery's files change. A gallery with any videos also gets
a Video zip (the untouched originals) instead of duplicating them into every photo tier. Nothing to
configure.

Example:

    {
      "title": "Bike Park",
      "description": "Whistler, summer.",
      "order": 1,
      "cover": "0002-berm.jpg",
      "photos": {
        "0001-drop.jpg": { "alt": "Rider dropping in", "caption": "A-Line" }
      }
    }

Then: `npm run photos:sync`
