# Pre-Rebuild Audit — Birthday Website

**Audited:** 2026-08-10 · **Commit:** `d586ae4` · **Scope:** analysis only, no code changed.

---

## 0. Inventory (what this thing actually is)

| | |
|---|---|
| **Frontend** | Vanilla HTML + CSS + ES6 classes. No framework, no bundler, no transpiler. 3 HTML/CSS/JS pairs, hand-written. |
| **Backend** | Express 4.21.2 on Node (server runs on v24.19.0 locally). 3 files: [server.js](server/server.js), [routes/api.js](server/routes/api.js), [routes/upload.js](server/routes/upload.js). |
| **Data store** | A single JSON file, [server/content.json](server/content.json), read/written with `fs.readFileSync`/`writeFileSync`. No database. |
| **Build tool** | **None.** No bundler, minifier, or asset pipeline. `npm start` = `node server/server.js`. |
| **Package manager** | npm (`package-lock.json` v3, 257 packages). |
| **Tests** | None. `npm test` is `echo 'Tests coming soon'` ([package.json:9](package.json:9)). |
| **Lint/format** | None. No ESLint, Prettier, or editorconfig. |
| **Deploy target** | **Ambiguous — three of them.** [vercel.json](vercel.json) (Vercel), [Dockerfile](Dockerfile) (container), and [.github/workflows/keep-alive.yml:14](.github/workflows/keep-alive.yml:14) pings `bryan-birthday-1.onrender.com` (Render) every 10 min. Only Render is plausibly live. See **C4**. |

### Repo structure

```
├── public/                  ← served statically, and it is the whole frontend
│   ├── index.html           137 lines   main site
│   ├── admin.html           302 lines   admin panel (NO login)
│   ├── css/main.css         761 lines
│   ├── css/admin.css        696 lines
│   ├── js/main.js           774 lines   site logic, all global scope
│   ├── js/admin.js          741 lines   AdminPanel class
│   ├── js/colors.js          62 lines   ColorManager class
│   └── uploads/             141 MB of photos + video (committed to git)
├── server/                  Express app + content.json
├── node_modules/            72 MB — COMMITTED TO GIT
├── .env                     COMMITTED TO GIT (contains ADMIN_PASSWORD)
├── .idea/                   JetBrains project files, committed
├── CLAUDE.md · Implementation Guide.md · Instructions.md
└── (no .gitignore, no README)
```

**Unusual / dead / duplicated:**
- No `.gitignore` anywhere in the repo. This is the root cause of `node_modules/`, `.env`, and `.idea/` all being tracked.
- `.git` is **153.89 MiB**. Every clone pulls all of it.
- `main.css` and `main.js` are **indented 8 spaces on every line** — they were cut out of inline `<style>`/`<script>` blocks and pasted into files without re-indenting. `admin.css` is *not* (it starts at column 0), so the two files disagree stylistically.
- `Implementation Guide.md` (18 KB) and `Instructions.md` (8.6 KB) are AI-generation prompts/specs, not project docs. `CLAUDE.md` is a generic global engineering guide that does not describe this project.
- `public/uploads/photos/1757719764479-16522970.jpg` (3.2 MB) is orphaned — referenced by nothing, and byte-identical (`md5 599aca72…`) to `1757719634700-96114700.jpg`. It is a fossil of bug **H2**.
- `…433129-517609304.JPG` and `…433138-328068506.JPG` are byte-identical duplicates of each other (as are their `opt-` versions).

### Dependencies

| Package | Declared | Installed | Status |
|---|---|---|---|
| express | ^4.18.2 | 4.21.2 | v5 available; fine for now |
| multer | ^1.4.5-lts.1 | 1.4.5-lts.2 | **Deprecated by maintainer**: "Multer 1.x is impacted by a number of vulnerabilities, which have been patched in 2.x" |
| sharp | ^0.32.6 | 0.32.6 | **High** — inherits 4 libvips CVEs. Fix requires major bump to 0.35.3 |
| sqlite3 | ^5.1.6 | 5.1.7 | **UNUSED — zero `require()` anywhere.** Drags in `node-gyp` → `tar` (critical) → the whole native build chain |
| dotenv | ^16.3.1 | — | used |
| cors | ^2.8.5 | — | used, but wide open (see **C2**) |
| nodemon | ^3.0.1 (dev) | — | fine |

`npm audit`: **17 vulnerabilities — 1 critical, 12 high, 2 moderate, 2 low.** The critical is `tar` (arbitrary file write/overwrite via hardlink path traversal), reached only through the unused `sqlite3`. Deleting `sqlite3` removes the critical and several highs at zero cost.

---

## 1. What works / worth keeping

Genuinely good, and I'd carry these forward:

- **The content model is the right idea.** A single `content.json` describing photos, timeline, messages, and colors, with the frontend rendering from it, is the correct shape for this site. The *storage mechanism* is wrong (see H1/C4) but the schema is sound and worth porting as-is.
- **The timeline supports mixed media types** — `text`, `image`, `video`, `text_image`, `text_video` ([main.js:277-329](public/js/main.js:277)). That's a genuinely flexible content model and the switch is readable.
- **Sharp-based upload optimization is the right instinct.** Generating a derivative on upload rather than serving originals is correct. The parameters are wrong (**H3**) but the pipeline stays.
- **The default color palette passes WCAG AA.** I computed every default pairing — all pass:

  | Text | On | Ratio | Needs | |
  |---|---|---|---|---|
  | `#6366f1` hero/section titles | `#0f172a` | 4.00 | 3.0 (large) | PASS |
  | `#6366f1` section titles | `#1e293b` | 3.27 | 3.0 (large) | PASS |
  | `#cbd5e1` body/nav | `#0f172a` | 12.02 | 4.5 | PASS |
  | `#cbd5e1` timeline body | `#1e293b` | 9.85 | 4.5 | PASS |
  | `#f59e0b` message highlight | `#0f172a` | 8.31 | 4.5 | PASS |

