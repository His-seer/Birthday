/**
 * ONE-SHOT MIGRATION — 2025 -> the new content model.
 *
 * Reads the old Express app's data and emits:
 *   src/content/timeline/2025.json   the 14 cumulative timeline events
 *   src/content/archive/2025.json    last year's message, ROUTE-LESS
 *   scripts/.gallery-seed.json       13 deduped photos, to fold into 2026.json
 *
 * Safe to re-run: it only reads the old files and overwrites its own outputs.
 *
 * Run:  npm run migrate:2025
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// __dirname-relative throughout. AUDIT N3: the old server mixed cwd-relative
// and __dirname-relative paths and only worked when launched from repo root.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SRC_CONTENT = path.join(ROOT, 'server', 'content.json');
const SRC_INDEX = path.join(ROOT, 'public', 'index.html');
const UPLOADS = path.join(ROOT, 'public', 'uploads');

const OUT_TIMELINE = path.join(ROOT, 'src', 'content', 'timeline', '2025.json');
const OUT_ARCHIVE = path.join(ROOT, 'src', 'content', 'archive', '2025.json');
const OUT_GALLERY = path.join(__dirname, '.gallery-seed.json');

const TODO = 'TODO-CONTENT';

/**
 * Titles are carried VERBATIM (emoji, U+2019 apostrophes and all) because they
 * are preserved history. But ids must be stable ASCII slugs, and two titles
 * cannot produce one automatically:
 *
 *   index 5  "\u{1F468}\u{1F3FE}‍\u{1F373}"  emoji-only -> empty slug
 *
 * Overrides are explicit and reviewable rather than hidden in a regex.
 */
const ID_OVERRIDES = {
  5: 'he-cooks-again',
};

/** Photos that are byte-identical duplicates of an earlier entry. Verified by
 *  size and content hash during the audit: both are 127,229 bytes and BOTH are
 *  referenced, so the gallery showed the same photo twice (AUDIT N2). */
const DUPLICATE_PHOTOS = new Set(['1757719433138-328068506.JPG']);

function slugify(title, index) {
  if (ID_OVERRIDES[index]) return ID_OVERRIDES[index];

  const slug = title
    .normalize('NFKD')
    // Drop combining marks, emoji, ZWJ, variation selectors, skin-tone
    // modifiers, and the U+2019 apostrophe (so "you’re" -> "youre").
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’']/g, '')
    .replace(/[^\p{ASCII}]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug) {
    throw new Error(
      `Title at index ${index} produced an empty slug: ${JSON.stringify(title)}\n` +
        `Add an entry to ID_OVERRIDES in scripts/migrate-2025.mjs.`
    );
  }
  return slug;
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

function ratio(width, height) {
  const d = gcd(width, height) || 1;
  return `${width / d}:${height / d}`;
}

/** Real aspect from the file. Respects EXIF orientation, so a portrait phone
 *  photo reports portrait — which is the whole point of AUDIT H3.1. */
async function imageAspect(absPath) {
  const meta = await sharp(absPath).rotate().metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`Could not read dimensions from ${absPath}`);
  }
  return { aspect: ratio(meta.width, meta.height), width: meta.width, height: meta.height };
}

