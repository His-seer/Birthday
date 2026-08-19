/**
 * BUILD GATES — every one of these FAILS the build. None of them warn.
 *
 * Each check exists because something specific went wrong last year. The point
 * is that those failures become impossible to reintroduce silently, rather
 * than being caught by someone remembering to look.
 *
 * Run:  npm run verify        (wired into `npm run build`)
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

// Cloudflare Pages hard caps, verified 2026-08-10 against
// https://developers.cloudflare.com/pages/platform/limits/
const PAGES_FILE_CAP = 25 * 1024 * 1024; // cannot be raised
const ASSET_BUDGET = 20 * 1024 * 1024; // our own headroom
const PAGES_FILE_COUNT = 20_000;

const INITIAL_BUDGET = 500 * 1024; // brief: < 500 KB before any video plays
const JS_BUDGET = 50 * 1024; // brief: JS < 50 KB

const KB = (n) => (n / 1024).toFixed(1);
const MiB = (n) => (n / 1048576).toFixed(2);

const failures = [];
const notes = [];
const fail = (check, msg) => failures.push(`[${check}] ${msg}`);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

/* ---------------------------------------------------------------- contrast */
function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function luminance(hex) {
  const m = hex.replace('#', '').match(/.{2}/g).map((h) => parseInt(h, 16));
  const [r, g, b] = m.map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const TOKENS = {
  paper: '#F6F2EC',
  paperSunk: '#EDE7DE',
  ink: '#2A2724',
  inkMuted: '#6B645C',
  burgundy: '#6E1A2B',
  burgundyDeep: '#4A0F1D',
  brass: '#A8894F',
};

// [foreground, background, minimum ratio, label]
const PAIRS = [
  ['ink', 'paper', 4.5, 'body text'],
  ['ink', 'paperSunk', 4.5, 'body text on sunk band'],
  ['inkMuted', 'paper', 4.5, 'captions/dates'],
  ['inkMuted', 'paperSunk', 4.5, 'captions on sunk band'],
  ['burgundy', 'paper', 4.5, 'accent text'],
  ['burgundy', 'paperSunk', 4.5, 'accent on sunk band'],
  ['burgundyDeep', 'paper', 4.5, 'accent hover'],
  ['paper', 'burgundy', 4.5, 'reversed (skip link, seal)'],
];

async function checkContrast(cssText) {
  for (const [fg, bg, min, label] of PAIRS) {
    const ratio = contrast(TOKENS[fg], TOKENS[bg]);
    if (ratio < min) {
      fail('contrast', `${label}: ${fg} on ${bg} = ${ratio.toFixed(2)}:1, needs ${min}:1`);
    } else {
      notes.push(`  contrast  ${label.padEnd(30)} ${fg} on ${bg} = ${ratio.toFixed(2)}:1`);
    }
  }

  // --brass fails AA at 2.96:1 and is an ornament colour only. Last year's
  // "Elegant" preset shipped text at 1.00:1 — identical luminance, invisible
  // text (AUDIT M2). This makes that class of regression a build failure.
  const brassRatio = contrast(TOKENS.brass, TOKENS.paper);
  const brassAsText =
    /(?:^|[;{\s])color\s*:\s*var\(\s*--brass\s*\)/.test(cssText) ||
    /-webkit-text-fill-color\s*:\s*var\(\s*--brass\s*\)/.test(cssText);
  if (brassAsText) {
    fail(
      'contrast',
      `--brass is bound to a text colour but is ${brassRatio.toFixed(2)}:1 on paper (fails AA). ` +
        `It is an ornament colour. Use #7A6130 (5.26:1) if text must be brass.`
    );
  } else {
    notes.push(`  contrast  --brass used for ornament only (${brassRatio.toFixed(2)}:1, correctly not text)`);
  }
}

/* ------------------------------------------------------------------- main */
async function main() {
  if (!existsSync(DIST)) {
    console.error('\nNo dist/. Run `npm run build`.\n');
    process.exit(1);
  }

  const files = await walk(DIST);
  const sizes = new Map();
  let total = 0;
  for (const f of files) {
    const s = (await stat(f)).size;
    sizes.set(f, s);
    total += s;
  }

  /* 1. ASSET CAPS ------------------------------------------------------- */
  // The 25 MiB per-file cap is hard and unraisable. A single oversized asset
  // fails the whole deploy, so this must never be a warning.
  for (const [f, s] of sizes) {
    const rel = path.relative(DIST, f);
    if (s > PAGES_FILE_CAP) {
      fail('assets', `${rel} is ${MiB(s)} MiB — EXCEEDS the Cloudflare Pages 25 MiB hard cap.`);
    } else if (s > ASSET_BUDGET) {
      fail('assets', `${rel} is ${MiB(s)} MiB — over our ${MiB(ASSET_BUDGET)} MiB budget (cap is 25 MiB).`);
    }
  }
  if (files.length > PAGES_FILE_COUNT) {
    fail('assets', `${files.length} files exceeds the Pages free-tier limit of ${PAGES_FILE_COUNT}.`);
  }
  const largest = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0];
  notes.push(`  assets    ${files.length} files, ${MiB(total)} MiB total`);
  notes.push(`  assets    largest: ${path.relative(DIST, largest[0])} at ${MiB(largest[1])} MiB (cap 25 MiB)`);

  /* 2. HTML-DERIVED CHECKS ---------------------------------------------- */
  const htmlFiles = files.filter((f) => f.endsWith('.html'));
  if (htmlFiles.length === 0) fail('html', 'No HTML emitted.');

  let allCss = '';
  for (const f of files.filter((f) => f.endsWith('.css'))) {
    allCss += await readFile(f, 'utf8');
  }

  for (const htmlFile of htmlFiles) {
    const html = await readFile(htmlFile, 'utf8');
    const rel = path.relative(DIST, htmlFile);

    /* 2a. Explicit dimensions on every <img> — this is what holds CLS at 0.
           AUDIT measured CLS = 0 across a full scroll; preserve it. */
    const imgs = html.match(/<img\b[^>]*>/g) ?? [];
    const missingDims = imgs.filter(
      (tag) => !/\swidth\s*=/.test(tag) || !/\sheight\s*=/.test(tag)
    );
    if (missingDims.length) {
      fail('dimensions', `${rel}: ${missingDims.length} <img> without explicit width/height (CLS risk).`);
    }

    /* 2b. Any <video> in static HTML must have a poster and preload="none".
           AUDIT H4: 11 videos, zero posters, no preload -> 2,395 KB of video
           transferred before any interaction. */
    const videos = html.match(/<video\b[^>]*>/g) ?? [];
    for (const tag of videos) {
      if (!/\sposter\s*=/.test(tag)) fail('video', `${rel}: <video> without poster.`);
      if (!/preload\s*=\s*["']none["']/.test(tag)) fail('video', `${rel}: <video> without preload="none".`);
    }

    /* 2c. Zero render-blocking third-party requests. Last year: Google Fonts
           (14 KB blocking), Font Awesome (87 KB blocking for SIX icons), and
           jsDelivr, with no resource hints on any of them. */
    const fetched = [
      ...[...html.matchAll(/<link[^>]+href=["']([^"']+)["']/g)].map((m) => ({
        url: m[1],
        tag: m[0],
      })),
      ...[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => ({
        url: m[1],
        tag: m[0],
      })),
      ...[...html.matchAll(/<img[^>]+src=["']([^"']+)["']/g)].map((m) => ({ url: m[1], tag: m[0] })),
    ];
    for (const { url, tag } of fetched) {
      // rel=canonical is metadata, not a fetch.
      if (/rel=["']canonical["']/.test(tag)) continue;
      if (/^https?:\/\//i.test(url) || url.startsWith('//')) {
        fail('thirdparty', `${rel}: external resource ${url}`);
      }
    }

    /* 2d. Privacy — the site is for one person. */
    if (!/name=["']robots["'][^>]*noindex/i.test(html)) {
      fail('privacy', `${rel}: missing <meta name="robots" content="noindex...">`);
    }

    /* 2e. Landmarks and accessible names (AUDIT M1: zero landmarks existed). */
    if (!/<main\b/.test(html)) fail('a11y', `${rel}: no <main> landmark.`);
    if (!/class=["'][^"']*skip-link/.test(html)) fail('a11y', `${rel}: no skip link.`);
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    for (const b of buttons) {
      const hasAria = /aria-label\s*=\s*["'][^"']+["']/.test(b);
      const inner = b.replace(/<[^>]+>/g, '').trim();
      if (!hasAria && !inner) fail('a11y', `${rel}: <button> with no accessible name.`);
    }

    /* 2f. No 2025 content may appear on a 2026 surface. The brief calls a
           stale line in a 2026 gift "the worst possible bug here".

           The /2025/ archive page is exempt by design — showing last year's
           letter is the entire point of it, and it is labelled as 2025. Every
           other page is still guarded. */
    const isArchivePage = /^2025[\\/]/.test(rel) || rel === '2025.html';
    const archive = path.join(ROOT, 'src', 'content', 'archive', '2025.json');
    if (!isArchivePage && existsSync(archive)) {
      const old = JSON.parse(await readFile(archive, 'utf8'));
      const text = html.replace(/<[^>]+>/g, ' ');
      for (const line of [...(old.paragraphs ?? []), ...(old.closing ?? [])]) {
        const probe = line.slice(0, 40).trim();
        if (probe.length > 20 && text.includes(probe)) {
          fail('content', `${rel}: 2025 archive copy is rendering on a 2026 page: "${probe}..."`);
        }
      }
    }
  }

  /* 3. PAYLOAD BUDGET, PER PAGE ----------------------------------------- */
  for (const htmlFile of htmlFiles) {
    const html = await readFile(htmlFile, 'utf8');
    const rel = path.relative(DIST, htmlFile) || 'index.html';
    let initial = sizes.get(htmlFile) ?? 0;
    let js = 0;
    let fontBytes = 0;

    const cssRefs = [
      ...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g),
    ].map((m) => m[1]);
    const jsRefs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]);

    for (const ref of [...cssRefs, ...jsRefs]) {
      const p = path.join(DIST, ref.replace(/^\//, ''));
      const s = sizes.get(p);
      if (!s) continue;
      initial += s;
      if (ref.endsWith('.js')) js += s;
    }

    // Inline scripts count toward the JS budget too.
    for (const m of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      js += Buffer.byteLength(m[1], 'utf8');
    }

    /* Fonts arrive via @font-face inside CSS, not via a <link>, so they never
       appear in the markup — but they are unambiguously part of what loads
       before anything is readable.
       Attribute them PER PAGE by reading the url() references out of the CSS
       this page actually links. Summing every font in dist/ would charge the
       2026 page for Playfair and Inter, which only /2025/ loads.
       Count the subsets an English page really pulls: latin, upright.
       unicode-range keeps latin-ext and italics out of the first load. */
    const seenFonts = new Set();
    for (const ref of cssRefs) {
      const cssPath = path.join(DIST, ref.replace(/^\//, ''));
      if (!existsSync(cssPath)) continue;
      const css = await readFile(cssPath, 'utf8');
      for (const m of css.matchAll(/url\(\s*["']?([^"')]+\.woff2?)["']?\s*\)/g)) {
        const fontRel = m[1].split('?')[0];
        const name = path.basename(fontRel);
        if (!/-latin-/.test(name) || /-latin-ext-/.test(name)) continue;
        if (/italic/i.test(name)) continue;
        if (seenFonts.has(name)) continue;
        seenFonts.add(name);
        const candidate = [...sizes.keys()].find((p) => path.basename(p) === name);
        if (candidate) fontBytes += sizes.get(candidate);
      }
    }
    initial += fontBytes;

    if (initial > INITIAL_BUDGET) {
      fail('budget', `${rel}: initial payload ${KB(initial)} KB exceeds ${KB(INITIAL_BUDGET)} KB.`);
    }
    if (js > JS_BUDGET) {
      fail('budget', `${rel}: JS ${KB(js)} KB exceeds ${KB(JS_BUDGET)} KB.`);
    }
    notes.push(
      `  budget    ${rel.padEnd(22)} initial ${(KB(initial) + ' KB').padStart(9)} / ${KB(INITIAL_BUDGET)}   ` +
        `JS ${(KB(js) + ' KB').padStart(8)} / ${KB(JS_BUDGET)}   fonts ${KB(fontBytes)} KB`
    );
  }

  /* 4. CONTRAST --------------------------------------------------------- */
  await checkContrast(allCss);

  /* 5. MEDIA MANIFEST --------------------------------------------------- */
  const manifestPath = path.join(ROOT, 'media', 'manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    let checked = 0;
    for (const [key, entry] of Object.entries(manifest)) {
      for (const rel of [entry.mp4, entry.webm]) {
        if (!rel) continue;
        const p = path.join(DIST, 'media', rel);
        if (!existsSync(p)) {
          fail('media', `${key}: promised ${rel} is missing from dist/media/.`);
        } else checked++;
      }
      if (!entry.poster) fail('media', `${key}: no poster recorded.`);
    }

    /* WIRING CHECK — the files existing in dist/ is NOT enough.
       A manifest-resolution bug once made every video URL render as an empty
       attribute: the files shipped, the posters shipped, every other gate
       passed, and nothing played on the deployed site. Dev was unaffected, so
       only the built HTML could reveal it. Assert the markup actually points
       at the media it promises. */
    let allHtml = '';
    for (const f of htmlFiles) allHtml += await readFile(f, 'utf8');

    const unreferenced = [];
    for (const [key, entry] of Object.entries(manifest)) {
      if (!entry.mp4) continue;
      if (!allHtml.includes(`/media/${entry.mp4.split(path.sep).join('/')}`)) {
        unreferenced.push(key);
      }
    }
    if (unreferenced.length === Object.keys(manifest).length && unreferenced.length > 0) {
      fail(
        'media',
        `NO video URL appears in any built HTML (${unreferenced.length} clips). ` +
          `The manifest resolved to nothing at build time — check src/lib/media.ts.`
      );
    } else if (unreferenced.length) {
      notes.push(
        `  media     ${unreferenced.length} clip(s) built but not referenced by any page: ${unreferenced.slice(0, 3).join(', ')}`
      );
    }

    const wired = Object.keys(manifest).length - unreferenced.length;
    notes.push(`  media     ${checked} video file(s) present, ${wired} wired into HTML`);
  }

  /* 6. OUTSTANDING CONTENT ---------------------------------------------- */
  // Reported, never failed: the site must build and preview with placeholders.
  let todos = 0;
  const contentDir = path.join(ROOT, 'src', 'content');
  if (existsSync(contentDir)) {
    for (const f of (await walk(contentDir)).filter((f) => f.endsWith('.json'))) {
      if (f.includes(`${path.sep}archive${path.sep}`)) continue;
      const text = await readFile(f, 'utf8');
      todos += (text.match(/TODO-CONTENT/g) ?? []).length;
    }
  }
  notes.push(`  content   ${todos} TODO-CONTENT placeholder(s) still awaiting client content`);

  /* ------------------------------------------------------------- report */
  console.log('\n' + notes.join('\n'));
  if (failures.length) {
    console.error(`\n  ${failures.length} CHECK(S) FAILED:\n`);
    for (const f of failures) console.error(`    ${f}`);
    console.error('');
    process.exit(1);
  }
  console.log('\n  All build gates passed.\n');
}

main().catch((err) => {
  console.error(`\nverify failed: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
