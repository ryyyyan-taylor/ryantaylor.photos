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

Optional `gallery.json` inside a gallery folder:

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
