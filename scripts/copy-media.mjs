/**
 * Copies derived video into the build output.
 *
 *   media/derived/**  ->  dist/media/**
 *
 * Video lives outside src/ and outside git (the brief: "never commit media").
 * Astro therefore does not know about it, so it is copied in after the build
 * and shipped by `wrangler pages deploy dist`.
 *
 * Filenames already carry a content hash from scripts/video.mjs, which is what
 * makes the immutable Cache-Control in public/_headers safe.
 *
 * Run:  node scripts/copy-media.mjs   (wired into `npm run build`)
 */

import { cp, mkdir, readdir, stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DERIVED = path.join(ROOT, 'media', 'derived');
const DIST_MEDIA = path.join(ROOT, 'dist', 'media');
const MANIFEST = path.join(ROOT, 'media', 'manifest.json');

const MiB = (n) => (n / 1048576).toFixed(2);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

async function main() {
  if (!existsSync(path.join(ROOT, 'dist'))) {
    throw new Error('No dist/. Run `astro build` first.');
  }

  if (!existsSync(DERIVED)) {
    console.log('\n  No media/derived/ — skipping video copy.');
    console.log('  Run `npm run media` to build video from masters.\n');
    return;
  }

  await mkdir(DIST_MEDIA, { recursive: true });
  await cp(DERIVED, DIST_MEDIA, { recursive: true });

  const files = await walk(DIST_MEDIA);
  let bytes = 0;
  for (const f of files) bytes += (await stat(f)).size;

  // Verify every file the manifest promises actually landed. The manifest is
  // committed while the bytes are not, so this is the guard against a deploy
  // that silently ships missing video.
  const missing = [];
  if (existsSync(MANIFEST)) {
    const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
    for (const entry of Object.values(manifest)) {
      for (const rel of [entry.mp4, entry.webm]) {
        if (!rel) continue;
        if (!existsSync(path.join(DIST_MEDIA, rel))) missing.push(rel);
      }
    }
  }

  console.log(`\n  media -> dist/media   ${files.length} files, ${MiB(bytes)} MiB`);
  if (missing.length) {
    console.error(`\n  MISSING ${missing.length} file(s) promised by media/manifest.json:`);
    for (const m of missing) console.error(`    ${m}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\nMedia copy failed: ${err.message}\n`);
  process.exit(1);
});