async function main() {
  if (!existsSync(SRC_CONTENT)) {
    throw new Error(`Missing ${SRC_CONTENT}. Run this before deleting server/.`);
  }

  const old = JSON.parse(await readFile(SRC_CONTENT, 'utf8'));

  // ---------------------------------------------------------------- timeline
  const events = [];
  const videoAspectTodo = [];

  for (const [i, ev] of old.timeline.entries()) {
    const id = slugify(ev.title, i);
    const isVideo = ev.type === 'video' || ev.type === 'text_video';
    const filename = isVideo ? ev.video : ev.image;

    if (!filename) {
      throw new Error(`Event ${i} (${ev.type}) has no media filename.`);
    }

    let media;
    if (isVideo) {
      // ffprobe is not available yet, so aspect is provisional. scripts/video.mjs
      // rewrites every one of these from the real encoded output when it runs.
      media = {
        kind: 'video',
        src: `timeline/2025/${id}`,
        alt: TODO,
        aspect: '9:16',
        poster: `timeline/2025/${id}-poster`,
      };
      videoAspectTodo.push(id);
    } else {
      const abs = path.join(UPLOADS, 'timeline', filename);
      const { aspect } = await imageAspect(abs);
      media = {
        kind: 'image',
        src: `timeline/2025/${id}`,
        alt: TODO,
        aspect,
      };
    }

    events.push({
      id,
      // No date field existed on any 2025 event. Every photo record carries
      // 9/12/2025, so that is the honest default. See PLAN.md open question 2.
      date: '2025-09-12',
      title: ev.title, // VERBATIM — preserved history, not rewritten
      story: TODO, // all 14 had content:"" (AUDIT N2)
      media,
    });
  }

  await mkdir(path.dirname(OUT_TIMELINE), { recursive: true });
  await writeFile(
    OUT_TIMELINE,
    JSON.stringify(
      { year: 2025, label: `2025 — ${TODO}`, events },
      null,
      2
    ) + '\n'
  );

  // ----------------------------------------------------------------- archive
  // Last year's message, lifted out of hardcoded HTML into a ROUTE-LESS file.
  // It is deliberately NOT in the `years` collection, so no 2026 page can query
  // it even by accident. That is the guard against the brief's worst-case bug:
  // a stale 2025 line surfacing in a 2026 birthday gift.
  // MERGE, never clobber. This file also carries hand-authored page chrome for
  // the /2025/ archive route (hero, section titles, display name). Once
  // public/index.html is gone, a blind overwrite here would silently wipe that.
  let archive = existsSync(OUT_ARCHIVE)
    ? JSON.parse(await readFile(OUT_ARCHIVE, 'utf8'))
    : { year: 2025, paragraphs: [], closing: [] };

  if (!existsSync(SRC_INDEX)) {
    console.warn(
      `  note: public/index.html is gone, so archive paragraphs were left as-is (${archive.paragraphs?.length ?? 0} kept).`
    );
  }

  if (existsSync(SRC_INDEX)) {
    // Strip HTML comments FIRST. index.html:115-118 contains four commented-out
    // <p class="message-text"> lines of generic template copy ("You light up
    // every room...") left over from the original build. Matching without this
    // pulls that filler in alongside the real message.
    const html = (await readFile(SRC_INDEX, 'utf8')).replace(/<!--[\s\S]*?-->/g, '');
    const strip = (s) =>
      s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    archive.paragraphs = [...html.matchAll(/<p class="message-text">([\s\S]*?)<\/p>/g)]
      .map((m) => strip(m[1]))
      .filter(Boolean);
    archive.closing = [...html.matchAll(/<p class="message-highlight">([\s\S]*?)<\/p>/g)]
      .map((m) => strip(m[1]))
      .filter(Boolean);
  }
  await mkdir(path.dirname(OUT_ARCHIVE), { recursive: true });
  await writeFile(OUT_ARCHIVE, JSON.stringify(archive, null, 2) + '\n');

  // ------------------------------------------------------------ gallery seed
  const gallery = [];
  for (const photo of old.photos) {
    if (DUPLICATE_PHOTOS.has(photo.original)) continue;

    const abs = path.join(UPLOADS, 'photos', photo.original);
    const { aspect } = await imageAspect(abs);
    const id = path.parse(photo.original).name;

    gallery.push({
      src: `photos/2025/${id}`,
      alt: TODO,
      // The `caption` field already existed and was empty on all 14 (AUDIT M1).
      caption: TODO,
      aspect,
      plate: false,
      _sourceFile: photo.original, // consumed by the image pipeline, then dropped
    });
  }
  await writeFile(OUT_GALLERY, JSON.stringify(gallery, null, 2) + '\n');

  // ------------------------------------------------------------------ report
  const portrait = gallery.filter((g) => {
    const [w, h] = g.aspect.split(':').map(Number);
    return h > w;
  }).length;

  console.log(`
Migration complete.

  timeline/2025.json   ${events.length} events  (${events.filter((e) => e.media.kind === 'video').length} video, ${events.filter((e) => e.media.kind === 'image').length} image)
  archive/2025.json    ${archive.paragraphs.length} paragraphs, ${archive.closing.length} closing lines  [ROUTE-LESS]
  .gallery-seed.json   ${gallery.length} photos  (${old.photos.length} - ${old.photos.length - gallery.length} duplicate)

  ${portrait} of ${gallery.length} photos are PORTRAIT.
  Last year all of them were force-cropped to 800x600 landscape (AUDIT H3.1).

  Video aspect ratios are provisional ("9:16") for ${videoAspectTodo.length} clips.
  scripts/video.mjs rewrites them from real output.

  ${TODO} placeholders written: ${events.length} story, ${events.length} media.alt,
  ${gallery.length} gallery.alt, ${gallery.length} gallery.caption, 1 year label.
`);
}

main().catch((err) => {
  console.error(`\nMigration failed: ${err.message}\n`);
  process.exit(1);
});
