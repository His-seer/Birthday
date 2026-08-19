# Birthday website

A static, single-page keepsake site. Rebuilt for 2026 as a multi-year "living"
site: the timeline is cumulative and carries forward, while the letter and the
things-list are replaced each year.

**Audience: one person.** It is never publicly shared, never indexed, and has no
sitemap.

---

## Quick reference

| | |
|---|---|
| Framework | Astro 7 (static output, no adapter) |
| Node | ≥ 22.12.0 |
| Host | Cloudflare Pages (free tier), direct upload |
| Images | sharp → AVIF + WebP via `astro:assets` |
| Video | ffmpeg → H.264/MP4 + VP9/WebM, poster per clip |
| Cost | **$0/year** — no custom domain, no paid services |

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # builds, copies media, runs all gates
npm run verify     # gates only, against an existing dist/
```

---

## How it is laid out

```
src/
  content/
    years/2026.json        PER-YEAR: letter, the N things, names, meta, gallery
    timeline/2025.json     CUMULATIVE: append-only, one file per year
    archive/2025.json      last year's letter. ROUTE-LESS by design (see below)
  content.config.ts        Zod schemas — these are enforced at build time
  components/  layouts/  pages/  styles/  lib/
scripts/
  intake.mjs        delivery folder -> masters (identify, dedupe, sort)
  images.mjs        masters -> src/assets (orient, downscale, strip EXIF)
  video.mjs         masters -> media/derived (transcode, poster, manifest)
  copy-media.mjs    media/derived -> dist/media
  verify.mjs        the build gates
  og.mjs            share card + favicons
media/                     GITIGNORED except manifest.json
  masters/<year>/          originals. Never served, never committed.
  masters/<year>/_originals/  pre-conversion HEIC. Read by no pipeline.
  derived/videos/<year>/   transcoded output, content-hashed filenames
  manifest.json            COMMITTED: what should exist, and its dimensions
  intake.plan.json         transient: the delivery triage you edit, then apply
```

**Media is never committed.** `media/manifest.json` is, so the build can verify
what should be present without the repo carrying ~40 MiB of video. If the
masters are missing, the pipeline fails loudly with a named list.

> **Back up `media/masters/`.** It is gitignored, so it exists only on this
> machine and in the client's Drive folder. If both are lost, the video is
> unrecoverable — the 2025 masters cannot be re-derived from the site.

---

## Editions

The site is a record of itself, not just its latest state. Each year keeps its
own **design**, not merely its own content, and a switcher in the footer moves
between them.

| Route | Edition | Design |
|---|---|---|
| `/` | 2026 | Keepsake — warm paper, Fraunces + Newsreader, burgundy |
| `/2025/` | 2025 | The original — slate + indigo, Playfair + Inter, spine timeline |

`/2025/` is **2025's design with 2026's hygiene**. The layout, palette and type
are last year's, deliberately including the things DESIGN.md criticised (the
64px hero at 1.6 leading, the indigo-marks-everything palette, the alternating
rail). What is *not* reproduced is the broken behaviour:

| Preserved | Fixed |
|---|---|
| 3D carousel, slate/indigo palette, Playfair + Inter | Photos uncropped — no more 800×600 landscape crops of portrait sources |
| Alternating spine-and-dots timeline, 15px cards | Every video is poster-first with `preload="none"` |
| Section order, copy and the original letter | No autoplay (2025 rotated every 4s with no pause — WCAG 2.2.2) |
| The 64px hero at 1.6 line-height | Controls have accessible names; counter is `aria-live` |
| The single large shadow on every surface | Arrow keys scoped to the carousel, not bound to `document` |
| — | **Swipe/drag added** — 2025 had no gesture at all, so a phone could only tap two small arrows |

Two further notes on fidelity:

- **The name is made consistent.** In 2025 the `<title>` said "Bryan", the hero
  said "Bruce" and the message said "Brucey". AUDIT H1 traced that to the admin
  panel silently dropping `messages`, so someone hand-edited the HTML and only
  got half of it. It was a bug, not a design decision, so it is not preserved.
- **No story text is invented.** All 14 timeline entries genuinely had
  `content: ""` in 2025 — they were title-only. The archive shows them that way
  rather than displaying placeholders.

The 2025 letter lives in `src/content/archive/2025.json` and is imported
**explicitly** by `src/pages/2025.astro` — it is deliberately *not* a content
collection, so no 2026 page can surface it by querying. The build gate that
blocks 2025 copy from appearing on a 2026 page is scoped to exempt `/2025/`
only.

### Adding next year's edition

Nothing about `/2025/` needs to change. When 2027 comes, `/` becomes the 2027
design and you either keep 2026 live at `/2026/` the same way, or leave `/` as
the only current edition. Add the new route to `editions` in
`src/components/YearSwitch.astro`.

---

## The yearly update

This is the whole job. It should take an afternoon.

### 1. Collect content

The client delivers photos and videos through a **Google Drive folder**.

> **Drive is a delivery channel only. Never reference it at runtime.**
> Do not hotlink, embed, iframe or fetch from Drive. Google blocks hotlinking
> and the workaround URLs are undocumented and break silently; there is no way
> to emit AVIF/WebP variants, `srcset`, poster frames, or cache headers; the
> video path is a branded Google iframe player, which directly contradicts the
> requirement that the poster frame is the visual; and the folder belongs to the
> client, so a rename or a permissions change takes the live site down with no
> warning.
>
> Download → optimise locally → serve assets we control. Always.

### 2. Drop the files in

```
media/masters/2027/photos/<anything>.jpg      -> photos/2027/<anything>
media/masters/2027/timeline/<slug>.mp4        -> timeline/2027/<slug>
media/masters/2027/hero/<slug>.mp4            -> the hero clip, not a timeline event
```

Output paths are derived **structurally** from the master path, so there is no
lookup table to maintain. Name timeline files after the moment
(`first-flight.mp4`), because that filename becomes the URL and the content id.

Deliveries never arrive in that shape — they arrive as a flat folder of
`IMG_####` files. `npm run intake` does the sorting it can and refuses to guess
the rest:

