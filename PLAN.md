# PLAN.md — Birthday Website 2026 (2nd annual edition)

**Written:** 2026-08-10 · **Status:** awaiting sign-off · **No feature code written.**

Deliverable location on approval: repo root as `PLAN.md`.

---

## Context

Last year's site is a stateful Express app with an unauthenticated admin panel, a
publicly writable and publicly deletable API, 117 MiB of untranscoded video loading on
page load, and a timeline the client explicitly rejected. It is live right now at
`bryan-birthday-1.onrender.com`.

This rebuild makes the site **static**, makes it **multi-year and cumulative**, and
inverts the ratio both audits flagged: 78% of the old page was the rejected timeline, 7%
was the letter that is the actual gift.

Four decisions you made before this plan was written, now baked in:

| Decision | Choice |
|---|---|
| Palette | **DESIGN.md "Keepsake"** (`#F6F2EC` / `#2A2724` / `#6E1A2B`) |
| Video hosting | **Cloudflare Pages only, $0** — no R2, no domain purchase |
| Timeline | **Keep it cumulative, invert the proportion** — letter becomes the spine |
| Old site | **Take down entirely** |

---

## 1. Step 2 verification findings

All checked **2026-08-10**. Three findings materially contradict the brief. Two more
contradict AUDIT.md. Each is flagged **⚠ DIFFERS**.

### 1.1 Cloudflare Pages free tier

Source: <https://developers.cloudflare.com/pages/platform/limits/> (page states Last Updated 2026-07-16)

| Item | Brief said | Verified | |
|---|---|---|---|
| Per-file asset cap | 25 MiB | **25 MiB** | ✅ confirmed |
| Files per deployment | 20,000 | **20,000** (free) | ✅ confirmed |
| Builds/month | — | **500/mo**, 1 concurrent, 20-min timeout | — |
| Bandwidth | — | **Unmetered** | — |
| Custom domains | — | 100/project | — |
| `_headers` rules | — | 100 rules, 2,000 chars/header | — |

Bandwidth confirmed separately at
<https://developers.cloudflare.com/pages/functions/pricing/>: requests to static assets
are free and unlimited on both free and paid plans. The 100,000 req/day Workers Free
quota applies only to Pages **Functions**, which this project does not use.

### 1.2 Cloudflare ToS on video — ⚠ DIFFERS FROM BRIEF

**The brief's premise is out of date. Section 2.8 no longer exists.**

- <https://www.cloudflare.com/terms/> (Last Updated 2025-09-12) — section 2 runs 2.1–2.7. There is no 2.8.
- The restriction moved to the Service-Specific Terms, "Content Delivery Network (Free, Pro, or Business)": <https://www.cloudflare.com/service-specific-terms-application-services/> (Last Updated 2026-06-02). It names the sanctioned paid services as **"the Developer Platform, Images, and Stream."**
- <https://blog.cloudflare.com/updated-tos/> (2023-05-16) explains the change: video is fine when hosted by a Cloudflare service, and names **"Stream, Images, or R2."**

**Pages is named in neither. R2 is named only in the blog, not in the terms.** So the
brief's claim that ToS "prohibits" video on Pages is no longer accurate as written — but
neither is Pages explicitly blessed. Treating Pages as part of the "Developer Platform"
is an **inference**, and I am labelling it as one rather than asserting it.

The restriction's stated target is video *hosted outside Cloudflare* and served through
its CDN. That is not this project. **You chose Pages-only; residual risk is a judgment
call on ~50 MiB of Cloudflare-hosted content with one viewer, and I agree it is negligible.**

### 1.3 The 25 MiB cap stops being the blocker — ⚠ DIFFERS FROM BRIEF

The brief says "The current 43.6 MiB clip would fail the deploy outright." True **today**.
But the pipeline transcodes before deploy, and that file lands at roughly 10–15 MiB. So
the per-file cap does not force video off Pages once the pipeline exists.

The build-time cap check is still mandatory — it is now a **regression guard**, not the
reason for a hosting split.

### 1.4 Cloudflare R2 free tier (recorded; not used, per your decision)

Source: <https://developers.cloudflare.com/r2/pricing/> (Last Updated 2026-08-07)

| Item | Brief said | Verified |
|---|---|---|
| Storage | 10 GB | **10 GB-month** ✅ (Standard only, not Infrequent Access) |
| Class A ops | — | 1,000,000/mo |
| Class B ops | — | 10,000,000/mo |
| Egress | $0 | **$0** ✅ |

⚠ **Two things the brief assumes that I could not confirm from official docs:**

1. **Whether the free tier is permanent.** The pricing page presents it as a standing monthly allowance with no sunset language. It does not say "always free." I will not assert permanence from silence.
2. **Whether $0 checkout requires a card on file.** <https://developers.cloudflare.com/r2/get-started/> requires completing a checkout flow to add an R2 subscription; it does not state the payment-method requirement either way.

⚠ **And one that would have broken the $0 constraint had you chosen R2:**
<https://developers.cloudflare.com/r2/buckets/public-buckets/> (Last Updated 2026-06-16)
documents `r2.dev` as rate-limited and intended for development, with caching, WAF and
access controls **unavailable** on it. A production R2 bucket needs a custom domain, which
must already be a zone in the same Cloudflare account — i.e. **you must own a domain**.
The brief's "R2 on a custom subdomain" and its "$0 recurring, no compromise" constraint
were in direct conflict. Pages-only resolves it.

### 1.5 Cloudflare Access (Zero Trust) free tier

