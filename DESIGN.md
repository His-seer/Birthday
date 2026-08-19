# Visual & Aesthetic Audit — Birthday Website

**Audited:** 2026-08-10 · **Source:** live site `bryan-birthday-1.onrender.com` · **Scope:** judgment of the rendered result. No code changed.

Companion to [AUDIT.md](AUDIT.md), which covered the measurable side (security, performance, contrast, CLS, tap targets). That document asked *does it work*. This one asks *does it look good*. Where the two overlap I defer to AUDIT and don't re-litigate.

---

## 0. Method

Captured with Playwright/Chromium against the live Render deployment at 2× DPR (the local server was avoided — `npm ci` is broken in this repo per **AUDIT C5**, and nothing here needed a local build). Screenshots in [`/design-audit/`](design-audit/):

| | |
|---|---|
| Full page | `full-390-mobile.png`, `full-834-tablet.png`, `full-1440-desktop.png` (+ `-scaled` versions) |
| Sections | `hero-*`, `gallery-*`, `timeline-*`, `message-*` at all three widths |
| Detail | `carousel-stage-1440.png`, `timeline-item-1440.png`, `timeline-slice1..4-1440.png` |
| Raw data | `measurements.json` — computed styles, rendered boxes, every colour/radius/shadow in use |

Every number below is read off the live DOM or measured from the images, not inferred from CSS.

> **Housekeeping:** `/design-audit/` is ~18 MB. The repo still has no `.gitignore` (**AUDIT C5**) — add one before committing, or this folder joins `node_modules/` in git history.

---

## 1. What's actually there

### 1.1 The page, by the numbers

At 1440×900 the document is **11,174 px** tall. Where that height goes:

| Section | Height | Share |
|---|---:|---:|
| Hero | 900 px | 8.1% |
| Gallery (14 photos) | 787 px | 7.0% |
| **Timeline** | **8,694 px** | **77.8%** |
| Message (the actual gift) | 793 px | 7.1% |

**The section the client explicitly rejected occupies 78% of the site. The message — the thing the site exists to deliver — gets 7%.** That single ratio is the design problem in one line, and no amount of restyling fixes it.

### 1.2 Typefaces and the real type scale

Two families, and only **four weights actually load**: Playfair Display 700, Inter 400/500/600. (The `<link>` requests seven; three never resolve because nothing uses them.)

Rendered sizes at 1440px, in the order the browser actually paints them:

| Role | Family | Wt | Size | Line-height | Ratio | Tracking | Measure |
|---|---|---:|---:|---:|---:|---|---:|
| Hero H1 | Playfair Display | 700 | **64 px** | 102.4 px | **1.6** | normal | 20 ch |
| Message H2 | Playfair Display | 700 | 48 px | 76.8 px | **1.6** | normal | 32 ch |
| Section H2 | Playfair Display | 700 | 40 px | 64 px | **1.6** | normal | 55 ch |
| Nav logo | Playfair Display | 700 | 24 px | 38.4 px | 1.6 | normal | — |
| Timeline H3 | Playfair Display | 700 | 20.8 px | 33.28 px | 1.6 | normal | 28 ch |
| Message highlight | Inter | 600 | 20.8 px | 33.28 px | 1.6 | normal | 71 ch |
| Hero subtitle | Inter | 400 | 19.2 px | 30.72 px | 1.6 | normal | 67 ch |
| Message body | Inter | 400 | 19.2 px | 34.56 px | 1.8 | normal | **79 ch** |
| Section subtitle | Inter | 400 | 17.6 px | 28.16 px | 1.6 | normal | 65 ch |
| CTA button | **Arial** | 600 | 17.6 px | normal | — | normal | — |
| Body / timeline | Inter | 400 | 16 px | 25.6 px | 1.6 | normal | 44 ch |
| Carousel counter | Inter | 500 | 14.4 px | 23.04 px | 1.6 | normal | — |

Four things fall out of that table:

**The scale isn't a scale.** Sorted: 14.4, 16, 17.6, 19.2, 20.8, 24, 40, 48, 64. The bottom five are `0.9 / 1 / 1.1 / 1.2 / 1.3 rem` — an arithmetic sequence in 1.6 px steps. Consecutive ratios are 1.10, 1.09, 1.08. **Anything under ~1.15 is not a perceptible step**, so those five sizes read as one size. Then the scale jumps 24 → 40 (1.67×) with nothing between. So the site has, effectively, *two* type sizes — "text" and "big" — wearing nine different numbers.

