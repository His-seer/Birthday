/**
 * IMAGE PIPELINE — stage 1 of 2.
 *
 *   media/masters/<year>/photos/<id>.<ext>     ->  src/assets/photos/<year>/<id>.jpg
 *   media/masters/<year>/timeline/<slug>.<ext> ->  src/assets/timeline/<year>/<slug>.jpg
 *
 * This stage NORMALISES. Astro's <Picture> does stage 2 (responsive AVIF+WebP
 * with srcset). Splitting them means one source of truth for srcset and no
 * double-lossy re-encode chain.
 *
 * What this fixes, precisely (AUDIT H3):
 *
 *   H3.1  Last year: .resize(800, 600, { fit: 'cover' }) on sources that are
 *         ALL portrait (verified: 13 of 13). On a 1179x2556 phone photo that
 *         keeps the middle third and throws away ~65% of frame height. Heads
 *         got cut off. Here: fit 'inside', so nothing is ever cropped.
 *   H3.2  withoutEnlargement broke the aspect contract, producing one 586x600
 *         item among thirteen 800x600. Here: aspect is always preserved, and
 *         small sources simply stay small.
 *   H3.3  JPEG bytes were written into .PNG filenames. Here: the encoder picks
 *         the extension, so the two cannot disagree.
 *
 * Also strips EXIF. sharp drops metadata by default (we never call
 * .withMetadata()), which removes GPS coordinates. These are personal photos
 * of real places; shipping their coordinates on a public URL is a genuine
 * privacy leak and was not in the brief.
 *
 * Idempotent: unchanged masters are skipped via a content hash cache.
 *
 * Run:  npm run media:images
 */

import { readdir, mkdir, stat, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MASTERS = path.join(ROOT, 'media', 'masters');
const ASSETS = path.join(ROOT, 'src', 'assets');
const CACHE = path.join(ROOT, 'media', '.images-cache.json');

/**
 * Long-edge cap for the committed intermediate.
 *
 * Sized for the largest real display: a full-width plate or a lightbox on a
 * 1440px viewport at 2x DPR. A 9:16 portrait shown ~900px tall in a lightbox
 * needs 1800px on the long edge at 2x. Going higher only inflates the repo.
 */
const LONG_EDGE = 1800;
const QUALITY = 90;

/* heic/heif included because iPhone stills arrive that way. libheif IS compiled
   into the prebuilt sharp, so no external converter is needed — but see UNLIMITED
   below, without which every one of them fails. */
const SOURCE_RE = /\.(jpe?g|png|webp|avif|tiff?|heic|heif)$/i;

/**
 * Removes libvips' input safety limits.
 *
 * Needed for real iPhone HEICs: libheif caps an `iref` box at 16 references and
 * a 2026 delivery photo carries 45 (HDR gain maps and depth data each add one),
 * so decoding fails with "Security limit exceeded" — a limit, NOT a missing
 * codec. The limits exist to bound memory on hostile input; these are the
 * client's own photos, processed once a year on a developer machine, so the
 * trade is worth it. Applies to input decoding only.
 */
const UNLIMITED = { unlimited: true };
const KiB = (n) => (n / 1024).toFixed(0);
const MiB = (n) => (n / 1024 / 1024).toFixed(2);

async function hashFile(p) {
  return createHash('sha256').update(await readFile(p)).digest('hex');
}

async function loadCache() {
  if (!existsSync(CACHE)) return {};
  try {
    return JSON.parse(await readFile(CACHE, 'utf8'));
  } catch {
    return {};
  }
}

async function main() {
  if (!existsSync(MASTERS)) {
    console.error(`\nNo masters at media/masters/.\nSee README "Yearly update" — masters are gitignored and must be restored from backup.\n`);
    process.exit(1);
  }

  const cache = await loadCache();
  const next = {};
  let inBytes = 0;
  let outBytes = 0;
  const rows = [];
  let skipped = 0;
  let notUpscaled = 0;

  for (const year of (await readdir(MASTERS, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)) {
    for (const kind of ['photos', 'timeline']) {
      const dir = path.join(MASTERS, year, kind);
      if (!existsSync(dir)) continue;

      for (const file of await readdir(dir)) {
        if (!SOURCE_RE.test(file)) continue;

        const from = path.join(dir, file);
        const id = path.parse(file).name;
        const outDir = path.join(ASSETS, kind, year);
        const to = path.join(outDir, `${id}.jpg`);
        const key = `${kind}/${year}/${id}`;

        const srcHash = await hashFile(from);
        const srcSize = (await stat(from)).size;
        inBytes += srcSize;

        if (cache[key] === srcHash && existsSync(to)) {
          outBytes += (await stat(to)).size;
          next[key] = srcHash;
          skipped++;
          continue;
        }

        await mkdir(outDir, { recursive: true });

        const meta = await sharp(from, UNLIMITED).rotate().metadata();

        await sharp(from, UNLIMITED)
          // Auto-orient FIRST. Method order matters when rotating and resizing.
          // .autoOrient() is the explicit form added in sharp 0.34; bare
          // .rotate() only does this for backwards compatibility.
          .autoOrient()
          .resize(LONG_EDGE, LONG_EDGE, {
            // NEVER 'cover'. This single option is the H3.1 fix.
            fit: 'inside',
            // Never upscale a small source into a blurry big one.
            withoutEnlargement: true,
          })
          // No .withMetadata() -> EXIF (incl. GPS) is dropped.
          .jpeg({ quality: QUALITY, mozjpeg: true })
          .toFile(to);

        const outSize = (await stat(to)).size;
        const outMeta = await sharp(to).metadata();
        outBytes += outSize;
        next[key] = srcHash;

        if (Math.max(outMeta.width, outMeta.height) < LONG_EDGE) notUpscaled++;

        rows.push({
          key,
          from: `${meta.width}x${meta.height}`,
          to: `${outMeta.width}x${outMeta.height}`,
          srcSize,
          outSize,
          hadExif: Boolean(meta.exif),
          portrait: outMeta.height > outMeta.width,
        });
      }
    }
  }

  await writeFile(CACHE, JSON.stringify(next, null, 2) + '\n');

  console.log(`\nImages — normalised to <=${LONG_EDGE}px long edge, JPEG q${QUALITY}, EXIF stripped\n`);
  for (const r of rows.sort((a, b) => a.key.localeCompare(b.key))) {
    console.log(
      `  ${r.from.padEnd(11)} -> ${r.to.padEnd(11)} ` +
        `${(KiB(r.srcSize) + 'K').padStart(7)} -> ${(KiB(r.outSize) + 'K').padStart(6)}  ` +
        `${r.portrait ? 'portrait' : 'landscape'.padEnd(8)}  ${r.hadExif ? 'EXIF-STRIPPED' : '            '}  ${r.key}`
    );
  }

  const exifCount = rows.filter((r) => r.hadExif).length;
  const portraitCount = rows.filter((r) => r.portrait).length;

  console.log(`
  processed ${rows.length}   skipped (unchanged) ${skipped}
  masters ${MiB(inBytes)} MiB  ->  assets ${MiB(outBytes)} MiB
  ${portraitCount} of ${rows.length} outputs are PORTRAIT — aspect preserved, nothing cropped
  ${exifCount} had EXIF metadata, all stripped (GPS included)
  ${notUpscaled} sources were smaller than ${LONG_EDGE}px and were NOT upscaled
`);
}

main().catch((err) => {
  console.error(`\nImage pipeline failed: ${err.message}\n`);
  process.exit(1);
});