- Free plan exists: <https://developers.cloudflare.com/cloudflare-one/> (Last Updated 2026-04-30).
- **50-user limit: ⚠ NOT on any current first-party docs page.** I checked the Cloudflare One overview, account limits (2026-06-25), seat management, and the Zero Trust plans page — none state a free seat count. It is corroborated by <https://www.cloudflare.com/plans/zero-trust-services/>, <https://blog.cloudflare.com/teams-plans/> and many community threads. Treat 50 as very likely correct but formally unverified. **Irrelevant at one user either way.**
- **Access CAN protect a `*.pages.dev` site with no custom domain.** But not by default, and there is a trap. Per <https://developers.cloudflare.com/pages/platform/known-issues/> (2026-05-06): the Pages dashboard "Enable access policy" toggle protects **preview deployments only**. To cover `*.pages.dev` you must then go to Access → Applications → Configure and **delete the wildcard `*` from the Subdomain field**.
- **One-time PIN by email works with no external IdP** — <https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/> (2026-06-19). Note OTP is no longer added automatically to new orgs; it must be set up.
- Signup still asks for payment details on the free plan (<https://developers.cloudflare.com/cloudflare-one/setup/>, 2026-04-17): the step is required, but you are not charged.

**→ Free password protection is available and workable. See Open Question 5.**

### 1.6 Framework: Astro

Source: <https://registry.npmjs.org/astro/latest> · <https://docs.astro.build/en/reference/configuration-reference/>

- **astro@7.2.0**, published 2026-08-06. Requires **Node ≥ 22.12.0** ⚠ (the repo's Dockerfile pins `node:18-alpine`).
- `output: 'static'` is the **default** — a static site needs no `output` line. v5 merged `hybrid` into `static`.
- ⚠ **No `@astrojs/cloudflare` adapter needed for a static site.** Per <https://docs.astro.build/en/guides/deploy/cloudflare/>, the adapter is only for on-demand rendering. Build `astro build`, output `dist`.
- Astro ships `astro:assets` with `<Image />`/`<Picture />`, backed by **sharp**. `<Picture formats={['avif','webp']} />` emits AVIF+WebP with automatic `srcset`/`sizes` and intrinsic `width`/`height`.
- ⚠ **Trap to avoid:** Astro's default image service uses `objectFit: 'cover'` and **crops by default**. That is exactly the H3 bug. `fit` must be set explicitly on every image.
- ⚠ Images referenced as plain strings in `public/` are copied **untouched**. Anything to be optimized must live in `src/assets/`.
- Astro's docs also relay that Cloudflare now recommends Workers over Pages for new projects. Pages remains fully supported and is the simpler path here.

### 1.7 Vite (the alternative, for the record)

**vite@8.2.1**, published 2026-08-06. Node `^20.19.0 || >=22.12.0`. Multi-page static via
`build.rolldownOptions.input` (renamed from `rollupOptions` in v8 — Rolldown).
**No built-in image optimization at all** (<https://vite.dev/guide/assets>) — hashing and
inlining only. Every AVIF/WebP/srcset concern would be hand-rolled.

### 1.8 sharp — ⚠ DIFFERS FROM AUDIT.md

Source: <https://registry.npmjs.org/sharp/latest> · <https://github.com/advisories/GHSA-f88m-g3jw-g9cj>

- **sharp@0.35.3**, published 2026-07-01. Node ≥ 20.9.0. Ships libvips 8.18.3.
- ⚠ **The safe floor is 0.35.0, not 0.33 or 0.34.** GHSA-f88m-g3jw-g9cj (published 2026-07-21, High, CVSS 7.0) covers CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 in the GIF/TIFF/VIPS loaders, with affected range **`< 0.35.0`**. AUDIT.md said "fix requires major bump to 0.35.3" — correct on the target, and the advisory is broader than AUDIT described. **Pin `^0.35.3`.**
- ⚠ **`.autoOrient()` now exists** (added 0.34.0) and is preferable to bare `.rotate()`. `.rotate()` with no args still calls autoOrient for back-compat, but the explicit method is the documented path.
- ⚠ **AVIF `effort` maxes at 9; WebP `effort` maxes at 6.** Different ceilings — passing 9 to `.webp()` is out of range. AVIF `quality` defaults to 50, WebP to 80.
- `fit: 'inside'` + `withoutEnlargement: true` is correct for fit-without-crop-or-upscale. `withoutEnlargement` defaults to `false`.
- Windows prebuilds exist for x64 and arm64; no libvips install needed. ⚠ Real footgun: cross-platform lockfiles. Use npm 10+ `--os`/`--cpu`/`--libc` if the build ever moves to Linux CI.

### 1.9 ffmpeg — ⚠ PARTIALLY VERIFIED, stated honestly

**`trac.ffmpeg.org` is behind an Anubis anti-bot wall and returned Access Denied on every
attempt today**, including via a second researcher and a direct fetch. `web.archive.org`
is blocked in this environment. I substituted official ffmpeg.org docs and the FFmpeg
source tree.

**CONFIRMED from official FFmpeg sources:**

| Claim | Source |
|---|---|
| libx264 `crf` is an integer **-1 to 51**, **default 23**; presets are ultrafast…veryslow | <https://ffmpeg.org/ffmpeg-codecs.html> |
| `-movflags +faststart` moves the moov atom to the start; "not enabled by default" | <https://ffmpeg.org/ffmpeg-formats.html> |
| libsvtav1 `preset` 0–13, `crf` 0–63; `-svtav1-params` takes `key=value` joined by `:` | FFmpeg `doc/encoders.texi` |
| libvpx-vp9 `crf`, `deadline good` (recommended), `cpu-used`, `row-mt` | FFmpeg `doc/encoders.texi` |
| `scale` `-N` = "try to keep aspect but make sure it is divisible by N" | FFmpeg `libavfilter/vf_scale.c` |
| `-ss` before `-i` seeks the input; `-accurate_seek` is the default | <https://ffmpeg.org/ffmpeg.html> |
| SVT-AV1: CRF range 1–70, "a good starting point for 1080p video is `crf=30`", preset 12 is the highest for regular use | SVT-AV1 `Docs/Ffmpeg.md` |
| H.264 `-crf 18 -preset slow`; `yuv420p` "recommended format for web playback"; faststart aids streaming | ASWF ORI Encoding Guidelines |

**NOT VERIFIED today — do not cite as confirmed:**

1. The "sane range 17–28" heuristic and the ±6-CRF = half/double-bitrate rule (trac only).
2. The VP9 CRF-per-resolution table and the **`-b:v 0` requirement** for true constant-quality mode. This one matters — omitting it silently gives constrained quality instead of CQ. Mitigation: VP9 is not in the shipping ladder (see §8), so this does not block.
3. Whether trac now names libsvtav1 as recommended over libaom-av1. SVT-AV1 is a first-class encoder with its own official guide; the word "recommended" is unverified.

### 1.10 Browser support baseline — ⚠ DIFFERS FROM BRIEF

Read from the caniuse published dataset (`features-json`), checked 2026-08-10.

| Feature | Full | Partial | Note |
|---|---:|---:|---|
| AVIF | **94.65%** | 0.02% | Safari 16.4+ / iOS 16.4+ |
| WebP | **96.09%** | 0.09% | reaches back to iOS 14 |
| H.264/MP4 | **96.68%** | 0% | |
| AV1 | **79.26%** | **15.02%** | Safari partial — **hardware decoders only** |
| WebM container | 95.30% | 0.95% | iOS Safari only from 17.4 |
| `loading="lazy"` | 94.76% | 0.74% | img universal |
| `<picture>` | 96.41% | 0% | |
| `aspect-ratio` | 95.47% | 0% | Baseline since Sept 2021 |
| `:focus-visible` | 94.73% | 0% | |
| `prefers-reduced-motion` | 95.79% | 0% | |
| container queries (size) | 93.96% | 0.09% | |
| `content-visibility` | 93.19% | 0% | Safari only from 18.0 |

**Two changes to the brief's proposed fallback chain:**

1. ⚠ **Drop the JPEG fallback.** The brief specifies "AVIF + WebP + JPEG at 2–3 widths." WebP is at 96.09% and covers every browser AVIF misses. A third JPEG source is dead weight — roughly a third more encode time and build output for ~0 users. **Ship AVIF → WebP, two formats.**
2. ⚠ **AV1 cannot be the primary video source.** caniuse's own note: Safari supports AV1 only on devices with a hardware decoder (iPhone 15 Pro, M3+ Macs). Safari will not software-decode it. **H.264/MP4 must remain the last `<source>`** — which the brief already assumes, and this confirms it is still required in exactly the shape proposed.

Also flagged: **container *style* queries are not ready** (1.68% full). Do not conflate with size queries. And `content-visibility` at 93.19% is progressive enhancement only — never a layout dependency.

### 1.11 Alternative free static hosts

| Host | Bandwidth | Per-file / deploy cap | Verdict for this shape |
|---|---|---|---|
| **Cloudflare Pages** | **Unmetered** | 25 MiB/file, 20,000 files | **Best.** Free Access gating on `*.pages.dev`, no domain needed |
| GitHub Pages | 100 GB/mo *soft* | 1 GB site, 100 MiB/file hard | ⚠ **Private repos cannot publish Pages on Free.** Personal video on a public repo is the wrong trade |
| Netlify | 100 GB/mo | ⚠ per-file cap **unconfirmed** | Limits are **hard with suspension**, not throttling. Current large-media ToS position unconfirmed |
| Vercel Hobby | 100 GB/mo | ⚠ **100 MB static upload cap** | Disqualified *if video ships in the deploy*. Also non-commercial-only |

Sources: <https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits>,
<https://www.netlify.com/pricing/>, <https://vercel.com/docs/limits> (last_updated 2026-08-03).

⚠ **Honest caveat on Vercel:** its "Never fair use" list renders client-side and was
**empty in both the HTML and `.md` versions** I fetched. That is exactly where a video
prohibition would live. Treat Vercel's video stance as *unknown*, not permissive.

**Recommendation stands: Cloudflare Pages.** Unmetered bandwidth is the decisive
difference — it is the only one of the four where 150+ MiB of cumulative video carries
literally zero traffic risk, and the only one offering free auth on a platform subdomain.

### 1.12 `npm audit` — current state

Run 2026-08-10 against the repo as-is:

```
17 vulnerabilities (2 low, 2 moderate, 12 high, 1 critical)
prod 152 · dev 25 · optional 83 · total 258
```

**Exactly matches AUDIT.md.** And the audit output proves AUDIT's diagnosis: the critical
`tar` chain reports `fixAvailable: { name: "sqlite3", version: "6.0.1", isSemVerMajor: true }`
— i.e. npm's own resolver says the only route to the critical is through `sqlite3`.

**Deleting `sqlite3` removes the critical and the `cacache`/`node-gyp`/`make-fetch-happen`
highs at zero cost — nothing `require()`s it.** The rebuild drops the entire Express
dependency tree anyway, so this resolves by deletion rather than by upgrade.

---

## 2. Stack and deploy target

### Stack: **Astro 7.2.x**, static output, Node ≥ 22.12.0

Justified against Vite, feature by feature, against *this* project's actual failures:

| Requirement (from AUDIT/brief) | Astro | Vite |
|---|---|---|
| AVIF+WebP + `srcset` from local images | Built in (`<Picture>`, sharp) | Nothing — hand-rolled |
| Explicit `width`/`height` to hold **CLS = 0** | Automatic from intrinsic dims | Manual on every `<img>` |
| Close M5 (13 `innerHTML` XSS sinks) **structurally** | Auto-escaped interpolation, no `innerHTML` | Same if hand-written, no guarantee |
| JS < 50 KB budget | **Zero client JS by default** | Ships a JS entry by default |
| Count-agnostic schema, "adding year N+1 = adding one file" | Content collections + Zod validation at build time | None |
| Static output on Cloudflare | Default; **no adapter** | Works |

The decisive one is content collections. The brief requires that the 24 items be an array
with the count derived, that message paragraphs be an array of any length, and that year
N+1 be one new file with no layout edits. A Zod schema makes a malformed `2027.json` a
**build failure** rather than a silently half-rendered page — which is precisely the class
of bug that produced last year's "6 paragraphs authored, 3 wired, titled 23 over
non-matching content."

### Deploy target: **Cloudflare Pages, direct upload — exactly one**

AUDIT C4 found three conflicting configs. All three go:

- **Delete** `vercel.json` (cannot work — the app wrote to disk; moot now anyway)
- **Delete** `Dockerfile` + `.dockerignore` (no server to containerize)
- **Delete** `.github/workflows/keep-alive.yml` (144 pings/day to dodge Render cold starts; static has no cold start)

**Deploy mechanism: `wrangler pages deploy dist` — direct upload, not git-connected.**

This is the one non-obvious call in the plan, and it exists to satisfy a brief constraint
that git-connected builds cannot:

> "Never commit media."

A git-connected Pages build can only see what is in the repo. Video in the deploy would
mean video in git — which is how `.git` reached 153.89 MiB in the first place. Direct
upload lets the build assemble `dist/` from a **gitignored local `media/` tree**, so the
repo stays text-only while the deploy carries the bytes.

**The tradeoff, stated plainly:** the yearly update becomes a local command rather than a
`git push`. For a site updated once a year by one person, that is the right trade — but it
means **the media masters must be backed up outside this machine.** They currently exist
in three places (this repo's git history, `public/uploads/`, and the client's Drive
folder); after the history purge, only two. See Open Question 8.

**Integrity guard:** commit `media/manifest.json` recording every expected media file's
name, byte size and SHA-256. The build fails loudly with a named list if anything is
missing or altered. The repo stays self-checking without carrying the bytes.

---

## 3. Data schema

Two stores, because they have two lifecycles. This is the brief's requirement and it is
also what makes year N+1 a one-file change.

### 3.1 Cumulative — `src/content/timeline/*.json` (append-only)

One file per year. Adding a year adds a file; nothing else changes.

```jsonc
// src/content/timeline/2025.json
{
  "year": 2025,
  "label": "2025 — the first year",        // rendered as the chapter head + anchor id
  "events": [
    {
      "id": "2025-01-how-it-all-began",     // stable, human-readable, never reused
      "date": "2025-09-12",                 // ISO; nullable -> falls back to year only
      "title": "How it all began 👫🏽",
      "story": "TODO-CONTENT",              // AUDIT N2: all 14 are "" today
      "media": {
        "kind": "image",                    // "image" | "video" | "none"
        "src": "timeline/2025/how-it-all-began",   // extension-less base; pipeline owns formats
        "alt": "TODO-CONTENT",
        "poster": null,                     // video only; required when kind==="video"
        "aspect": "4:3"                     // authored, so layout never guesses
      }
    }
  ]
}
```

**Schema notes that fix specific audited bugs:**

- `id` is stable and explicit. Today's entries have **no `id` and no `date`** — they are identified by array index, so reordering silently rewrites history.
- `kind: "none"` replaces the old five-way `text`/`image`/`video`/`text_image`/`text_video` switch. The old model coupled *media presence* to *whether the story renders* — which is why all 10 video entries discard `content` entirely. Now `story` always renders and media is optional. **The mixed-media model survives; the branching that broke it does not.**
- `poster` is **required by the Zod schema when `kind === "video"`**. A video without a poster fails the build. That is AUDIT H4 made structurally impossible.
- `aspect` is authored, not inferred. AUDIT/DESIGN found three unreconciled aspect ratios in one rail causing 2.4× card-height swings.

### 3.2 Per-year — `src/content/years/2026.json`

```jsonc
{
  "year": 2026,
  "names": {
    "primary": "My Ish",
    "alternates": ["Bruce", "Bryan"]
  },
  "hero": {
    "greeting": "Happy Birthday",           // -> "Happy Birthday My Ish"
    "subtitle": "TODO-CONTENT"
  },
  "meta": {
    "title": "TODO-CONTENT",                // <title>; pulls from names, never hardcoded
    "description": "TODO-CONTENT",
    "ogImage": "og/2026-title-card"         // title card, NOT a personal photo
  },
  "message": {
    "title": "TODO-CONTENT",
    "paragraphs": ["TODO-CONTENT"],         // ARRAY, any length
    "closing": ["TODO-CONTENT"],            // the emphasised lines (was .message-highlight)
    "signature": "TODO-CONTENT"
  },
  "items": {
    "titleTemplate": "{count} Things I love about {name}",
    "titleName": "Bruce",
    "entries": ["TODO-CONTENT"]             // ARRAY; count DERIVED from length
  },
  "gallery": [
    { "src": "photos/2026/...", "alt": "TODO-CONTENT",
      "caption": "TODO-CONTENT", "plate": false }
  ]
}
```

**⚠ One brief-internal conflict I had to resolve — flagging it rather than silently choosing.**

The brief locks the section title *verbatim* as `24 Things I love about Bruce`, and
separately requires the count be **derived from array length, never hardcoded**. Taken
literally these contradict: a hardcoded "24" is exactly the hardcoded count the brief
forbids, and it is the same failure mode as last year's site titling itself "23" over
non-matching content.

**Resolution: `titleTemplate` with `{count}` interpolated from `entries.length`.** With 24
entries it renders the locked string character-for-character. With 23 or 25 it stays
truthful instead of lying. If you want the literal string regardless of array length, say
so and I will hardcode it — but I would be re-introducing the audited bug on purpose.

`titleName` is separate from `names.primary` on purpose: this heading uses "Bruce" while
the hero uses "My Ish". Per the brief, that variety is **deliberate this year** and is
built for, not fixed.

**No name appears in any template.** Hero, logo, `<title>`, headings and OG tags all read
from `names` / `meta`. AUDIT H1/N4 found the name hardcoded in four places and disagreeing
with itself in two.

### 3.3 Archive of past years' message/items — **propose: defer, but keep the door open**

The brief asks whether past years' messages and items get an archive view now that the
timeline carries over.

**Recommendation: do not build it this year.** 2026 is year two; there is exactly one past
year, and he has already read it. An archive route costs a page, a nav entry, and a second
content lifecycle for zero present benefit.

**But make it nearly free later:** migrate the 2025 message out of the hardcoded HTML into
`src/content/archive/2025.json`, wired to **no route at all**. Whenever you want an
archive, it becomes a glob over `archive/*.json` plus one page.

**The tradeoff, flagged:** an archive is the single most likely way 2025 copy leaks into a
2026 surface — which the brief calls the worst possible bug here. Keeping the file
route-less and outside the `years` collection means **no 2026 page can reach it even by
accident**, because the collection it would have to query does not contain it.

---

## 4. Migration plan — 14 timeline events and their media

All 14 events and all 44 media files are intact and verified: every `content.json`
reference resolves, zero broken links.

**Step 1 — Transform the data.** A one-shot script reads `server/content.json` and emits
`src/content/timeline/2025.json`:

- `type: "image"|"video"` → `media.kind`, preserving the mixed-media model
- filename → extension-less `src` base + a slug `id` derived from the title
- `date`: all 14 get `2025-09-12` (the date every photo record carries) unless you supply real dates — see Open Question 2
- `content: ""` → `story: "TODO-CONTENT"` on all 14 — **these were empty last year and are the biggest content gap in the timeline**
- Titles carried **verbatim**, including U+2019 apostrophes and emoji — see Open Question 3

**Step 2 — Relocate masters.** `public/uploads/` → `media/masters/2025/` (gitignored).
Closes C5/N2: 23.7 MB of unreferenced originals are publicly downloadable today.

**Step 3 — Drop the known junk.** Verified during inventory:

- `1757719764479-16522970.jpg` (3,157,199 B) — orphaned, referenced by nothing, no `opt-` twin, byte-identical to `...634700-96114700.jpg`. This is the AUDIT H2 fossil. **Do not migrate.**
- `...433129-517609304.JPG` and `...433138-328068506.JPG` — byte-identical duplicates (both 127,229 B), and **both are referenced**, at photos index 7 and 9. Migrate **one**; gallery goes 14 → 13 photos. Flagged in Open Question 6.

**Step 4 — Regenerate everything from masters.** The `opt-` derivatives are **not**
migrated. All 14 are bad 800×600 `fit:'cover'` crops of portrait sources, and several are
JPEG bytes inside `.PNG` filenames. They are discarded, not converted.

**Step 5 — Verify.** Post-migration check asserts: 14 events present, every `media.src`
resolves, every `kind:"video"` has a poster, no `id` collisions.

---

## 5. Component / section breakdown

Page order and weight, inheriting DESIGN.md's Keepsake direction and your ratio decision:

| # | Section | Target share | Notes |
|---|---|---:|---|
| 0 | Skip link + `<header>` landmark | — | AUDIT M1: zero landmarks today |
| 1 | **Title page** (hero) | ~10% | "Happy Birthday My Ish" — the strongest typographic moment |
| 2 | **The letter** | ~35–40% | The spine. Was 7% |
| 3 | **24 Things** | ~10% | Count derived from array |
| 4 | **Gallery** | ~20% | Editorial grid + lightbox |
| 5 | **Timeline** | ~30% | Cumulative, year-chaptered |
| 6 | **Closing** | — | The single flourish (DESIGN.md 3.5) |
| 7 | `<footer>` | — | |

Percentages are the intent, not a build assertion — the letter's real length is unknown
until content lands.

**Components**

- `Layout.astro` — landmarks, skip link, meta/OG, self-hosted fonts, `noindex,nofollow`
- `TitlePage.astro` — no float, no parallax, no ambient motion (DESIGN.md 3.5: "It's a title page")
- `Letter.astro` — maps `message.paragraphs[]`, any length. Kills the 6-authored/3-wired bug
- `ClosingLines.astro` — maps `message.closing[]`, any length. Kills the two-`.message-highlight`/one-reachable bug
- `ThingsList.astro` — maps `items.entries[]`; heading from `titleTemplate`
- `PhotoPlate.astro` / `GalleryGrid.astro` / `Lightbox.astro`
- `TimelineYear.astro` / `TimelineEntry.astro` / `VideoCard.astro` — poster-first, custom play affordance
- `Nav.astro` — **working mobile menu** (AUDIT H6), tap targets ≥ 44×44

**Every one of these renders from data.** No name, message, heading or count in markup.

---

## 6. Final design tokens

### 6.1 Palette — DESIGN.md "Keepsake" (your decision)

Every pair recomputed by me per WCAG 2.1 relative luminance — **not copied from DESIGN.md.**
DESIGN.md's published figures are accurate; my independent computation of `burgundy on paper`
came to 10.203, matching its stated 10.20.

```css
--paper:         #F6F2EC;  --paper-sunk:    #EDE7DE;
--ink:           #2A2724;  --ink-muted:     #6B645C;
--burgundy:      #6E1A2B;  --burgundy-deep: #4A0F1D;
--brass:         #A8894F;
```

| Pair | Ratio | Body ≥4.5 | Large ≥3.0 | |
|---|---:|---|---|---|
| `ink` on `paper` | **13.32** | PASS | PASS | AAA |
| `ink` on `paper-sunk` | 12.08 | PASS | PASS | AAA |
| `ink-muted` on `paper` | 5.23 | PASS | PASS | |
| `ink-muted` on `paper-sunk` | 4.74 | PASS | PASS | |
| `burgundy` on `paper` | **10.20** | PASS | PASS | AAA |
| `paper` on `burgundy` | 10.20 | PASS | PASS | reversed |
| `burgundy-deep` on `paper` | 13.67 | PASS | PASS | AAA |
| `brass` on `paper` | **2.96** | **FAIL** | **FAIL** | **ornament only** |

**`--brass` is a rule-and-ornament colour and must never carry text.** This is enforced,
not merely documented — see §9. If it ever must, `#7A6130` gives 5.26.

**The hierarchy rule (DESIGN.md 3.4):** headings are `--ink`, **not** burgundy. Burgundy
appears **at most twice per viewport**. This directly inverts last year's failure, where
indigo marked the hero *and* every section title *and* the 800px spine *and* all 14 dots —
and therefore marked nothing. It also closes AUDIT M2 by construction: there are no
user-selectable presets, so no "Elegant" preset at 1.00:1 can exist.

**Radii:** `2px` photographs, `4px` surfaces, `0` rules. Nothing else. (Was six values.)

**Elevation:** paper does not float. Default is no shadow + a `1px solid rgba(42,39,36,.10)`
hairline. Photographs get a mount:

```css
--elev-photo: 0 1px 2px rgba(42,39,36,.08), 0 8px 24px rgba(42,39,36,.06);
--elev-lift:  0 2px 4px rgba(42,39,36,.10), 0 16px 40px rgba(42,39,36,.08); /* hover only */
```

Two tiers, replacing one Tailwind `shadow-2xl` applied 42 times.

### 6.2 Type — Fraunces (display) + Newsreader (text), self-hosted

Both variable, both Google-licensed (OFL), self-hosted as WOFF2 — so the whole system is
two files and **zero third-party origins**. Dropping the sans entirely is DESIGN.md's
cheapest break from the template look; Playfair + Inter is the most common generated-site
pairing there is.

Base 18px, major third (1.25) — **every step is perceptible**, versus last year's nine
sizes resolving to two visible steps.

| Token | Mobile → Desktop | `clamp()` (390→1440) | LH | Tracking |
|---|---|---|---:|---|
| `display` | 40 → 70 | `clamp(2.5rem, 1.804rem + 2.857vw, 4.375rem)` | 1.05 | −0.03em |
| `title` | 34 → 55 | `clamp(2.125rem, 1.638rem + 2vw, 3.4375rem)` | 1.10 | −0.025em |
| `heading` | 28 → 44 | `clamp(1.75rem, 1.379rem + 1.524vw, 2.75rem)` | 1.15 | −0.02em |
| `subhead` | 24 → 35 | `clamp(1.5rem, 1.245rem + 1.048vw, 2.1875rem)` | 1.20 | −0.01em |
| `lead` | 22 → 28 | `clamp(1.375rem, 1.236rem + 0.571vw, 1.75rem)` | 1.40 | 0 |
| `body-lg` | 19 → 22 | `clamp(1.1875rem, 1.118rem + 0.286vw, 1.375rem)` | 1.60 | 0 |
| `body` | 17 → 18 | `clamp(1.0625rem, 1.039rem + 0.095vw, 1.125rem)` | 1.65 | 0 |
| `caption` | 14 | fixed | 1.45 | +0.01em |
| `micro` | 12 | fixed | 1.40 | +0.12em, uppercase |

**Leading tightens as size grows (1.65 → 1.05)** — the exact rule last year inverted by
cascading `line-height: 1.6` onto a 64px hero, giving it 102px of leading.

**Measure: 62–68ch, left-aligned, ragged right.** Not 79ch, not centred.

Fluid `clamp()` means **834px stops being an unhandled gap** (AUDIT M3: exactly one
breakpoint existed).

Buttons get an explicit `font-family` — last year's only CTA rendered in **Arial** because
buttons do not inherit it.

### 6.3 Spacing — 4px base, non-linear

```
4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 192
```

| Band | Values | Use |
|---|---|---|
| **Intra** | 4–24 | inside a component |
| **Inter** | 32–64 | between components |
| **Section** | 96–192 | between sections |

**Intra and inter must never share a value.** That overlap is exactly what made last year
feel unstructured: 26 of 34 spacing declarations were 32px or 16px, and 32px was
simultaneously section padding, card padding, nav gap and button padding.

---

## 7. Two timeline directions + gallery proposal

**Both directions satisfy, without exception:** the poster frame *is* the visual for every
video (custom play affordance, never browser chrome — a video entry reads as an image card
until played); year labels as navigable anchors; the mixed-media model preserved; real
story text per entry; fluid at every width; explicit dimensions everywhere.

They differ in **structure and growth behaviour.** Pick one; I build only that one.

### Direction A — "The Contact Sheet"

Each year is a chapter. Within a chapter, entries are a responsive grid of media cards
(3 / 2 / 1 columns), each card = poster or photo, title, caption. Uniform 4:5 card frame
so portrait phone media sits naturally. Current year open; past years collapse to a
condensed strip behind a `<details>` — *"14 moments from 2025"*.

- **Growth:** year N adds one collapsed chapter. At 60+ entries you see one open year and five one-line chapter heads.
- **Strengths:** shortest possible section; zero wasted horizontal space; degrades to a plain list with JS off; the grid reads as an album, which is honest about what the content is — DESIGN.md's core charge was that the old rail was "a structure pretending to be content."
- **Costs:** loses chronological *feeling*. Adjacent cards read as peers, not as a sequence.

### Direction B — "The Spine, Rebuilt"

Keeps chronology, deletes the alternation. A **single left-aligned rail**: hairline rule,
micro-label date, title, full-column media plate, story text. Year markers are **sticky**
while you scroll that year and double as the nav anchors. Past years switch to a condensed
mode — title + thumbnail row, expandable per entry.

- **Growth:** past years condense automatically; only the current year renders at full weight.
- **Strengths:** keeps the journey reading, which is what the section is *for*; single column means the ~50%-per-row waste is structurally impossible; identical behaviour at every width, so 834px is not a special case; the sticky year marker gives orientation the old dotted spine only pretended to.
- **Costs:** taller than A. Depends on the condensed mode being genuinely tight, or it drifts back toward last year's problem.

**My recommendation: B.** The brief calls this a *journey* and requires year anchors; B is
the one that keeps that reading while removing every measured cause of the failure. A is
the safer choice if you want the section unambiguously small.

### Gallery — editorial grid + lightbox

Per DESIGN.md 2.5, which the brief defers to on aesthetics. **The carousel does not
survive**, and not because it was the wrong size:

> A 3D rotating carousel optimises for spectacle-per-photo; this content needs
> comparison-across-photos.

Measured last year: one photo visible at **6.3% of the viewport**, 11 of 14 at `opacity: 0`
but **fully downloaded** (806 KB), 56 seconds to see them all on a 4s autoplay with no
pause control, and every source a portrait phone shot force-cropped to 800×600 landscape.

**Replacement:** 3 / 2 / 1-column editorial grid, **native aspect preserved — portrait
stays portrait**, with 2–3 photos promoted to full-width plates for rhythm. All photos
visible in roughly two screens, zero interaction required, zero JS for browsing. A
lightbox is added for close looking — a complement, not the pattern itself.

This closes M7 (loads only what it shows, via `srcset` + `loading="lazy"`), M1's
autoplay/pause WCAG 2.2.2 failure (**there is no autoplay**), and H3.1 (no crop) at once.

---

## 8. Media pipeline

One documented, repeatable, idempotent script pair that runs on next year's additions too.
Content-hashed outputs mean re-running skips unchanged inputs.

```
media/masters/<year>/    gitignored — originals, never served
media/derived/<year>/    gitignored — build output, uploaded with dist
media/manifest.json      COMMITTED — name + bytes + sha256 per file
```

### 8.1 Images — `scripts/images.mjs` (sharp ^0.35.3)

Two stages, on purpose. The script normalises; **Astro generates the responsive set.**
That avoids double-encoding and keeps one source of truth for `srcset`.

**Stage 1 — script (masters → `src/assets/`):**

```js
sharp(input)
  .autoOrient()                                    // 0.34+; NOT bare .rotate()
  .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
  .withMetadata({ exif: {} })                      // strip EXIF, incl. GPS
```

- **`fit: 'inside'`, never `'cover'`.** This is the entire H3.1 fix. A 1179×2556 portrait becomes 1107×2400, not a 800×600 crop through its middle third.
- **`.autoOrient()`** so rotation-flagged phone photos land upright.
- **EXIF stripped** — these are personal photos and the masters carry GPS coordinates. Not in the brief; I am raising it because it is a real privacy exposure on a site of personal media.

**Stage 2 — Astro `<Picture>`:** emits **AVIF + WebP** (⚠ no JPEG, per §1.10) at 3 widths
with automatic `srcset`/`sizes` and intrinsic `width`/`height`.

⚠ **`fit` must be set explicitly on every `<Picture>`** — Astro's default image service
crops. Left at its default it silently re-creates H3.1.

Extensions are written by the encoder, so **JPEG-bytes-in-`.PNG` cannot recur** — it was
structurally possible last year only because the output name was `'opt-' + file.filename`.

### 8.2 Video — `scripts/video.mjs` (ffmpeg)

Ladder: **H.264/MP4 primary + AV1/MP4 alternate.** Per §1.10, AV1 at 79.26% with Safari
hardware-gated **cannot** be primary; H.264 at 96.68% is the guaranteed floor. VP9/WebM is
**dropped** — its real-world gain over AV1 is old desktop Safari only, and its official
`-b:v 0` requirement is among the things I could not verify today.

```bash
# Long-edge 1080p cap — handles portrait AND landscape.
# A plain min(1920,iw) is a NO-OP on a 1080x1920 phone clip.
SCALE="scale=w='if(gt(iw,ih),min(1920,iw),-2)':h='if(gt(iw,ih),-2,min(1920,ih))'"

# H.264 — the compatibility floor
ffmpeg -i IN -vf "$SCALE" -c:v libx264 -crf 23 -preset slow \
  -profile:v high -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 128k OUT.mp4

# AV1 — the efficiency alternate
ffmpeg -i IN -vf "$SCALE" -c:v libsvtav1 -crf 32 -preset 6 \
  -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k OUT.av1.mp4

# Poster — the visual for every video entry
ffmpeg -ss 00:00:01 -i IN -frames:v 1 -q:v 2 -vf "$SCALE" OUT.poster.png
```

`-crf 23` is libx264's documented default (ffmpeg-codecs.html); `-preset slow` and
`yuv420p` follow the ASWF ORI guidelines. SVT-AV1 `crf=32 preset=6` sits inside the
official 1080p guidance (`crf=30` starting point, presets 4–8 the useful band).

⚠ The "sane range 17–28" heuristic is **unverified** (§1.9) — I am using the documented
default, not the folklore. **Encode settings will be tuned against measured output, not
assumed.**

Posters run through the same Stage-2 AVIF/WebP path as photographs.

### 8.3 Expected before / after

| | Today | After | |
|---|---:|---:|---|
| Photo masters | 22.586 MiB (15 files) | out of `public/`, out of git | |
| Photo web variants | 0.673 MiB (14 bad crops) | ~6–8 MiB committed, correctly cropped | 3 widths × 2 formats |
| Timeline images | 0.115 MiB (4) | ~1.5 MiB | regenerated from masters |
| **Video** | **117.0 MiB** | **~50–70 MiB** | H.264 + AV1 |
| — largest single (`...179355653.mp4`) | **43.627 MiB** | **~10–15 MiB** | vs **25 MiB cap** |
| — hero (`...644470116.mp4`) | 25.345 MiB | ~6–9 MiB | |
| Posters | **0** | ~0.5 MiB (11) | AVIF+WebP |
| **Deployed total** | 140.369 MiB | **~60–80 MiB** | |
| Year-4 projection | ~470 MiB | ~150–200 MiB | well inside Pages |

Video figures are **estimates from source characteristics, not measurements.** The build
check in §9 is what makes them safe: if a real encode lands above the cap, the deploy
fails rather than silently breaking.

---

## 9. Performance budget and the checks that enforce it

**Baseline to beat** (AUDIT, measured on localhost with zero network latency):
2,395 KB of video metadata + 806 KB images + 87 KB render-blocking Font Awesome for
**6 icons**, `loadEventEnd` **5,418 ms**, 471 ms of long tasks in a 3-second idle sample.

| Budget | Target | Enforcement |
|---|---|---|
| Initial load, pre-video | **< 500 KB** | `check:budget` — fails build |
| JS shipped | **< 50 KB** | `check:budget` — Astro ships 0 by default |
| Render-blocking 3rd-party | **0** | `check:thirdparty` — greps built HTML for external origins |
| Any asset | **< 20 MiB** (25 MiB cap, headroom) | `check:assets` |
| Files in `dist/` | < 20,000 | `check:assets` |
| CLS | **0** (preserve, AUDIT measured 0) | `check:dimensions` — every `<img>` needs `width`+`height` |
| LCP | < 1.5s on 4G mobile | Lighthouse, manual |
| INP | < 200ms on 4G mobile | Lighthouse, manual |

**Build-time checks — all fail the build loudly, none warn:**

1. `check:assets` — any file > 20 MiB, or > 20,000 files. **The Pages hard cap cannot be raised**; this must never be a warning.
2. `check:budget` — sums HTML + CSS + JS + above-fold images per route.
3. `check:dimensions` — every `<img>` has explicit `width`/`height`; every `<video>` has `poster` **and** `preload="none"`. Directly guards H4 and CLS.
4. `check:thirdparty` — zero external origins in built HTML.
5. `check:contrast` — asserts every token pair in §6.1, **and asserts `--brass` is never bound to a text colour.** Makes an M2-class 1.00:1 regression a build failure.
6. `check:media` — `media/manifest.json` SHA-256s match; names missing files.
7. `check:content` — Zod validation; every `kind:"video"` has a poster; no duplicate `id`s.

**Removed from the critical path entirely:** Font Awesome (87 KB blocking, for 6 icons →
**6 inlined SVGs**), Google Fonts (14 KB blocking → self-hosted WOFF2), canvas-confetti
(non-deferred → deleted). **Three third-party origins go to zero**, so the resource-hint
question is moot rather than mitigated.

**CDN replaces every piece of server-side work**, per the brief — none ported:

- No compression middleware. Brotli/gzip + HTTP/3 come from the edge (H5: all CSS/JS shipped with **no `Content-Encoding` header at all**).
- `_headers`: hashed assets `Cache-Control: public, max-age=31536000, immutable`; HTML short + revalidated; media long-immutable. Last year: `max-age=0` on 117 MiB of immutable media.
- `_headers`: CSP, X-Frame-Options, Referrer-Policy. No `X-Powered-By: Express`, because there is no Express.

---

## 10. Ordered task list — every AUDIT critical / high / medium mapped

### Stage 0 — Stop the bleeding (do first; the live site is writable **right now**)

| # | Task | Closes |
|---|---|---|
| 0.1 | **Take down `bryan-birthday-1.onrender.com`** (your decision) | **C1, C2, C3**, M8 |
| 0.2 | Rotate `birthday2024`; treat as public | C5 |
| 0.3 | Add `.gitignore`; `git rm -r --cached node_modules .env .idea` | C5 |

### Stage 1 — Repo hygiene

| # | Task | Closes |
|---|---|---|
| 1.1 | `.gitignore`: `node_modules/`, `.env`, `.idea/`, `media/`, `dist/`, `design-audit/` | C5 |
| 1.2 | **Delete `sqlite3`** — sole route to the critical `tar` CVE, `require()`d nowhere | §1.12 |
| 1.3 | Delete `vercel.json`, `Dockerfile`, `.dockerignore`, `keep-alive.yml` | **C4** |
| 1.4 | Delete the entire Express app; replace `Implementation Guide.md` / `Instructions.md` | C1–C4, N3 |
| 1.5 | Recommend `git filter-repo` — reclaims ~150 of 153.89 MiB | C5 |
| 1.6 | Real README: run, deploy, next year's update, the Drive→local→build flow | N3 |

### Stage 2 — Scaffold + data

| # | Task | Closes |
|---|---|---|
| 2.1 | Astro 7.2.x static; Node ≥22.12 | C4, §1.6 |
| 2.2 | Content collections + Zod schemas (§3) | N4, M5 |
| 2.3 | Migrate 14 events → `timeline/2025.json` (§4) | H1, N4 |
| 2.4 | Seed `years/2026.json` with `TODO-CONTENT` (§11) | — |
| 2.5 | Archive 2025 message to `archive/2025.json`, **route-less** | N4 |

### Stage 3 — Media pipeline

| # | Task | Closes |
|---|---|---|
| 3.1 | Masters out of `public/`, into gitignored `media/` | **C5, N2** |
| 3.2 | `scripts/images.mjs` — `autoOrient` + `fit:'inside'` + EXIF strip | **H3.1, H3.2** |
| 3.3 | Astro `<Picture>` AVIF+WebP + `srcset`, explicit `fit` | **H3.3, H3.4**, M7 |
| 3.4 | `scripts/video.mjs` — H.264 + AV1, 1080p long-edge cap | **H4** |
| 3.5 | Poster per video; schema-required | **H4** |
| 3.6 | Drop the H2 orphan + one of the duplicate pair | H2, N2 |
| 3.7 | `media/manifest.json` + `check:media` | — |

### Stage 4 — Build the site

| # | Task | Closes |
|---|---|---|
| 4.1 | Layout: `<main>`, labelled sections, skip link, `:focus-visible` ring | **M1** |
| 4.2 | Title page — no ambient motion | M6 |
| 4.3 | Letter — `paragraphs[]` + `closing[]`, any length | **N4** |
| 4.4 | 24 Things — count from `entries.length` | **N4** |
| 4.5 | Gallery — editorial grid + lightbox, no autoplay | **M7, M1, M3** |
| 4.6 | Timeline — chosen direction, poster-first, year anchors | **H4, M3** |
| 4.7 | **Working mobile nav**, tap targets ≥44×44 | **H6, M3** |
| 4.8 | Scroll reveal: 8px rise, once, behind `prefers-reduced-motion` — **restored properly, `!important` override gone** | **M4, M1** |
| 4.9 | Fluid layout, tablet handled by `clamp()`; drop `overflow-x:hidden` | **M3** |
| 4.10 | Delete global keyboard hijacking — **spacebar `preventDefault()` breaks page scroll** | **M1** |
| 4.11 | Meta: description, OG, Twitter, favicon, `noindex,nofollow`; **no sitemap** | **M8** |
| 4.12 | The single flourish; delete confetti + fireworks + `--primary` interval | **M6** |

### Stage 5 — Quality gates

| # | Task | Closes |
|---|---|---|
| 5.1 | The seven build checks (§9) | H5, M2, H4 |
| 5.2 | `_headers`: cache + CSP + security | **H5** |
| 5.3 | Smoke test — page builds, renders, every media ref resolves | N3 |
| 5.4 | ESLint + Prettier | N3 |
| 5.5 | Lighthouse mobile — LCP/INP/CLS | H5, M6 |
| 5.6 | Cloudflare Access on `*.pages.dev` (Open Q5) | privacy |

### Obviated by the static architecture

| AUDIT | Why |
|---|---|
| **C1** unauthenticated admin | No admin panel, no server, no write endpoints exist |
| **C2** path-traversal delete | No `DELETE` route; no filesystem writes at runtime |
| **C3** upload bypass → stored XSS | No upload endpoint; media is build-time only |
| **C4** broken Vercel config | One target (Pages); all three old configs deleted |
| **H1** `saveContent()` drops messages/colors | No runtime writes. Content is versioned files; a bad edit is a build failure, not silent loss |
| **H7** double init, `/api/content` ×3 | **Confirmed obviated.** No `/api/content`, no `DOMContentLoaded` bootstrap, no runtime fetch — content is compiled in. Astro ships zero client JS by default |
| **M5** 13 `innerHTML` XSS sinks | **Structurally closed, not escaped at 13 call sites.** Astro auto-escapes; no `innerHTML`; content is authored, not user-submitted |
| **M2** invisible "Elegant" preset | No runtime colour system, no presets. Tokens are fixed and contrast-asserted in CI |
| **N1** dead code | Whole codebase replaced |
| **CLS** | Measured 0 today; preserved via explicit dimensions + `check:dimensions`. **No further CLS work** |

---

## 11. Every `TODO-CONTENT` placeholder

Site builds and previews with all of these unresolved.

**`years/2026.json` — from the client, separately**

| # | Path | What |
|---|---|---|
| 1 | `hero.subtitle` | 2025's was stock template copy — **must not carry over** |
| 2 | `meta.title` | `<title>` |
| 3 | `meta.description` | |
| 4 | `meta.ogImage` | **Tasteful title card, NOT a personal photo** — needs design |
| 5 | `message.title` | |
| 6 | `message.paragraphs[]` | **The 2026 letter.** Array, any length |
| 7 | `message.closing[]` | The emphasised closing lines |
| 8 | `message.signature` | |
| 9 | `items.entries[]` | **The 24 things.** Count derives from length |
| 10 | `gallery[].alt` | ×13 — all 14 share `"Memory photo"` today (M1) |
| 11 | `gallery[].caption` | ×13 — the `caption` field exists and is **empty on all 14** |
| 12 | `gallery[].plate` | Which 2–3 go full-width. **Needs a human to look** (DESIGN.md 3.6 #3) |

**`timeline/2025.json` — migrated, needs filling**

| # | Path | What |
|---|---|---|
| 13 | `events[].story` | **×14 — every entry's `content` is `""` today.** The single biggest content gap |
| 14 | `events[].media.alt` | ×14 |
| 15 | `events[].date` | ×14 — no date field exists today; all default to `2025-09-12` |
| 16 | `events[].media.poster` | ×10 videos — poster timestamp per clip; 1s default, some need a manual pick |
| 17 | `label` | `"2025 — …"` chapter head |

**`timeline/2026.json`** — does not exist yet. Needs this year's events (#18).

**Nothing from 2025 appears in any 2026 section.** The 2025 message goes to a route-less
archive file (§3.3) that no 2026 page can query.

---

## 12. Open questions

1. **The 24 items — what shape?** One line each, or title + body? Changes the component and the type scale applied. I will assume **one line each** unless told otherwise.

2. **Timeline dates.** No date field exists today; all 14 would default to `2025-09-12` (the date every photo record carries). Do you have real dates, or is year-level grouping enough? Year-level is sufficient for the design.

3. **Do the 2025 timeline titles get rewritten?** They are emoji-heavy and in texting register — `👨🏾‍🍳` alone as one title, `long distance bestiesssssss`, `Adventure time🤸‍♀`. DESIGN.md 2.6 criticises them against a formal serif. But they are **preserved history**, and rewriting them edits the past. **My recommendation: keep verbatim, and let the new `story` text carry the register.** Also worth knowing: two titles use U+2019 apostrophes and one has a bare ZWJ emoji sequence that may render as a fragment in some fonts.

4. **"My Ish" — any typographic intent?** It gets the strongest moment on the page. Is "Ish" a nickname to be set apart (weight, colour, scale), or is the line uniform?

5. **Password-protect with Cloudflare Access?** Free, works on `*.pages.dev` with no custom domain, email one-time-PIN with no external IdP. Requires the delete-the-wildcard workaround (§1.5) and a payment method at signup (not charged). Or rely on an unguessable URL alone.

6. **The duplicate photo pair.** `...517609304.JPG` and `...328068506.JPG` are byte-identical, and **both are referenced** — the gallery shows the same photo twice today. I plan to ship one, taking the gallery to 13. Confirm, or supply a replacement.

7. **Custom domain.** Not needed for anything now — Access, hosting and video all work on `*.pages.dev` at $0. It is the **only** item that would cost money (~$10–12/yr). Default: no domain.

8. **Media backup.** Masters leave git, so after the history purge they exist only in `media/masters/` locally and in the client's Drive folder. Confirm a backup location. This is the one genuine data-loss risk the plan introduces.

9. **Fonts.** DESIGN.md specifies Fraunces + Newsreader and is the aesthetic authority, so I am proceeding with them. Flagging only so it is a conscious choice — it is a total break from Playfair + Inter.

---

## Verification

**Build-time (automated, all fail loudly — `npm run verify`):** the seven checks in §9 —
assets/caps, budget, dimensions+poster, third-party, contrast, media manifest, content
schema.

**Local preview:** `npm run dev`, then drive the real page — read the console for errors,
confirm zero external origins in the network log, and check the rendered DOM at 390 /
834 / 1440.

**Manual, against the specific things that failed last year:**

| Check | The bug it guards |
|---|---|
| Mobile nav actually opens at 375px | H6 — `.nav-menu.active` never existed |
| Every timeline video shows a poster, not a black box; nothing loads until played | H4 — 2,395 KB before any interaction |
| Tab through the page — focus ring visible everywhere | M1 — **zero `:focus` rules existed** |
| Spacebar scrolls the page | M1 — `preventDefault()` broke it |
| `prefers-reduced-motion: reduce` → reveal is opacity-only, nothing ambient | M1 — zero occurrences site-wide |
| Read a section title for 60s — colour does not change | M6 — random `--primary` every 10s |
| No portrait photo is cropped landscape; no head cut off | H3.1 |
| Every photo has distinct alt text | M1 — all 14 said "Memory photo" |
| `<title>`, logo, hero and headings all agree, from data | H1 — Bryan/Bruce/Brucey |
| No 2025 copy in any 2026 section | The brief's worst-case bug |

**Post-deploy:** confirm `Cache-Control: immutable` on a hashed asset and on a video;
confirm `Content-Encoding: br`; confirm `noindex`; confirm the OG card renders; Lighthouse
mobile for LCP < 1.5s, INP < 200ms, **CLS = 0**.

---

**Do not build until this is approved.** On approval I will write this to `PLAN.md` at the
repo root and begin at Stage 0.