**Line-height 1.6 is applied to display type.** `body { line-height: 1.6 }` cascades everywhere and only `.message-text` (1.8) overrides it. So the 64 px hero gets **102 px of leading**. Display type wants 1.0–1.1. This is the single most visible typographic tell on the site: look at `hero-390-mobile.png` — "Happy Birthday / Bruce!" has a canyon between the two lines and the block reads slack and unset, not confident.

**Letter-spacing is `normal` on every element on the page.** Zero declarations in the entire stylesheet. Large Playfair wants negative tracking; small caps/labels want positive. Neither exists. Nobody made an optical decision anywhere.

**The one CTA on the site renders in Arial.** `.celebrate-button` declares no `font-family`, and buttons don't inherit it — so the "Celebrate!" button, the single interactive flourish, is set in the browser default with `line-height: normal`. Confirmed live: `fontFamily: "Arial"`. It doesn't match anything else on the page.

And the body copy — the part that matters — is **79 characters per line, centred, four paragraphs deep** (121/158/155/146 chars). Past 75ch the eye loses the line return; centred text removes the fixed left edge that makes the return findable at all. It's the least readable configuration available for the most important text on the site.

### 1.3 Spacing

Seven distinct values, all rem, all on an 8 px grid: **8, 16, 24, 32, 48, 64, 80**. So a grid technically exists. But the distribution:

| Value | Uses |
|---|---:|
| `2rem` (32px) | **18** |
| `1rem` (16px) | 8 |
| `3rem` (48px) | 3 |
| `1.5rem` (24px) | 2 |
| `0.5rem` / `4rem` / `5rem` | 1 each |

**26 of 34 spacing declarations are 32 px or 16 px.** And 32 px is doing *every* job at once: section container padding, hero content padding, timeline card padding, nav gap, carousel padding, message title margin, button padding. There is no distinction between *space inside a thing* and *space between things* — which is the only distinction that produces rhythm. So: a grid, but no system. Vertical rhythm is ad hoc.

Section padding is `5rem` top and bottom, used exactly once, and never varies — hero, gallery, timeline, and message all breathe identically regardless of what they contain.

### 1.4 Colour

Five text colours and six backgrounds on the entire site.

| Colour | Uses | Where |
|---|---:|---|
| `#f8fafc` | 25 | timeline H3s, card text |
| `#cbd5e1` | 13 | nav links, all subtitles, message body |
| `#6366f1` indigo | 3 text + 14 dots + 1 rule | hero H1, **every** section H2, timeline spine, all 14 dots |
| `#f59e0b` amber | 3 | message H2 + both highlight lines |
| `#ffffff` | 2 | logo, CTA |
| `#1e293b` / `#0f172a` | 41 | gallery band / page + cards |

**The palette is flat — there is no hierarchy, because the accent is the wallpaper.** Indigo marks the hero title, *and* all three section titles, *and* the 800 px spine, *and* every one of the 14 dots. When a colour marks everything it marks nothing; the eye gets no help deciding what's important. Amber then arrives in the last 7% of the page as a second, unrelated accent with no prior appearance — so it reads as a different site rather than a crescendo.