- **CLS is genuinely fine — measured 0.** I instrumented `PerformanceObserver({type:'layout-shift'})` across a full scroll of the 10,544 px page: **zero shifts**. The carousel is immune by construction (items are `position:absolute` inside a fixed 400×300 box, [main.css:290-316](public/css/main.css:290)), and the hero video is exactly 1280×720 = 16:9, matching the placeholder's `aspect-ratio: 16/9` ([main.css:183](public/css/main.css:183)), so the swap doesn't move anything. **Do not spend rebuild effort on CLS.**
- **`html lang="en"` is set, and every `<img>` has an `alt` attribute.** The alt *text* is poor (**M1**) but the attribute discipline is there.
- **Semantic sectioning elements** (`<nav>`, `<section>`, `<h1>`/`<h2>`/`<h3>` in correct order, no skipped levels) — a decent base to build landmarks onto.
- **The `.reveal` scroll animation degrades safely.** It's currently disabled by an override (**M4**), which means content is visible even with JS off. Accidental, but the right end state.
- **The keep-alive workflow has `continue-on-error: true`** ([keep-alive.yml:16](.github/workflows/keep-alive.yml:16)) so it never spams failure notifications. Small thing, done right.
- **The written message content itself** ([index.html:119-124](public/index.html:119)) is the actual point of the site and is well-crafted. It's currently trapped in hardcoded HTML (**H1**) but the words are the deliverable.

---

## 2. Gaps & problems, ranked by impact

### CRITICAL

#### C1 — The admin panel and every write endpoint are completely unauthenticated
`ADMIN_PASSWORD=birthday2024` exists in [.env:4](.env:4) and is **referenced nowhere in the codebase** (grepped `server/` and `public/` — zero hits). There is no login form in [admin.html](public/admin.html), no session, no middleware, no token.

Anyone who loads `/admin` has full control:
- `POST /api/content` ([api.js:73](server/routes/api.js:73)) — overwrite all site content
- `POST /upload/photos`, `/upload/video`, `/upload/timeline`, `/upload/timeline-video` — write files to disk
- `DELETE /api/photos/:filename` ([api.js:84](server/routes/api.js:84)) — delete files

The site is publicly deployed at `bryan-birthday-1.onrender.com`. `/admin` is a guessable path.

#### C2 — Unauthenticated path traversal → arbitrary file deletion
[api.js:86-87](server/routes/api.js:86):
```js
const filename = req.params.filename;
const photoPath = path.join(__dirname, '../../public/uploads/photos', filename);
```
`req.params` is URL-decoded by Express, and `:filename` matches against the *encoded* path segment — so `%2F` passes the `[^/]+` segment match and then decodes to `/`. `path.join` happily resolves the `../`.

I verified this in an isolated Express harness (no filesystem writes, nothing deleted):

| Request | Decoded param | Resolves to |
|---|---|---|
| `DELETE /api/photos/opt-normal.JPG` | `opt-normal.JPG` | `…/public/uploads/photos/opt-normal.JPG` ✔ intended |
| `DELETE /api/photos/%2E%2E%2F%2E%2E%2F%2E%2E%2Fserver%2Fcontent.json` | `../../../server/content.json` | **`…/Birthday/server/content.json`** |
| `DELETE /api/photos/%2E%2E%2F%2E%2E%2F%2E%2E%2F.env` | `../../../.env` | **`…/Birthday/.env`** |
| `DELETE /api/photos/..%5C..%5C..%5Cpackage.json` | `..\..\..\package.json` | **`…/Birthday/package.json`** |

Combined with C1, an unauthenticated request deletes any file the Node process can reach. `app.use(cors())` ([server.js:11](server/server.js:11)) sets `Access-Control-Allow-Origin: *` (I confirmed the header on every response), so this is reachable cross-origin from any page on the internet.

#### C3 — Upload filter is bypassable → stored XSS on your own origin
[upload.js:40-46](server/routes/upload.js:40) validates `file.mimetype`, which is **client-supplied and unverified**. The stored filename keeps the client's extension: `uniqueSuffix + path.extname(file.originalname)` ([upload.js:31](server/routes/upload.js:31)).

So `POST /upload/video` with a file named `x.html` and `Content-Type: video/mp4` is written to `public/uploads/videos/<ts>.html`, and `express.static` ([server.js:13](server/server.js:13)) serves it as `text/html` on the site's own origin. The `/upload/video` path does no Sharp processing at all, so nothing fails. (On `/upload/photos`, Sharp throws — but multer has *already* written the file to disk before Sharp runs, so the payload persists anyway and the request just 500s.)

No auth, no rate limit, and `limits.fileSize` defaults to 100 MB ([upload.js:38](server/routes/upload.js:38)) — also a trivial disk-fill DoS.

#### C4 — The Vercel config cannot work with this architecture
[vercel.json](vercel.json) routes all traffic to `server/server.js` via `@vercel/node`. Three independent blockers:
1. **The app persists to the filesystem.** Every content save and upload does `fs.writeFileSync` to `content.json` or `public/uploads/`. Vercel's serverless filesystem is read-only outside `/tmp`, and `/tmp` is ephemeral per-invocation. The admin panel would fail or silently lose everything.
2. **`server.js` calls `app.listen()`** ([server.js:43](server/server.js:43)) instead of `module.exports = app`.
3. **Size.** 141 MB of uploads + 72 MB of `node_modules` is way past the serverless bundle limit.