```bash
node scripts/intake.mjs ~/Downloads/2027     # scan: writes media/intake.plan.json
node scripts/intake.mjs --apply              # place the files as planned
```

The scan reads **content, not filenames**: true format from magic bytes, real
dimensions, duration, EXIF capture date, a sha256 so a file delivered twice is
caught once, and screenshot-vs-photo (iOS names screenshots `IMG_####.PNG`,
identically to photos, so only the absence of camera EXIF distinguishes them).

Then you edit `media/intake.plan.json` — `dest` and `slug` per file. That step
is not automatable: a timeline slug becomes a public URL, and no amount of
byte-reading knows a clip is `first-flight`. Photos are exempt and get a slug
immediately, because a gallery id is never user-visible.

`--apply` validates before it writes anything, and every failure is fatal:
an unreplaced `TODO-SLUG`, a slug that is still a camera-roll name, two files
claiming one target, a video bound for `photos/` (where `images.mjs` would skip
it silently), a still bound for `hero/`, or an existing master that would be
overwritten. It copies by default, so a wrong plan costs only disk; add
`--move` once you trust it.

Two things it handles that would otherwise pass unnoticed:

- **HEIC.** `SOURCE_RE` in `images.mjs` does not list `.heic`, and the loop
  `continue`s on a non-match — so an untouched HEIC is skipped with no error and
  no mention in the output. Intake converts to **PNG** (lossless, keeping the
  single lossy step in `images.mjs`) with EXIF rotation baked into the pixels,
  and keeps the original in `_originals/`. If no decoder on the machine can read
  HEIC, it says so and places nothing.
- **Extensions that lie.** The placed master's extension follows its bytes, so
  the JPEG-inside-a-`.PNG`-name of AUDIT H3.3 cannot survive intake.

### 3. Run the pipeline

```bash
npm run media
```

Idempotent — unchanged files are skipped via a content hash, so re-running is
cheap. It will:

- auto-orient, cap at 1800px long edge, and **strip EXIF including GPS**
- transcode H.264 (the compatibility floor) plus a VP9/WebM alternate
- **drop the VP9 when it is not smaller than the H.264, or would exceed the cap**
- extract a poster frame per clip at 10% in (avoids black first frames)
- write measured aspect ratios back into the timeline JSON
- update `media/manifest.json`

### 4. Add the content

**New year, new file** — copy `src/content/years/2026.json` to `2027.json` and
replace every value. Then add `src/content/timeline/2027.json` for the new
year's moments. Nothing else changes; no layout edits.

Then update the year constant in `src/pages/index.astro` and `scripts/og.mjs`.

Seed anything not yet written as `TODO-CONTENT`. The site builds and previews
with placeholders, and `npm run verify` reports how many are outstanding.

### 5. Ship

```bash
npm run build
npx wrangler pages deploy dist
```

---

## Why direct upload instead of a git-connected build

A git-connected Pages build can only see what is in the repo, so shipping video
that way would mean committing video. That is how the old repo's `.git` reached
153.89 MiB. Direct upload lets the build assemble `dist/` from the gitignored
`media/` tree, so the repo stays text-only while the deploy carries the bytes.