`--secondary` (#8b5cf6) and `--success` (#10b981 — emerald green, on a birthday site) are declared and never used as solid colour. They surface only through gradients and through the random-colour interval (§3.6).

**These are Tailwind defaults, unmodified.** `#6366f1` is `indigo-500`, `#0f172a` is `slate-900`, `#1e293b` is `slate-800`, `#f59e0b` is `amber-500`, `#10b981` is `emerald-500`. Nobody picked these; they came with the box.

### 1.5 Radii, shadows, borders

**Six radii, no system:** `15px` (28 uses), `50%` (17), `12px` (13), `2px` (2), `20px` (1), `50px` (1). The 12 vs 15 px split is the clearest fingerprint of ad-hoc authoring — those two values sit side by side on the same card (card 15, image inside it 12) and no one chose that.

**One shadow, used 42 times:** `0 25px 50px -12px` at α 0.25 and α 0.5. That's Tailwind's `shadow-2xl`. It's on the 600 px hero video, on the 368 px timeline cards, and on 63 px invisible carousel thumbnails alike. A 50 px blur offset 25 px down is a *hero-scale* shadow; applying it to everything means **there is no elevation hierarchy at all** — every surface claims to float the same distance off the page. On a near-black background the shadows are also mostly invisible, so the cost is paid in paint time for no visual return.

**Borders:** exactly one meaningful rule — `1px solid rgba(255,255,255,0.1)` on the 14 timeline cards. Plus `3px solid #0f172a` rings on the dots.

---

## 2. The critique

The client called last year's site trash. They're not wrong, and the reasons are specific.

### 2.1 The hero doesn't earn its space

`hero-1440-desktop.png`. The section is 900 px (100vh); the content block is 615 px; the title starts **175 px** from the top and the video ends at 693 px — so ~42% of the first screen is empty gradient. That's fine in principle. The problem is what's in the other 58%.

There is **no focal point**. The eye enters and finds three objects of near-equal weight stacked centre-column: a title, a sentence, a 600 px video. The title is indigo — but so is every other heading on the site, so it doesn't read as *the* headline. The video is the largest object and the brightest (a lit face on near-black), so it wins the attention contest by default — but it's a placeholder-shaped 16:9 box with a generic purple play button on it. **The most prominent element on load is a play button.**

Then the copy. "Celebrating another amazing year of your incredible journey" is the template's stock subtitle — it says nothing about this person, and it's the only line of body text above the fold. And the H1 says **"Happy Birthday Bruce!"** while the nav 40 px above it says **"Happy Birthday Bryan 🎉"**. Both are visible in one screenshot. Whatever else is true, a gift that spells the recipient's name two ways in the same viewport reads as unfinished. (**AUDIT H1** explains why: the admin panel silently drops `messages`, so someone edited the HTML by hand and only got half of it.)

The hero has 900 px and uses them to say nothing specific to anyone.

### 2.2 Hierarchy: the eye has no route

Every section is built from the identical three-part stamp: centred Playfair H2 in indigo → centred Inter subtitle in grey → content. Same sizes, same colours, same 48 px gap, three times. Uniform structure is only good when the *content* differs enough to carry the difference — here it doesn't, so all three sections read as equally (un)important, and scrolling feels like advancing through a form rather than moving through a story.

Within sections it's worse. In the timeline, the card is `max-width: calc(50% - 2rem)` = **368 px inside a 1440 px viewport (25.6%)**, and every row leaves the opposite 432 px of the rail completely empty. `timeline-slice3-1440.png` is the proof: a full 1440×900 screen in which **one card floats right of centre and roughly 55% of the screen is empty navy**. The heading of that card is the single emoji `👨🏾‍🍳`. There is nothing for the eye to do.

### 2.3 Typography: default-ish, and one real bug

Covered in §1.2. The short version: the scale has nine numbers and two perceptible steps; display type is set at body leading; tracking is untouched everywhere; the body measure is 79ch and centred; and the CTA is in Arial.

Add the pairing itself. **Playfair Display + Inter is the single most common "generated website" font pairing in existence** — it's the default in most AI site builders and template marketplaces. Playfair is a high-contrast didone: at 64 px with 102 px leading, no tracking, and centred, it isn't elegant, it's just *large*. The families aren't the crime; using them at their defaults is.

### 2.4 Density and whitespace: both wrong, in different places

Not "cramped" or "empty" — **both, alternating**, which is the worst outcome because it reads as inattention rather than intent.

- **Hero:** 42% empty, but the emptiness is undifferentiated — it's not framing anything.
- **Gallery:** 787 px tall to display **one photo at 330×248 px** — 6.3% of the viewport (§2.5).
- **Timeline:** 8,694 px in which each row is ~25% content and ~75% void, and the card itself has ~80 px of dead padding below its media because `.timeline-content` is a flex child stretched to the row height.
- **Message:** the only section with reasonable density — and it's the one that's 7% of the page.

Whitespace works when it isolates something. Here it just separates things that were already separate.

### 2.5 The 3D carousel: wrong pattern, not just wrong size

The size is bad — but fixing the size doesn't fix this, so let's take the pattern apart.

Measured at 1440×900:

| State | Count | Rendered | Opacity |
|---|---:|---|---:|
| `.active` | 1 | **330 × 248 px** | 1 |
| `.prev` / `.next` | 2 | 154 × 153 px (rotated 45°, foreshortened) | 0.7 |
| `.hidden` | **11** | 63.5 × 47.6 px | **0** |

- **One photo at a time, at 6.3% of the viewport.** 81,675 px² of a 1,296,000 px² screen. In `carousel-stage-1440.png` the active photo is a small card adrift in a large dark field.
- **The neighbours are noise, not context.** `rotateY(±45°)` at `translateZ(-300px)` squashes a 4:3 photo to 154×153 — nearly square. You can't tell what they are. They read as grey slabs bleeding off the active image's edges, and at 390 px they're clipped by the viewport (`gallery-390-mobile.png`).
- **The nav buttons are ~200 px away from the thing they control** on desktop (they're pinned to the 800 px container, the stage is 400 px), and on mobile they sit *on top of the photo*, covering the subject's face.
- **Time cost.** Autoplay is 4 s/slide with no pause control (**AUDIT M1**). Seeing all 14 photos takes **56 seconds of sitting still**, or 13 deliberate clicks. Nobody does either.
- **All 14 download regardless** (**AUDIT M7**) — you pay full bandwidth to show 1/14th.
- **One slide breaks the aspect contract**: `opt-…251152830.JPG` is 586×600 while the other 13 are 800×600 (**AUDIT H3.2**), so the stage visibly jumps on that slide.
- **And the crop is destroying the photos.** All 14 sources are portrait phone shots force-cropped to 800×600 landscape (**AUDIT H3.1**). In `carousel-stage-1440.png` the "hero" photo of the gallery is a sideways phone frame with the subject's head clipped at the top edge. The best photos on the site are being shown at their worst.

**The pattern is wrong because a 3D rotating carousel optimises for spectacle-per-photo, and this content needs comparison-across-photos.** Fourteen photos of one relationship gain meaning from adjacency — you see the same two people in different rooms, years, moods. A carousel destroys adjacency by construction: it shows one, hides thirteen, and asks you to hold the rest in memory. It's the format you use when you have one hero image and want to make it feel like more. Here it takes fourteen real things and makes them feel like one.

Alternatives, in order of fit:

1. **Editorial grid (recommended).** A 3-column asymmetric grid on desktop / 2 on tablet / 1 on mobile, cropped to the *photo's* native aspect (portrait stays portrait), with two or three intentionally larger "plates" breaking the rhythm. All 14 visible in roughly two screens. Zero interaction required, zero JS. Adjacency restored. Highest quality-per-effort of the four.
2. **Masonry.** Same benefit, better tolerance for mixed aspects, slightly worse control over which photos get emphasis. Reasonable if the crops can't be curated.
3. **Full-bleed scroll sequence.** One photo per screen, edge to edge, with a caption. Genuinely cinematic and *very* good for an audience of one — but it's 14 screens of scroll, and it only works if every photo can carry a full viewport. Probably 5–6 of these 14 can.
4. **Lightbox.** Not an alternative — a *complement*. Grid for browsing, lightbox for looking closely. Add it to option 1; don't ship it alone.

**Recommendation: editorial grid + lightbox**, with two or three photos promoted to full-width plates to create rhythm.

### 2.6 The timeline: why it fails visually

The client rejected it. Here's the visual case, independent of that.

- **It's 78% of the site** (8,694 of 11,174 px) for content that is 14 captions averaging ~30 characters, several of which are a single emoji.
- **The alternating layout guarantees ~50% waste per row.** 368 px of content in a 1440 px viewport, and the other side of every row is empty by design. See `timeline-slice3-1440.png` and `timeline-slice4-1440.png`.
- **Three unreconciled aspect ratios in one rail.** 4 images at 4:3 (rendered 300×225), 9 videos at 9:16 (rendered **300×533**), 1 video at 16:9 (rendered 300×169). Card heights swing by **2.4×** between adjacent rows. There is no alignment grid that survives that, so the spine — the one element meant to impose order — just runs past a jumble.
- **Two image pipelines disagree.** Carousel photos are 800×600; timeline images are 400×300. Same site, same content type, different sizes.
- **The media is 300 px wide inside a 368 px card inside an 800 px rail inside a 1200 px container inside a 1440 px viewport.** Five nested containers to arrive at 300 px of photograph. Each step is individually defensible and the compound result is absurd.
- **Ten raw `<video controls>` elements** with no poster and no styling (**AUDIT H4**). What you actually see, ten times, is Chrome's native control bar — "0:00 / 0:27", a mute icon, a fullscreen icon, and a ⋮ overflow menu — sitting inside a card that was otherwise styled. `timeline-slice3-1440.png` shows it at full size. **The most-repeated visual element on the entire site is browser chrome.** Nothing was designed for the thing the page contains most of.
- **The headings aren't headings.** "👨🏾‍🍳" alone; "Adventure time🤸‍♀"; "long distance bestiesssssss". Set in 20.8 px Playfair 700 — a formal display serif carrying emoji and lowercase texting voice. The typeface and the copy are in different registers, and the emoji render in full-colour Apple/Noto glyphs against a monochrome page, so they're also the most saturated pixels in the section.

It fails because it's a *structure* pretending to be *content*. The spine, the dots, the alternation, and the 3 rem gaps all signal "a curated chronology of significant milestones." What's actually in it is a camera roll. The frame writes a cheque the contents don't cover, and the mismatch is legible at a glance — that's why it reads as filler.

### 2.7 Motion: generic, and one bug that reads as broken

The full inventory:

| Motion | Trigger | Status |
|---|---|---|
| Hero `::before` `float` | none — **infinite, always on** | 20 s translate + 180° rotate on a 3-dot SVG |
| Carousel autoplay | none — **infinite, always on** | 4 s, no pause control (**AUDIT M1**) |
| Confetti burst | video play, and "Celebrate!" | `canvas-confetti`, 3 s, random x-origin |
| Fireworks canvas | "Celebrate!" | `hsl(Math.random()*360, 100%, 60%)` |
| **Random `--primary` reassignment** | **`setInterval` 10 s, 5% chance, forever** | rewrites hero + all section titles + spine + 14 dots |
| `.reveal` scroll animation | — | **dead**, killed by `!important` (**AUDIT M4**) |
| `prefers-reduced-motion` | — | **zero occurrences site-wide** |

It reads as generic template. Three reasons:

**The effects are unrelated to the content.** Confetti and fireworks are the two most reached-for "celebration" primitives on the web; they'd be identical on any birthday page for any person. Nothing here responds to *these* photos, *this* message, *this* friendship. Effects that could be copy-pasted onto a stranger's site are decoration, not design — and for an audience of one, that's exactly backwards.

**The fireworks have no palette.** `hsl(random × 360, 100%, 60%)` is 100%-saturation random rainbow — the literal absence of a colour decision, exploding over a carefully-declared five-colour palette. It's the most visually aggressive moment on the site and it's the least designed.

**And the site changes its own colour while you read it.** Every 10 seconds there's a 5% chance `--primary` is reassigned to one of four hues — including `#10b981`, emerald green. Because `--hero-text-color`, `--section-title-color`, `--timeline-dot-color` and `--timeline-line-color` all resolve to `var(--primary)`, **the hero title, all three section titles, the 800 px spine and all 14 dots change colour mid-scroll, at random, forever.** The source comment is `// Add some birthday magic`. It doesn't read as magic; it reads as a bug — and the one person who'll see this site will see it, because she'll be on the page longer than 10 seconds.

Meanwhile the one motion that *would* have earned its place — the scroll reveal — is disabled by an `!important` override, and reduced-motion is unhandled, so someone with vestibular sensitivity gets the float, the 4-second rotation, the confetti and the fireworks with no way out.

### 2.8 Considered gift, or bootcamp project?

Bootcamp project. Not because the work is careless — the message copy is genuinely good, the mixed-media content model is a sensible idea, the CLS is clean. But the *surface* is template, and surface is all she sees.

**The three tells:**

1. **The palette and shadow are Tailwind defaults, unmodified.** `indigo-500` on `slate-900`/`slate-800`, `amber-500`, `emerald-500`, plus `shadow-2xl` on all 42 elevated surfaces. This is the colourway every tutorial ships with. It's also *cold* — blue-black and indigo — which is a strange register for the warmest possible content, and it's why the site feels like a SaaS dashboard that happens to contain photos of people.

2. **Four bolt-on "delight" effects, none connected to the content:** a 3D rotating carousel, confetti, a fireworks canvas, and a random colour shifter. Each is a self-contained party trick from a different tutorial. Together they signal *I learned some effects* rather than *I thought about you*. The random colour shifter — commented `// Add some birthday magic` — is the tell inside the tell.

3. **Nothing was designed for the content the page actually contains.** The page is 78% timeline; the timeline is 71% video; every one of those videos is a raw `<video controls>` with no poster, so the site's most-repeated visual element is Chrome's grey control bar with a ⋮ menu. Meanwhile all 14 gallery photos carry the alt text "Memory photo", the CTA renders in Arial, and the hero says "Bruce" while the nav says "Bryan". The polish went to the effects; the content was left at its defaults.

The honest summary: **it looks like a template that had photos poured into it**, and the effects are doing the emotional work the design should be doing. That's the gap to close.

---

## 3. The direction

Constraints taken as given: burgundy accent, warm neutral base, charcoal text; elegant and masculine; intimate — the audience is **one person**, not a public share; hero centrepiece is **"Happy Birthday My Ish"**.

That last constraint is the important one and it should drive everything. A site for one reader can do what a site for many cannot: it can be quiet, slow, dense with specifics, and it doesn't need to impress anyone on arrival. Confetti is a *broadcast* gesture — it performs celebration outward. A gift for one person performs inward. **Every design decision below follows from that.**

### 3.1 Three directions

**A. The Keepsake Letter** — *recommended.* A single-column letterpress-feeling page on warm paper stock, set like something printed and bound: a title page, generous margins, photographs sitting as plates within the text rather than in a separate gallery, and the message as the destination rather than the footer. Feels like opening an envelope. Intimate by construction, and it makes the strongest existing asset — the writing — the centrepiece.

**B. Quiet Luxury** — near-monochrome warm neutral, enormous whitespace, very small confident type, burgundy used once or twice per screen and never for a heading. Photographs float in wide fields of paper. Feels like a Céline lookbook or an Aesop product page: restrained, expensive, masculine. Very high ceiling, and the most elegant of the three — but it's *cool*, and coolness can read as distance. The risk is that it looks expensive rather than personal.

**C. Photo-led Zine** — photography drives, full-bleed and high-contrast, type set over and around images, tighter and more energetic, burgundy used graphically as blocks and rules. Feels like a printed photo essay. Best if the photos are strong enough to carry full viewports — but per **AUDIT H3** these are phone snaps currently mangled by a bad crop, and only a handful will survive being 1440 px wide.

**Recommendation: A, The Keepsake Letter**, borrowing B's restraint in the colour discipline. The writing is already the best thing here; the direction that puts it in the centre is the one that inverts the current 78/7 ratio in the right direction, and "a letter with photographs in it" is a thing a person makes for another person — which is precisely the read that's currently missing.

### 3.2 Type

**Display — [Fraunces](https://fonts.google.com/specimen/Fraunces)** (variable: `opsz` 9–144, `wght` 100–900, `SOFT`, `WONK`). A warm, sturdy, slightly idiosyncratic serif. Where Playfair is thin-stroked and formal, Fraunces at high optical size has weight and warmth — elegant without being delicate, which is the "masculine" half of the brief. Set `opsz` high (`72`–`144`) at display sizes, `SOFT 0`, `WONK 1` on the hero only.

**Text — [Newsreader](https://fonts.google.com/specimen/Newsreader)** (variable: `opsz` 6–72, `wght` 200–800). A text serif built for long reading, with a low-contrast, open, unfussy texture. Body copy in a serif is the whole point: **letters are set in serif**, and it's what separates "a page about someone" from "a letter to someone."

Both are Google-hosted variable fonts — self-host them (**AUDIT H5/§11**) and the whole typographic system is two files. Deliberately no sans: dropping Inter is what breaks the template look most cheaply. Micro-labels (dates, captions, chapter numbers) use Newsreader at 12–14 px, uppercase, `+0.12em` tracking.

**The scale.** Base 18 px (up from 16 — this is long-form reading), major third (**1.25**), rounded to whole pixels:

| Token | Desktop | Mobile | Line-height | Tracking | Use |
|---|---:|---:|---:|---|---|
| `display` | **70** | 40 | **1.05** | −0.03em | Hero: "Happy Birthday My Ish" |
| `title` | 55 | 34 | 1.10 | −0.025em | Section openers |
| `heading` | 44 | 28 | 1.15 | −0.02em | Chapter heads |
| `subhead` | 35 | 24 | 1.20 | −0.01em | Photo plate titles |
| `lead` | 28 | 22 | 1.40 | 0 | Opening paragraph, pull quotes |
| `body-lg` | 22 | 19 | 1.60 | 0 | The message |
| `body` | 18 | 17 | 1.65 | 0 | Everything else |
| `caption` | 14 | 14 | 1.45 | +0.01em | Photo captions |
| `micro` | 12 | 12 | 1.40 | **+0.12em** | Dates, labels — uppercase |

Adjacent steps are 1.25× apart, so **every step is visible** — the current scale's central failure. Note the leading curve: it *tightens* as size grows (1.65 → 1.05), which is the rule the current site inverts by applying 1.6 to everything.

Fluid via `clamp()` between 390 and 1440 px, so 834 px stops being an unhandled gap (**AUDIT M3**).

**Measure: 62–68 ch, left-aligned, ragged right.** Not 79, not centred. A fixed left edge is what makes a long read effortless, and it's what makes it look like a letter.

### 3.3 Spacing

Base 4 px, non-linear so the scale can *express* hierarchy instead of just measuring it:

```
4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 192
```

The rule that fixes "2rem does everything":

| Band | Values | Use |
|---|---|---|
| **Intra** | 4–24 | inside a component: label→value, caption→photo, line→line |
| **Inter** | 32–64 | between components: paragraph→photo, card→card |
| **Section** | 96–192 | between sections; the page's breathing rate |

Intra and inter must never share a value — that overlap is what makes the current page feel unstructured. Paragraph rhythm: `1em` between paragraphs of the same thought, `48px` between thoughts. Section rhythm: `128px` desktop, `96px` mobile, with the hero and the closing message taking `192px` because they're the two moments that should feel set apart.

### 3.4 Colour

```
--paper        #F6F2EC   page — warm neutral, slightly yellow-warm
--paper-sunk   #EDE7DE   alternating bands, photo mounts, card fills
--ink          #2A2724   body + headings (warm charcoal, never pure black)
--ink-muted    #6B645C   captions, dates, metadata
--burgundy     #6E1A2B   the accent
--burgundy-deep #4A0F1D  hover, rules, the closing mark
--brass        #A8894F   hairline rules and ornament only — NEVER text
```

Measured contrast on `--paper` (WCAG 2.1 relative luminance):

| Pairing | Ratio | Body 4.5 | Large 3.0 |
|---|---:|---|---|
| `ink` on `paper` | **13.32** | PASS | PASS |
| `ink` on `paper-sunk` | 12.08 | PASS | PASS |
| `ink-muted` on `paper` | 5.23 | PASS | PASS |
| `ink-muted` on `paper-sunk` | 4.74 | PASS | PASS |
| `burgundy` on `paper` | **10.20** | PASS | PASS |
| `paper` on `burgundy` (reversed) | 10.20 | PASS | PASS |
| `burgundy-deep` on `paper` | 13.67 | PASS | PASS |
| `brass` on `paper` | **2.96** | **fail** | **fail** |

`--brass` is a rule-and-ornament colour only. If it must ever carry text, use `#7A6130` (5.26 — passes).

**The hierarchy rule, which is the actual point:** headings are `--ink`, not burgundy. **Burgundy appears at most twice per viewport**, reserved for the one thing that matters in a given screen — the hero's "My Ish", a drop cap, a single rule under a chapter head, the closing line. That's the inversion of the current system, where indigo marks the hero *and* every heading *and* the spine *and* 14 dots and therefore marks nothing. An accent earns its power from scarcity.

**Radii:** `2px` on photographs, `4px` on surfaces, `0` on rules. Nothing else. Print keepsakes have square corners; the current 15/12/20/50 px mixture is the most template-looking property on the page after the colour.

**Elevation:** paper doesn't float. Default is **no shadow** and a `1px solid rgba(42,39,36,0.10)` hairline. Photographs get a *mount*, not a drop shadow:
```
--elev-photo: 0 1px 2px rgba(42,39,36,.08), 0 8px 24px rgba(42,39,36,.06);
--elev-lift:  0 2px 4px rgba(42,39,36,.10), 0 16px 40px rgba(42,39,36,.08);  /* hover only */
```
Two tiers, both far softer than the current single 50 px blur. Structure comes from rules and paper-tone shifts, not from everything hovering.

### 3.5 Motion

**The philosophy: nothing moves unless she caused it.**

The current site moves constantly and none of it is a response to her — the hero floats, the carousel rotates every 4 s, the colours shift at random. Autonomous motion is what makes a page feel like a *product*: it's performing for an audience it can't see. A gift for one person should be still until touched. Then the few things that do move mean something, because she made them happen.

**Stays still, always:**
- The hero. No float, no parallax, no ambient anything. It's a title page.
- Type. Never animates in, never shifts, never changes colour. Delete the `--primary` interval outright.
- The palette. Colour is a decision, not a variable.
- Photographs at rest.

**Moves, only in response:**

| Motion | Trigger | Duration | Easing |
|---|---|---:|---|
| Section entrance — `opacity 0→1` + `translateY(8px→0)` | scroll, **once**, `IntersectionObserver` | 400 ms | `cubic-bezier(.2,.7,.3,1)` |
| Photo hover — `scale(1→1.02)` + `--elev-photo`→`--elev-lift` | pointer | 250 ms | ease-out |
| Lightbox open / close | click | 220 ms | ease-out |
| Link / control feedback | pointer, focus | 150 ms | ease-out |

An 8 px rise, not the current 30 px — at 30 px it's an *effect*; at 8 px it's the page settling. Stagger at most one step (60 ms) between siblings, and never more than 6 items, or it becomes a queue you wait through.

**One deliberate exception — the single flourish.** Replace confetti *and* fireworks *and* the random colour shift with exactly one scripted moment, at the end, on the closing line: the burgundy rule draws itself left-to-right beneath the last sentence over ~1200 ms, then the signature fades in. Once per visit, no button required, no canvas, no library. **One moment lands; four moments cancel out.** A flourish is only special if it's the only one — and this one is made of the page's own materials, which is what makes it read as authored rather than installed.

**`prefers-reduced-motion: reduce`** collapses every row above to opacity-only at 150 ms, and the closing rule appears without drawing. Non-negotiable, and currently absent entirely (**AUDIT M1**).

### 3.6 The three highest-leverage changes

Ranked by *perceived* impact per unit of effort — what makes her say "this is way better" fastest — not by technical severity.

---

**1 · Reset the palette and the type. (CSS only — no new features, no new content.)**

Warm paper + charcoal + burgundy, in place of indigo-on-slate. Fraunces + Newsreader in place of Playfair + Inter. The real scale from §3.2, with display leading dropped from 1.6 to 1.05, negative tracking on display sizes, body at 62–68 ch left-aligned, and a `font-family` on the CTA so it stops rendering in Arial. Delete the random `--primary` interval and the six-radius mixture in the same pass.

*Why first:* it changes **100% of the pixels** and touches roughly one file. Every "this looks like a template" tell in §2.8 — the Tailwind colourway, the Playfair/Inter pairing, the 42 identical shadows — dies here. It is by a wide margin the largest visible change available per hour spent, and it requires no decisions about content.

---

**2 · Cut the timeline. Promote the letter.**

Delete the 8,694 px section the client already rejected. Fold its 4–5 genuinely good moments into the photo-led body as captioned plates, and let the remaining videos live in one small, properly-designed "watch" group with real posters (**AUDIT H4**) rather than ten raw `<video controls>` bars. Then give the message the space the timeline was occupying: it becomes the spine of the page, not the footer.

*Why second:* it's mostly **deletion**, which is the cheapest work there is, and it fixes the single worst statistic in this document — 78% of the site given to rejected filler, 7% to the actual gift. It also removes, in one stroke, the three-aspect-ratio chaos, the ~50%-empty alternating rows, and the browser-chrome-as-visual-motif problem. The page goes from ~11,200 px to roughly 4,000–5,000 px of deliberate content.

---

**3 · Re-crop the photographs and show them as an editorial grid.**

Rebuild from the retained originals (**AUDIT H3** — nothing was lost) respecting each photo's native orientation, then lay all 14 into a 3/2/1-column grid with two or three promoted to full-width plates, plus a lightbox. Photos go from *one visible at 6.3% of the viewport, 56 seconds to see them all* to *all fourteen visible in two screens, instantly, uncropped.*

*Why third:* highest ceiling of the three, but it's the only one that needs real engineering — the image pipeline has to be rebuilt before the layout can be trusted. It also has a dependency the other two don't: someone has to *look* at 14 photos and decide which three deserve to be large. That curation is what will make it feel personal, and it can't be automated.

---

*Items 1 and 2 together are achievable in a single focused pass and would carry most of the perceived jump on their own. Item 3 is what takes it from "much better" to "someone made this for me."*

---

## 4. Handoff to PLAN.md

What this document decides, and what it deliberately leaves open:

**Decided:** the aesthetic direction (Keepsake Letter), the type families and full scale, the spacing scale and its intra/inter/section rule, the colour tokens with verified contrast, the radius and elevation system, the motion philosophy, and the ranked order of the three highest-leverage changes.

**Left open for PLAN.md:** which 5–6 photos get promoted to plates and which timeline moments survive the cut (both need a human to look at the content); whether the message stays one long letter or is broken into 2–3 chapters; and where the videos live once they're out of the timeline. None of these block starting on change #1.

**Depends on AUDIT:** #3 is gated on the image pipeline rebuild (**H3**); the video treatment is gated on posters and transcoding (**H4/§13**); self-hosting the two font files should land with the build step (**H5/§11**).

**No feature code was written for this audit.** The only files added are `DESIGN.md` and `/design-audit/`.
