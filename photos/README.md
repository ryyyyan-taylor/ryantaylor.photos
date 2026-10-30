# photos/

Source-of-truth originals. Gitignored — these live here and in R2 under `originals/`.

Set `PHOTOS_DIR` in `.env` to keep the library somewhere else entirely; this folder is then unused.

Names are slugified for URLs and kept as-is for titles — `Archive/McKay Bike Park/` publishes at
`/archive/mckay-bike-park/` titled "McKay Bike Park".

A top-level folder holding images (or a `gallery.json`) is a gallery. A top-level folder with neither
is a section, and each folder inside it is a gallery:

    photos/Events/*.jpg                 -> /events/             (no section)
    photos/Archive/Bike Park/*.jpg      -> /archive/bike-park/  (section: Archive)
    photos/Archive/Climbing/*.jpg       -> /archive/climbing/   (section: Archive)

Galleries in the Archive section are listed on /archive/.

Showcases (`Events/`, `Sports/`, listed in `src/lib/showcases.ts`) are ordinary top-level galleries
whose folder name matches a showcase slug — the showcase page replaces the gallery page at that URL.
They ship with a `gallery.json` so subsection folders inside them work (see below).

Folders inside a gallery are its subsections. Each gets a heading on the gallery page and in the
lightbox. Order follows folder name; a leading number is used for ordering and stripped from the
title. Loose files in the gallery folder come first, with no heading:

    photos/events/finals/01 Swiss/*.jpg   -> subsection "Swiss"
    photos/events/finals/02 Top 4/*.jpg   -> subsection "Top 4"

Filenames must be unique within a gallery, across its subsection folders. A gallery made only of
subsection folders needs a `gallery.json` (even `{}`), or it is read as a section.

## gallery.json

Every gallery folder may hold a `gallery.json`. The file is optional, and so is every field in it —
include only what you want to override. Copy `gallery.example.json` as a starting point.

| Field | Default | Notes |
|---|---|---|
| `title` | folder name, titleized | Display name. Does not affect the URL. |
| `description` | none | Blurb under the gallery heading. |
| `order` | `999` | Lower sorts earlier on the home page. Ties break by title. |
| `cover` | first photo | Exact filename **with extension**, case-sensitive. |
| `photos` | none | Per-file `alt`, `caption`, and `note`, keyed by exact filename. |
| `photoOrder` | none | Filenames in display order (see below). Overrides the default filename sort. |
| `type` | none | A category like `"events"` or `"sports"`. Used to filter the archive page. |
| `availableUntil` | none | `"YYYY-MM-DD"`. Purely a note shown on the page ("available to view through ...") — nothing is actually enforced or deleted automatically. |
| `password` | none | Plaintext, here only. `photos:sync` hashes it (PBKDF2) into `photos.json` and never writes the plaintext anywhere. The Worker gates the page at request time — visiting the URL shows a password prompt instead of the gallery until it's entered (see `worker/gallery-auth.ts`). Protected galleries still appear on the archive page (title and cover) but are kept out of the sitemap. Removing the field and re-syncing removes protection. |

`password` gates the gallery *page* only. Photo/zip files are still plain public objects on
`img.ryantaylor.photos` — someone with a direct file URL (e.g. copied out of the page after
logging in) can still fetch it without the password. Fine for keeping a gallery out of casual/search
traffic; not a guarantee against a client resharing a link.

`alt` is the accessibility description and is not shown. `caption` appears under the photo in the
lightbox. `note` appears in the lightbox sidebar, below the EXIF data — use it for shooting notes or
backstory. Photos you omit simply have none of these.

By default photos display in filename sort order, which rarely matches the order you'd actually
want to tell a story in. `photoOrder` overrides that with an explicit filename list:

    "photoOrder": ["IMG00024.jpg", "IMG00021.jpg", "IMG00055.jpg"]

Files you list come first, in that order; anything in the gallery you don't mention is appended
afterward in its normal filename-sorted position — so you only need to list the photos you're
actually reordering, not the whole gallery.

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