The trade: the yearly update is a local command rather than a `git push`. For a
site updated once a year by one person, that is the right way round.

---

## The build gates

`npm run build` runs `scripts/verify.mjs`. **Every check fails the build; none
of them warn.** Each exists because something specific went wrong in the 2025
site.

| Gate | Guards against |
|---|---|
| `assets` | Any file over 25 MiB — Cloudflare's **hard, unraisable** per-file cap. Over 20,000 files. |
| `budget` | Initial load > 500 KB, or JS > 50 KB. Fonts are counted. |
| `dimensions` | Any `<img>` without explicit `width`/`height`. CLS was measured at **0**; keep it there. |
| `video` | Any `<video>` without a `poster` or without `preload="none"`. |
| `thirdparty` | Any external origin in the built HTML. Should always be zero. |
| `privacy` | Missing `noindex`. |
| `a11y` | Missing `<main>`, missing skip link, or a `<button>` with no accessible name. |
| `contrast` | Any token pair below WCAG AA — **and `--brass` ever being used as a text colour** (it is 2.96:1, ornament only). |
| `media` | A file promised by `manifest.json` missing from the build. |
| `content` | **2025 archive copy appearing on a 2026 page.** |

That last one is worth spelling out: the 2025 letter lives in
`src/content/archive/2025.json`, which is deliberately **not in any collection
and not routed**, so no page can query it. The gate is the second line of
defence. A stale line from last year showing up in this year's gift is the worst
thing this site could do.

---

## Checks the build gates CANNOT make

The gates parse the built HTML. Three classes of bug are invisible to them and
have all actually shipped here at least once, so check them in a real browser
before deploying:

1. **Is the control actually clickable?** Not "does the handler work" —
   `element.click()` bypasses hit-testing entirely and will happily pass while a
   real click cannot land. The 2025 carousel's next arrow was covered by a
   rotated slide painting outside its stage; every scripted test passed and the
   button could not be pressed. Verify with
   `document.elementFromPoint(x, y)` at the control's centre, or click it yourself.
2. **Does the image actually appear?** An `<img>` can be present, correctly
   sized and passing every assertion while showing alt text. Deferring loads
   behind `display: none` caused exactly that.
3. **Vertical page scroll over a swipeable area.** The 2025 carousel handles
   horizontal gestures, and the guarantee that vertical still scrolls the page
   is `touch-action: pan-y` on `.c25__stage` plus an axis check that abandons
   the drag when the first movement is mostly vertical. Synthetic pointer
   events cannot exercise native scrolling, so this one needs a real thumb.
4. **Horizontal overflow at 375px.** There is deliberately no page-wide
   `overflow-x: hidden` (the 2025 site used one to mask real overflow), so
   anything that sticks out will genuinely scroll the page. Check
   `document.body.scrollWidth > document.documentElement.clientWidth` at phone
   width on every page.

## Current numbers

Measured on the 2026 build:

| | 2025 site | Now |
|---|---:|---:|
| Video (masters → deployed) | 117.0 MiB, untranscoded | **40.8 MiB** |
| Largest single file | 43.6 MiB | **17.4 MiB** |
| Video loaded before interaction | **2,395 KB** | **0 KB** |
| Initial payload | 806 KB images + 87 KB blocking Font Awesome | **254 KB** |
| JavaScript | 33 KB + confetti + Font Awesome | **2.8 KB** |
| Third-party origins | 3 | **0** |
| `npm audit` | 17 (1 critical, 12 high) | **0** |
| Tracked files | 3,186 | 30-ish |

---

## Things that are deliberate, so please do not "fix" them

- **Three different names.** The title page says "My Ish"; the things-list says
  "Bruce". Both come from `2026.json`. The 2025 site's Bryan/Bruce/Brucey
  mismatch was a bug; this year's variety is intentional.
- **The things-list count is derived from the array**, via
  `"{count} Things I love about {name}"`. With 24 entries it renders
  "24 Things I love about Bruce" exactly. Do not hardcode the number — the old
  site titled itself "23" over non-matching content.
- **The mobile menu uses `display: none` / `display: block`**, not a clever
  height transition. A grid `0fr → 1fr` version did not resolve and left the
  panel 1px tall. This is the one thing the audit found completely broken, so it
  gets the least clever implementation available.
- **No JPEG fallback.** WebP is at 96.09% support and covers everything AVIF
  misses (checked 2026-08-10), so a third format is dead weight.
- **H.264 is the last `<source>`, not the first.** AV1 is only 79% supported and
  Safari decodes it in hardware only, so it is not used at all; VP9 leads and
  H.264 is the guaranteed floor.