Meanwhile `.dockerignore` excludes `node_modules` but the `Dockerfile` runs `npm ci --only=production` ([Dockerfile:11](Dockerfile:11)) — that path is coherent. And the GitHub Action pings Render. **Decide on one target in the rebuild.** The 10-minute keep-alive cron (144 runs/day, forever) is a workaround for Render free-tier cold starts.

#### C5 — Secrets and 226 MB of junk are committed to git
No `.gitignore` exists. Consequently:
- **[.env](.env) is tracked**, including `ADMIN_PASSWORD=birthday2024`. Treat that password as public and rotate it (though per C1 it isn't used anywhere, so nothing currently depends on it).
- **`node_modules/` is tracked** — 72 MB, 2,449 files, including compiled `.dll`/`.node` native binaries.
- `.idea/` (JetBrains config) is tracked.
- `.git` is **153.89 MiB**.

This actively breaks tooling: **`npm ci` fails outright in this repo** —
```
npm error code EPERM
npm error syscall unlink
npm error path C:\...\node_modules\sharp\build\Release\libglib-2.0-0.dll
npm error [Error: EPERM: operation not permitted, unlink ...]
```
`npm ci` wipes `node_modules` first, and the committed native DLLs are locked by any running server process. A clean install in an empty directory works fine (**31s, 257 packages**), which confirms the lockfile itself is healthy — the repo state is what's broken.

---

### HIGH

#### H1 — Saving anything in the admin panel silently destroys your messages and colors
This is the bug that explains the site's current state.

[admin.js:540-552](public/js/admin.js:540):
```js
async saveContent() {
    const content = {
        photos: this.photos,
        video: this.video,
        timeline: this.timeline        // ← messages and colors are NOT included
    };
    await this.saveContentData(content);
}
```
And the server does a **full overwrite with no merge** ([api.js:75-76](server/routes/api.js:75)):
```js
const content = req.body;
fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2));
```

`saveContent()` is called from **nine** ordinary actions: `updatePhotoCaption`, `updatePhotoDate`, `addTimelineEvent`, `updateTimelineEvent`, `handleTimelineImageUpload`, `handleTimelineVideoUpload`, `removeTimelineImage`, `removeTimelineVideo`, `deleteTimelineEvent`. `deleteVideo()` ([admin.js:400](public/js/admin.js:400)) has the same defect.

So: save your messages → later edit one timeline caption → **messages are gone forever.**

**The live data proves it happened.** [content.json](server/content.json) has exactly three keys — `photos`, `video`, `timeline`. There is **no `messages` key and no `colors` key**, even though [api.js:32-55](server/routes/api.js:32) seeds both with rich defaults.

Downstream consequences, all currently visible:
- `updateMessages(content.messages || {})` ([main.js:10](public/js/main.js:10)) receives `{}` and every field is guarded by `if (messages.x)`, so **the entire Messages tab is inert.** The hardcoded HTML wins.
- `ColorManager` ([colors.js:13](public/js/colors.js:13)) gets `content.colors || {}` → **the entire Colors tab is inert.** Every picker, all four presets, the save button: no effect on the live site.
- **The name on the site is inconsistent**, and it's not cosmetic — it's this bug. I read it live from the DOM:
  - `document.title` → `"Happy Birthday Bryan 🎉"` ([index.html:6](public/index.html:6))
  - `.logo` → `"Happy Birthday Bryan 🎉"` ([index.html:15](public/index.html:15))
  - `.hero-title` → **`"Happy Birthday Bruce!"`** ([index.html:31](public/index.html:31))
  - `.message-title` → **`"Happy Birthday, Brucey! 🎂"`** ([index.html:114](public/index.html:114))

  Someone edited the hero to "Bruce" by hand in the HTML — presumably *because* the admin panel wouldn't hold the change.

#### H2 — Deleting a photo leaks the original file forever
[admin.js:388](public/js/admin.js:388) sends `photo.optimized`; [api.js:87-91](server/routes/api.js:87) deletes only that one path. The `original` file is never unlinked, though the JSON record for both is removed ([api.js:96-98](server/routes/api.js:96)).

Result: the original becomes unreachable garbage. `1757719764479-16522970.jpg` (3.2 MB, orphaned, no `opt-` twin) is exactly this — a duplicate upload that was deleted through the panel, leaving the original stranded.

#### H3 — The image pipeline is destroying the photos
[upload.js:64-67](server/routes/upload.js:64):
```js
await sharp(file.path)
    .resize(800, 600, { fit: 'cover', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(optimizedPath);
```
Four separate problems, all confirmed by reading actual file metadata with Sharp:

1. **Portrait phone photos are center-cropped into landscape.** Sources are `1179×2556`, `1170×2532`, `1242×2208`, `4284×5712` — all tall portrait. Forcing `fit:'cover'` to 800×600 landscape keeps roughly the middle third of the frame and throws the rest away. On a 1179×2556 source that discards ~65% of the image height. **Heads get cut off.** The original is retained on disk, so this is recoverable — but every displayed photo is currently a bad crop.
2. **`withoutEnlargement` breaks the aspect contract.** `opt-1757719756010-251152830.JPG` came out **586×600**, not 800×600, because its source was only 586×780. So one carousel item has a different aspect than the other 13.
3. **JPEGs are written into `.PNG` filenames.** `.jpeg()` always encodes JPEG, but the output name is `'opt-' + file.filename` ([upload.js:60](server/routes/upload.js:60)), preserving the source extension. I confirmed end-to-end: `GET /uploads/photos/opt-1757719432997-98018199.PNG` returns `Content-Type: image/png`, while the file's magic bytes are `ff d8 ff db` — **JPEG**. Browsers sniff and cope; CDNs, caches, and image tooling may not.
4. **No modern formats, no responsive sizes.** One 800×600 JPEG per photo. No WebP/AVIF, no `srcset`.

#### H4 — Every video on the page starts loading immediately
This is the single biggest performance problem, and I measured it in the browser.

[main.js:291-293](public/js/main.js:291) and [313-315](public/js/main.js:313) emit `<video controls>` with **no `preload` attribute and no `poster`**. There are 14 timeline entries; 10 are videos. Plus the hero video. I confirmed in the live DOM:

```
videoCount: 11
videoPreloadAttrs: ["metadata", null, null, null, null, null, null, null, null, null, null]
videosWithoutPoster: 11
```

On load, the browser fires range requests at **all eleven**:
```
GET /uploads/videos/1757718984099-644470116.mp4        → 206 Partial Content
GET /uploads/timeline/1757720098585-136959288.MP4      → 206 Partial Content
GET /uploads/timeline/1757720148345-603308022.MP4      → 206 Partial Content
… (8 more) …
GET /uploads/timeline/1757720647070-179355653.mp4      → 206 Partial Content
```

**Measured: 2,395 KB of video transferred before any interaction** — on localhost, just for metadata. `loadEventEnd` was **5,418 ms with zero network latency**. On a phone over 4G this is dramatically worse.

The underlying files:

| | Size |
|---|---|
| Timeline videos (10) | **91.6 MiB** — largest single file `1757720647070-179355653.mp4` at **43.6 MiB** ("23 Reasons Why….") |
| Hero video | **25.3 MiB** |
| **Total video** | **~117 MiB** |

None of it is transcoded, none has a poster frame, none is lazy.

#### H5 — Everything on the critical path is render-blocking, and no compression is enabled
Measured from `PerformanceResourceTiming` and raw response headers:

| Resource | Weight | Status |
|---|---|---|
| Font Awesome CSS ([index.html:8](public/index.html:8)) | **87 KB decoded** | `renderBlockingStatus: "blocking"` — for **6 icons** on the entire page |
| Google Fonts CSS ([index.html:7](public/index.html:7)) | 14 KB | `renderBlockingStatus: "blocking"` |
| `confetti.browser.min.js` ([index.html:134](public/index.html:134)) | — | `defer: false, async: false` |
| `colors.js`, `main.js` ([index.html:135-136](public/index.html:135)) | 33 KB | `defer: false, async: false` |

- **Resource hints: NONE.** No `preconnect`, `dns-prefetch`, or `preload` for any of the three third-party origins (`fonts.googleapis.com`, `cdnjs.cloudflare.com`, `cdn.jsdelivr.net`, plus `fonts.gstatic.com` for the font files). Each costs a fresh DNS + TLS handshake on the critical path.
- **No compression middleware.** I requested `/css/main.css` with `Accept-Encoding: gzip, br` and got back `Content-Length: 20861` with **no `Content-Encoding` header**. All CSS/JS/HTML ships uncompressed.
- **No cache policy.** Every asset returns `Cache-Control: public, max-age=0` (Express static's default) — including 117 MiB of immutable, content-hashed-by-timestamp media. Every visit revalidates everything.
- `X-Powered-By: Express` is exposed on every response (no `helmet`).

#### H6 — The mobile menu does not work at all
Confirmed live at a mobile viewport. [main.css:669-671](public/css/main.css:669) hides the nav below 768px:
```css
@media (max-width: 768px) { .nav-menu { display: none; } }
```
[main.js:670-672](public/js/main.js:670) toggles a class:
```js
mobileMenuToggle.addEventListener('click', () => { navMenu.classList.toggle('active'); });
```
**There is no `.nav-menu.active` rule in any stylesheet.** I enumerated every rule matching `nav-menu` across all loaded sheets — the result was exactly `[".nav-menu"]`.

Clicking the hamburger live:
```
navMenuDisplay:                    "none"
navMenuHasActiveClass:             true      ← class applied
navMenuDisplayAfterToggleClick:    "none"    ← still hidden
```
**On mobile the site has no working navigation whatsoever.** The hamburger is also a 21×28 px tap target (WCAG 2.5.8 minimum is 24×24; 44×44 recommended).

#### H7 — Page initialization runs twice
[main.js:766-775](public/js/main.js:766):
```js
document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('loading');
    initializeWebsite();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWebsite);   // ← second listener
} else {
    initializeWebsite();
}
```
`main.js` is a plain non-deferred `<script>`, so at execution time `readyState === 'loading'` is always true. **Both listeners register; both fire.**

Confirmed in the console — the banner prints twice:
```
[log] Birthday website initialized! 🎉
[log] Birthday website initialized! 🎉
```
And the network log shows `/api/content` fetched **three times** on a single page load (twice from the doubled `loadContent()`, once from `ColorManager` in [colors.js:10](public/js/colors.js:10)):
```
GET http://localhost:3005/api/content → 200 OK
GET http://localhost:3005/api/content → 200 OK
GET http://localhost:3005/api/content → 200 OK
```
Everything downstream doubles too: the carousel rebuilds twice, reveal observers attach twice, two independent confetti timers roll.

---

### MEDIUM

#### M1 — Accessibility gaps (measured live)
- **No accessible name on three of four buttons.** Icon-only, no `aria-label`:
  ```
  {cls: "mobile-menu-toggle",        name: "(EMPTY — icon only)"}
  {cls: "carousel-btn carousel-prev", name: "(EMPTY — icon only)"}
  {cls: "carousel-btn carousel-next", name: "(EMPTY — icon only)"}
  {cls: "celebrate-button",           name: "Celebrate!"}          ← the only good one
  ```
- **No focus styles at all.** I searched every rule in every stylesheet for `:focus` / `:focus-visible` — zero matches. Keyboard users cannot see where they are.
- **No landmarks.** `<main>`: 0, `<header>`: 0, `<footer>`: 0. All 4 `<section>`s are unlabelled. No skip link.
- **All 14 carousel images share the identical alt text `"Memory photo"`** — non-descriptive and useless repeated 14 times. Timeline images use the event title as alt ([main.js:282](public/js/main.js:282)), which is better.
- **Carousel autoplays every 4 s with no pause control** ([main.js:198-200](public/js/main.js:198)) — WCAG 2.2.2 (Pause, Stop, Hide) failure. No pause on hover or focus either.
- **`prefers-reduced-motion` is not honoured anywhere** — zero occurrences across the whole `public/` tree. The site runs an infinite hero float animation, a 4 s carousel rotation, confetti, and a fireworks canvas regardless.
- **11 `<video>` elements, none with a `<track>`** for captions.
- **Global keyboard hijacking:**
  - [main.js:43-46](public/js/main.js:43) — `ArrowLeft`/`ArrowRight` are captured on `document` and always move the carousel, even when the carousel is off-screen and even while focus is in a text field.
  - [main.js:681-684](public/js/main.js:681) — `Space` calls `preventDefault()` and launches celebration, **breaking spacebar page-scroll**, one of the most common keyboard interactions on the web.
- `carouselCounter` has no `aria-live`, so slide changes are silent to screen readers.

#### M2 — The "Elegant" color preset renders text invisible
[admin.js:654-664](public/js/admin.js:654) sets `heroTextColor`/`sectionTitleColor` to `#1f2937` on the `#0f172a` / `#1e293b` backgrounds:

| Pairing | Ratio | Needs | |
|---|---|---|---|
| `#1f2937` on `#0f172a` (hero) | **1.22** | 3.0 | FAIL |
| `#1f2937` on `#1e293b` (gallery) | **1.00** | 3.0 | FAIL — *literally identical luminance; the text vanishes* |

Currently harmless only because the Colors tab is inert (**H1**). Fixing H1 without fixing this ships an invisible-text preset.

#### M3 — Responsive design is one breakpoint and a fixed-size carousel
[main.css](public/css/main.css) has exactly **one** `@media` query, at 768px ([main.css:668](public/css/main.css:668)). (`admin.css` has three — 1024/768/480 — so the admin panel is *better* covered than the public site.)

There is no tablet treatment. And the carousel is hard-coded in pixels ([main.css:290-306](public/css/main.css:290)):
```css
.carousel-3d   { width: 400px; height: 300px; }
.carousel-item { width: 300px; height: 225px; margin-left: -150px; margin-top: -112.5px; }
```
Measured at a **1440×900** viewport:
```
carousel3d:        "400x300"     ← never grows
carouselContainer: "800x407"
sectionContainer:  "1200x563"
```
A 400×300 carousel stranded inside a 1200px container on a desktop display. The nav buttons are pinned to the *container* edges ([main.css:376-386](public/css/main.css:376)), leaving them ~200px away from the carousel they control.

`body { overflow-x: hidden }` ([main.css:35](public/css/main.css:35)) papers over horizontal overflow rather than fixing it. (To be fair: I found no elements actually exceeding the viewport at mobile width — so this is a latent smell, not an active bug.)

Tap targets under 44px: hamburger 21×28, carousel prev/next 40×40.

#### M4 — The scroll-reveal system is dead, killed by an override
[main.css:748-762](public/css/main.css:748) — the last four lines of the file:
```css
.reveal        { opacity: 0; transform: translateY(30px); transition: all 0.6s ease-out; }
.reveal.active { opacity: 1; transform: translateY(0); }

.reveal {                                   /* ← added later, wins on both specificity tie + !important */
    opacity: 1 !important;
    transform: translateY(0) !important;
}
```
Confirmed live: 18 `.reveal` elements, **0 with `opacity: 0`**. The entire `IntersectionObserver` machinery ([main.js:625-643](public/js/main.js:625)), `observeRevealElements()`, and the staggered reveal loop ([main.js:756-762](public/js/main.js:756)) are dead code. Someone hit a bug where content stayed invisible and disabled the feature with `!important` instead of fixing it. Either restore it properly or delete ~40 lines of JS and 15 of CSS.

#### M5 — XSS sinks throughout the rendering layer
All user/admin-supplied strings go into `innerHTML` unescaped. 5 sites in `main.js`, 8 in `admin.js`:
- [main.js:93](public/js/main.js:93) — `photo.caption` into markup
- [main.js:280](public/js/main.js:280), [289](public/js/main.js:289), [301](public/js/main.js:301), [326](public/js/main.js:326) — `event.title` / `event.content`
- [admin.js:248](public/js/admin.js:248) — `value="${photo.caption || ''}"` — an unescaped **HTML attribute**; a single `"` breaks out
- [admin.js:298](public/js/admin.js:298) — same for `event.title`

Today's data is safe (titles use curly `’` apostrophes, which don't terminate attributes). But combined with **C1** and **C3**, anyone can write the payload. `textContent` is used correctly in `updateMessages` ([main.js:345-391](public/js/main.js:345)) — the right pattern already exists in the codebase, just not applied consistently.

#### M6 — Main-thread cost and always-on animation
Measured **471 ms of long tasks** in a 3-second idle sample: `[123ms, 80ms, 268ms]`. That's a direct TBT/INP problem. Contributors:
- [main.js:688-694](public/js/main.js:688) — a `setInterval` firing **forever, every 10 s**, that randomly reassigns `--primary`:
  ```js
  setInterval(() => {
      if (Math.random() > 0.95) {
          const colors = ['#6366f1', '#8b5cf6', '#f59e0b', '#10b981'];
          document.documentElement.style.setProperty('--primary', colors[...]);
      }
  }, 10000);
  ```
  Because `--hero-text-color`, `--section-title-color`, `--timeline-dot-color` and `--timeline-line-color` all resolve to `var(--primary)` ([main.css:16-20](public/css/main.css:16)), the hero title and every section title **randomly change colour while you read**. Confirmed the hero `::before` `float` animation also runs infinitely.
- **Two separate `window` scroll listeners** ([main.js:649](public/js/main.js:649) and [707](public/js/main.js:707)). The first writes inline styles on the navbar on *every* scroll event with no rAF throttle, forcing style recalculation. The second, `updateScrollEffects`, is an empty rAF shell that does nothing.
- Mutation-during-iteration in two places: [main.js:586-589](public/js/main.js:586) (`fireworks.splice()` inside `fireworks.forEach()`) and [main.js:591-598](public/js/main.js:591) (`particles.splice(index,1)` inside `particles.forEach()`). Classic index-skipping — some particles never get cleaned up.

#### M7 — All 14 carousel photos download, but only 3 are ever visible
`loadPhotos` ([main.js:87-103](public/js/main.js:87)) injects every photo into the DOM. `updateCarousel` ([main.js:140-153](public/js/main.js:140)) gives 3 items `active`/`prev`/`next` and the other 11 `.hidden` — which is `opacity: 0`, not `display: none` ([main.css:346-350](public/css/main.css:346)). Hidden ≠ not downloaded.

Measured: **806 KB of images fetched**, and most render at **53×40 px** from an 800×600 source. `loading="lazy"` is set, but it only defers until scroll — it doesn't reduce the count.

#### M8 — SEO and share previews are entirely absent
[index.html:4-9](public/index.html:4) contains only `charset` and `viewport`. I grepped the whole `public/` tree for `og:`, `twitter:`, `favicon`, `name="description"`, `robots`, `canonical` — **zero matches**.

Missing: `<meta name="description">`, all Open Graph tags, all Twitter Card tags, **any favicon** (browsers show a blank/default icon), `canonical`, `robots.txt`, `sitemap.xml`. For a link that gets shared in WhatsApp/iMessage — which is the entire distribution model for a gift site — **the share preview is blank**. This is the highest-visibility item in the Medium tier.

---

### NICE-TO-HAVE

#### N1 — Dead code and leftovers
- [main.js:721-726](public/js/main.js:721) — `preloadImages()` defined, never called.
- [main.js:696-707](public/js/main.js:696) — `updateScrollEffects()` is an empty rAF wrapper wired to a scroll listener.
- [main.js:715-718](public/js/main.js:715) — `touchmove` handler computes `touchDiff` and discards it.
- [main.js:646,662](public/js/main.js:646) — `lastScrollY` assigned, never read.
- [index.html:115-118](public/index.html:115) — 4 lines of commented-out message markup.
- [index.html:36](public/index.html:36) — `<source src="#">` left in the hero video; `checkVideoSource()` ([main.js:415](public/js/main.js:415)) then has to compare against `window.location.href + '#'` to detect it.
- **15% of `main.css` is unused** — 13 of 86 rules never match, all from the abandoned `.gallery-grid` fallback and `.carousel-item-overlay`: `.gallery-item`, `.gallery-image`, `.gallery-overlay`, `.gallery-caption`, `.gallery-placeholder`, `.carousel-item-caption`, `.play-overlay.hidden`, `.timeline-content p`, and their `:hover` variants.
- [api.js:9-59](server/routes/api.js:9) — `initContentFile()` seeds `messages` and `colors` that, per **H1**, get wiped on first save. 50 lines of defaults that never survive.

#### N2 — Duplicated and redundant assets
- 15 originals (**23.7 MB**) are never referenced by the frontend — only the `opt-` derivatives are ([main.js:97](public/js/main.js:97)). Worth keeping as masters, but they should not sit in `public/`, where they are publicly downloadable and inflate the deploy.
- Two byte-identical photo pairs (see §0).
- `content.json` stores a `date` per photo ([content.json:7](server/content.json:7)) that no frontend code ever renders.
- All 14 timeline entries have `"content": ""` — the text field is unused in practice.

#### N3 — Operational and DX gaps
- **No README.** A future you, a year from now, has `Implementation Guide.md` and `Instructions.md` (both AI prompts) and a generic `CLAUDE.md`. Nothing says how to run, deploy, or update this.
- No tests, no linting, no formatting, no CI beyond the keep-alive ping.
- `express.static('public')` ([server.js:13](server/server.js:13)) and the multer destinations ([upload.js:14-20](server/routes/upload.js:14)) use paths **relative to `process.cwd()`**, not `__dirname`. Works only when launched from the repo root. `sendFile` correctly uses `__dirname` ([server.js:35](server/server.js:35),[40](server/server.js:40)) — so the codebase is inconsistent with itself.
- [server.js:16](server/server.js:16) creates `photos` and `videos` upload dirs but **not `timeline`**, which is created lazily in [upload.js:23-25](server/routes/upload.js:23).
- `NODE_ENV=development` is committed in [.env:2](.env:2).
- Errors are returned raw to the client: `res.status(500).json({ error: error.message })` ([api.js:68](server/routes/api.js:68),[79](server/routes/api.js:79),[103](server/routes/api.js:103)) leaks filesystem paths.
- `clearAllPhotos` ([admin.js:415-417](public/js/admin.js:415)) issues N sequential awaited DELETEs; `deletePhoto` ([admin.js:388](public/js/admin.js:388)) never checks `response.ok`, so failures report success.
- 14 inline `onclick=`/`onchange=` handlers in `admin.js` depend on a global `admin` binding ([admin.js:739-742](public/js/admin.js:739)) — brittle, and incompatible with any CSP.
- **Concurrency:** `content.json` is written with `writeFileSync` from multiple endpoints with no locking. Two simultaneous saves interleave and one is lost.

#### N4 — Where the "yearly update" hurts
You will do this again next birthday. Today that means:
1. Editing the name means touching **hardcoded HTML in 4 places** ([index.html:6](public/index.html:6),[15](public/index.html:15),[31](public/index.html:31),[114](public/index.html:114)) — because the admin panel's Messages tab doesn't persist (**H1**). The site currently disagrees with itself: "Bryan" in the title and logo, "Bruce"/"Brucey" in the hero and message.
2. The personal message is 6 hardcoded `<p>` tags ([index.html:119-124](public/index.html:119)), but `updateMessages` only maps **3** of them (`messageText1..3`, [main.js:383-387](public/js/main.js:383)). Lines 4-6 are unreachable from the admin panel by design.
3. `messageHighlight` targets `querySelector('.message-highlight')` — **singular** ([main.js:377](public/js/main.js:377)) — but the HTML has **two** ([index.html:123-124](public/index.html:123)). The second can never be edited.
4. Adding a photo re-runs the destructive 800×600 crop (**H3**).
5. There is no way to archive last year's content and start fresh — one `content.json`, one timeline.

---

## 3. Recommendations for the rebuild

Ordered so that each step unblocks the next. Every item names the gap it closes.

### Phase 1 — Stop the bleeding (do this before anything else, on the *current* site)

These are worth doing even if the rebuild takes months, because the site is live.

1. **Add a `.gitignore`** (`node_modules/`, `.env`, `.idea/`, `public/uploads/`) → **C5**. Then `git rm -r --cached node_modules .env .idea`. Rotate `birthday2024` and treat it as burned. Purging history (`git filter-repo`) will take `.git` from 154 MiB to a few MB — do it before the repo is cloned anywhere else.
2. **Put auth in front of `/admin` and every mutating route** → **C1**. For a site like this, one `requireAuth` middleware reading a bcrypt-hashed password from a real env var, guarding `POST /api/content`, all four `/upload/*` routes, `DELETE /api/photos/*`, and `GET /admin`, is sufficient. Do not rely on the path being unguessable.
3. **Fix the traversal** → **C2**: `const safe = path.basename(req.params.filename)`, then verify the resolved path is still inside the uploads directory before unlinking. Lock CORS to your own origin instead of bare `cors()` → **C5/C2**.
4. **Fix `saveContent()`** → **H1**. Two changes: include `messages` and `colors` in the payload ([admin.js:541](public/js/admin.js:541)), and make the server **merge** rather than overwrite ([api.js:75](server/routes/api.js:75)) — `{...existing, ...req.body}`. The merge is the durable fix; do both.
5. **Add `preload="none"` and a `poster` to every timeline video** → **H4**. This is a two-line change in [main.js:291](public/js/main.js:291)/[313](public/js/main.js:313) and by itself removes ~2.4 MB and several seconds from every page load.
6. **Delete `sqlite3`** → removes the critical `tar` CVE and several highs for free, since nothing imports it. Then `npm audit fix`, and bump `multer` to 2.x and `sharp` to 0.35.x deliberately.
7. **Reconcile the name** → **N4/H1**. Decide on "Bryan" or "Brucey" and make [index.html:31](public/index.html:31) and [114](public/index.html:114) agree with the title and logo.

### Phase 2 — Architecture for the rebuild

8. **Pick one deploy target and design for it** → **C4**. The app's defining constraint is that it *writes to disk*. Two coherent options:
   - **Keep it stateful** (Render/Fly/a VPS with a persistent volume). Smallest change from today; keeps the JSON-file model; the `Dockerfile` already fits. The keep-alive cron becomes unnecessary on a paid tier.
   - **Go static + external storage** (Vercel/Netlify). Media moves to object storage (S3/R2/Cloudinary) or is committed as build-time content; content becomes a build-time JSON import. This is the better fit for a site that changes once a year and is read-only 364 days of it, and it makes the site free to host and permanently fast.

   Given the update cadence, **I'd recommend the second**: a static build (Astro or plain Vite) with content in a JSON/MDX file, plus an optional local-only admin for editing. The "admin panel on a live server" model is what created C1, C2, C3, and C4 in the first place.
9. **Componentize the render layer** → **M5/N4**. The `updateTimeline` if/else chain ([main.js:270-336](public/js/main.js:270)) becomes one `TimelineItem` component with a media slot. Use `textContent`/JSX escaping instead of `innerHTML` template concatenation — that closes the XSS class structurally rather than by escaping at 13 call sites.
10. **Make content fully data-driven** → **N4**. No name, message, or heading in markup. `messages` should be an *array* of paragraphs, not `messageText1..3` — that alone fixes the 6-paragraphs-but-only-3-editable and two-`.message-highlight` bugs. Consider a per-year content file (`content/2026.json`) so past years archive instead of being overwritten.
11. **Add a real build step** → §0. Any bundler gives minification, hashed filenames (which makes far-future `Cache-Control: immutable` safe → **H5**), and dead-code elimination. Self-host the two fonts and **replace Font Awesome with 6 inline SVGs** — that removes 87 KB of render-blocking CSS and two third-party origins from the critical path.

### Phase 3 — Media pipeline (the biggest single win)

12. **Rebuild the image pipeline from the retained originals** → **H3**. Specifically: drop `fit:'cover'` for a contain/smart-crop strategy that respects portrait orientation; always write the correct extension for the encoded format; emit AVIF + WebP + JPEG at 2-3 widths with `srcset`/`sizes`; and set explicit `width`/`height` on every `<img>` so the good CLS you have today survives the rebuild. The originals are all still on disk, so **the bad crops are fully recoverable.**
13. **Transcode the videos** → **H4**. 117 MiB is the whole ballgame. H.264/AVC at a sane bitrate plus a WebM/AV1 alternate, capped at 1080p, with a generated poster frame per video, will cut this by an order of magnitude. The 43.6 MiB `1757720647070` file alone deserves individual attention. Serve from a CDN or object storage, never from the app server.
14. **Move `public/uploads/` out of the repo and out of `public/`** → **C5/N2**. Originals are masters, not web assets; the 23.7 MB of unreferenced originals should not be publicly downloadable.
15. **Enable compression and caching** → **H5**. `compression` middleware (or CDN-level), plus `Cache-Control: public, max-age=31536000, immutable` on hashed assets. Add `helmet` for security headers and to drop `X-Powered-By`.

### Phase 4 — Quality

16. **Accessibility pass** → **M1**: `aria-label` on the three icon-only buttons; a visible `:focus-visible` ring; `<main>` + labelled sections + a skip link; per-photo alt text (the `caption` field already exists and is empty — populate it and use it); `aria-live="polite"` on the carousel counter; a pause control and pause-on-hover/focus for autoplay; and a `@media (prefers-reduced-motion: reduce)` block that disables the hero float, carousel autoplay, confetti, and fireworks. Scope the arrow-key handler to the carousel and **drop the spacebar hijack** ([main.js:681](public/js/main.js:681)) — it breaks page scrolling.
17. **Real responsive layout** → **M3**. Replace the fixed-pixel carousel with a fluid one (`clamp()`/`aspect-ratio`/container queries) and add a tablet breakpoint. Remove `overflow-x: hidden` once the underlying overflow is actually gone. Bring tap targets to ≥44×44.
18. **Add meta and share tags** → **M8**. Description, Open Graph (`og:title`, `og:description`, `og:image`), Twitter Card, and a favicon. Generate a dedicated share image — this is what people see when the link is sent, and it's currently blank. Cheap, high-visibility.
19. **Decide on the reveal animation** → **M4**. Restore it properly (behind `prefers-reduced-motion`) or delete the ~55 dead lines. Do not leave the `!important` override in place.
20. **Fix or drop the color system** → **M2/H1**. If you keep it, remove the "Elegant" preset or fix its 1.00:1 contrast, and add a contrast check when a custom color is picked. Delete the random `--primary` `setInterval` ([main.js:688](public/js/main.js:688)) regardless — it's an unintentional bug, not a feature.
21. **Housekeeping** → **N1/N3**: delete the dead functions and unused CSS; write a real README (run, deploy, how to do next year's update); replace the AI-prompt markdown files; use `__dirname`-relative paths consistently; and add a smoke test that loads `/` and `/api/content` so the yearly update has a safety net.

---

### If you only do five things

1. **Auth + traversal fix** (**C1**, **C2**) — the site is publicly writable and deletable right now.
2. **`.gitignore` + purge `.env`/`node_modules` from history** (**C5**) — and rotate the password.
3. **`preload="none"` + posters on 11 videos** (**H4**) — biggest perf win for the least work.
4. **Fix `saveContent()` dropping `messages`/`colors`** (**H1**) — this is why the admin panel doesn't work and why the site says "Bruce".
5. **Add OG tags + a favicon** (**M8**) — the link is shared; the preview is blank.

---

### Notes on method

Findings were verified against the running application, not inferred from source alone:

- Booted the Express app and inspected real response headers (`Cache-Control`, absent `Content-Encoding`, `Content-Type` vs. magic bytes, `Access-Control-Allow-Origin`).
- Loaded the site in a browser and read the console, network log, `PerformanceResourceTiming`, `PerformanceObserver` (`layout-shift`, `longtask`), and the live DOM/CSSOM at mobile (375px) and desktop (1440px) viewports.
- Read image dimensions and formats directly via Sharp; confirmed duplicates by MD5.
- Confirmed the path traversal in an **isolated** Express harness that only reported resolved paths — no files were deleted and no data was modified.
- Contrast ratios computed per the WCAG 2.1 relative-luminance formula.

One incident worth recording: running `npm ci` to test build health **deleted 2,449 tracked files** from `node_modules/` before failing on a locked Sharp DLL — a direct consequence of **C5**. The working tree was restored with `git restore -- node_modules` and verified clean (`git status` shows only the pre-existing untracked `.claude/`). No project files were modified by this audit.
