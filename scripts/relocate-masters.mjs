/**
 * ONE-SHOT — move media masters out of public/ and out of git.
 *
 *   public/uploads/**  ->  media/masters/2025/**
 *
 * Why (AUDIT C5 / N2): masters are masters, not web assets. Today 23.7 MB of
 * unreferenced originals sit in public/ where they are publicly downloadable
 * and inflate every deploy, and the whole 140 MiB tree is committed to git.
 *
 * Layout after this runs — chosen so the image/video pipelines need NO lookup
 * table. The output path is derived structurally from the master path:
 *
 *   media/masters/2025/photos/<id>.<ext>      ->  photos/2025/<id>
 *   media/masters/2025/timeline/<slug>.<ext>  ->  timeline/2025/<slug>
 *
 * Timeline media is RENAMED to its event slug, so next year's update is
 * "drop in a file named after the moment" rather than "paste a timestamp".
 *
 * Nothing is deleted. Unreferenced files move to _unused/ so they are out of
 * the way but recoverable.
 *
 * Run:  node scripts/relocate-masters.mjs
 */

import { readFile, mkdir, rename, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const UPLOADS = path.join(ROOT, 'public', 'uploads');
const DEST = path.join(ROOT, 'media', 'masters', '2025');

const TIMELINE_JSON = path.join(ROOT, 'src', 'content', 'timeline', '2025.json');
const GALLERY_SEED = path.join(__dirname, '.gallery-seed.json');
const OLD_CONTENT = path.join(ROOT, 'server', 'content.json');

const MiB = (n) => (n / 1024 / 1024).toFixed(3);

async function move(from, to) {
  await mkdir(path.dirname(to), { recursive: true });
  await rename(from, to);
  return (await stat(to)).size;
}

async function main() {
  if (!existsSync(UPLOADS)) {
    console.log('public/uploads no longer exists — already relocated. Nothing to do.');
    return;
  }
  for (const f of [TIMELINE_JSON, GALLERY_SEED, OLD_CONTENT]) {
    if (!existsSync(f)) throw new Error(`Missing ${path.relative(ROOT, f)}. Run: npm run migrate:2025`);
  }

  const timeline = JSON.parse(await readFile(TIMELINE_JSON, 'utf8'));
  const gallery = JSON.parse(await readFile(GALLERY_SEED, 'utf8'));
  const old = JSON.parse(await readFile(OLD_CONTENT, 'utf8'));

  // Build: original filename -> destination path. Single source of truth is the
  // migrated content, so filenames and content references cannot drift apart.
  const plan = new Map();

  // Timeline media, renamed to the event slug.
  for (const [i, ev] of timeline.events.entries()) {
    const oldEv = old.timeline[i];
    const original = oldEv.video ?? oldEv.image;
    const ext = path.extname(original).toLowerCase();
    plan.set(path.join('timeline', original), path.join(DEST, 'timeline', `${ev.id}${ext}`));
  }

  // Gallery photos, keeping their (stable, unique) ids.
  for (const g of gallery) {
    const ext = path.extname(g._sourceFile).toLowerCase();
    const id = path.basename(g.src);
    plan.set(path.join('photos', g._sourceFile), path.join(DEST, 'photos', `${id}${ext}`));
  }

  // The 2025 hero video. NOT referenced by the new design — DESIGN.md 2.1 is
  // blunt that a 600px video with a purple play button was the loudest thing on
  // the page ("The most prominent element on load is a play button"), and 3.1
  // makes the hero a title page. Preserved as a master pending a decision.
  if (typeof old.video === 'string' && old.video) {
    plan.set(path.join('videos', old.video), path.join(DEST, '_unreferenced', `hero-video${path.extname(old.video).toLowerCase()}`));
  }

  // Everything else on disk -> _unused/. Covers the AUDIT H2 orphan
  // (1757719764479-16522970.jpg, 3.2 MB, referenced by nothing, no opt- twin),
  // the byte-identical duplicate, and all 14 bad opt- derivatives (800x600
  // cover-crops of portrait sources — discarded, never converted).
  const found = [];
  for (const sub of await readdir(UPLOADS)) {
    const subdir = path.join(UPLOADS, sub);
    if (!(await stat(subdir)).isDirectory()) continue;
    for (const f of await readdir(subdir)) found.push(path.join(sub, f));
  }

  let movedBytes = 0;
  let unusedBytes = 0;
  const moved = [];
  const unused = [];

  for (const rel of found) {
    const from = path.join(UPLOADS, rel);
    if (plan.has(rel)) {
      const to = plan.get(rel);
      const size = await move(from, to);
      movedBytes += size;
      moved.push([rel, path.relative(ROOT, to), size]);
    } else {
      const to = path.join(DEST, '_unused', path.basename(rel));
      const size = await move(from, to);
      unusedBytes += size;
      unused.push([rel, size]);
    }
  }

  console.log('\nRelocated masters -> media/masters/2025/  (gitignored)\n');
  console.log(`  referenced   ${String(moved.length).padStart(3)} files  ${MiB(movedBytes).padStart(8)} MiB`);
  console.log(`  _unused      ${String(unused.length).padStart(3)} files  ${MiB(unusedBytes).padStart(8)} MiB`);
  console.log(`  TOTAL        ${String(found.length).padStart(3)} files  ${MiB(movedBytes + unusedBytes).padStart(8)} MiB\n`);

  console.log('  Moved to _unused/ (nothing deleted):');
  for (const [rel, size] of unused.sort((a, b) => b[1] - a[1])) {
    console.log(`    ${MiB(size).padStart(8)} MiB  ${rel}`);
  }
  console.log('\n  public/uploads/ is now empty and can be removed.\n');
}

main().catch((err) => {
  console.error(`\nRelocate failed: ${err.message}\n`);
  process.exit(1);
});
