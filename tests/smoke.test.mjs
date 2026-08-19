/**
 * Smoke tests — the safety net for the yearly update.
 *
 * These run without a build and without a browser, so they are the fast check
 * you run after editing content. `npm run build` is the slow, complete one.
 *
 * Run:  npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'src', 'content');

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

const yearFiles = async () =>
  (await readdir(path.join(CONTENT, 'years'))).filter((f) => f.endsWith('.json'));
const timelineFiles = async () =>
  (await readdir(path.join(CONTENT, 'timeline'))).filter((f) => f.endsWith('.json'));

/* ------------------------------------------------------------- structure */

test('every per-year file has the required shape', async () => {
  for (const file of await yearFiles()) {
    const data = await readJson(path.join(CONTENT, 'years', file));
    assert.ok(data.names?.primary, `${file}: names.primary missing`);
    assert.ok(Array.isArray(data.message?.paragraphs), `${file}: paragraphs must be an array`);
    assert.ok(Array.isArray(data.message?.closing), `${file}: closing must be an array`);
    assert.ok(Array.isArray(data.items?.entries), `${file}: items.entries must be an array`);
    assert.ok(Array.isArray(data.gallery), `${file}: gallery must be an array`);
  }
});

test('the things-list count is derived, never hardcoded', async () => {
  // The 2025 site titled itself "23" over non-matching content. The template
  // must interpolate the real array length.
  for (const file of await yearFiles()) {
    const data = await readJson(path.join(CONTENT, 'years', file));
    const { titleTemplate, titleName, entries } = data.items;
    assert.ok(titleTemplate.includes('{count}'), `${file}: titleTemplate must contain {count}`);
    assert.ok(titleTemplate.includes('{name}'), `${file}: titleTemplate must contain {name}`);

    const rendered = titleTemplate
      .replace('{count}', String(entries.length))
      .replace('{name}', titleName);
    assert.ok(
      rendered.startsWith(String(entries.length)),
      `${file}: rendered heading "${rendered}" does not lead with the real count`
    );
  }
});

test('2026 renders the locked heading string exactly', async () => {
  const data = await readJson(path.join(CONTENT, 'years', '2026.json'));
  const rendered = data.items.titleTemplate
    .replace('{count}', String(data.items.entries.length))
    .replace('{name}', data.items.titleName);
  assert.equal(rendered, '24 Things I love about Bruce');
});

/* -------------------------------------------------------------- timeline */

test('timeline event ids are unique and url-safe', async () => {
  for (const file of await timelineFiles()) {
    const data = await readJson(path.join(CONTENT, 'timeline', file));
    const seen = new Set();
    for (const ev of data.events) {
      assert.match(ev.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${file}: bad id "${ev.id}"`);
      assert.ok(!seen.has(ev.id), `${file}: duplicate id "${ev.id}"`);
      seen.add(ev.id);
    }
  }
});

test('every video entry has a poster — AUDIT H4 made structural', async () => {
  for (const file of await timelineFiles()) {
    const data = await readJson(path.join(CONTENT, 'timeline', file));
    for (const ev of data.events) {
      if (ev.media.kind !== 'video') continue;
      assert.ok(ev.media.poster, `${file}: "${ev.id}" is a video with no poster`);
    }
  }
});

test('every media reference resolves to a real file', async () => {
  const missing = [];

  for (const file of await timelineFiles()) {
    const data = await readJson(path.join(CONTENT, 'timeline', file));
    for (const ev of data.events) {
      if (ev.media.kind === 'none') continue;
      if (ev.media.kind === 'image') {
        const p = path.join(ROOT, 'src', 'assets', `${ev.media.src}.jpg`);
        if (!existsSync(p)) missing.push(`image ${ev.media.src}`);
      }
      if (ev.media.kind === 'video') {
        const p = path.join(ROOT, 'src', 'assets', `${ev.media.poster}.jpg`);
        if (!existsSync(p)) missing.push(`poster ${ev.media.poster}`);
      }
    }
  }

  for (const file of await yearFiles()) {
    const data = await readJson(path.join(CONTENT, 'years', file));
    for (const g of data.gallery) {
      const p = path.join(ROOT, 'src', 'assets', `${g.src}.jpg`);
      if (!existsSync(p)) missing.push(`gallery ${g.src}`);
    }
  }

  assert.deepEqual(missing, [], `unresolved media references:\n  ${missing.join('\n  ')}`);
});

test('aspect ratios are present and well-formed', async () => {
  for (const file of await timelineFiles()) {
    const data = await readJson(path.join(CONTENT, 'timeline', file));
    for (const ev of data.events) {
      if (ev.media.kind === 'none') continue;
      assert.match(ev.media.aspect, /^\d+:\d+$/, `${file}: "${ev.id}" bad aspect`);
    }
  }
});

/* --------------------------------------------------------------- privacy */

test('no 2025 copy appears in any per-year content file', async () => {
  // The brief calls a stale 2025 line in a 2026 gift the worst possible bug.
  const archivePath = path.join(CONTENT, 'archive', '2025.json');
  if (!existsSync(archivePath)) return;
  const archive = await readJson(archivePath);
  const oldLines = [...(archive.paragraphs ?? []), ...(archive.closing ?? [])];

  for (const file of await yearFiles()) {
    const text = await readFile(path.join(CONTENT, 'years', file), 'utf8');
    for (const line of oldLines) {
      const probe = line.slice(0, 40).trim();
      if (probe.length < 20) continue;
      assert.ok(!text.includes(probe), `${file} contains 2025 copy: "${probe}..."`);
    }
  }
});

test('the 2025 archive is not in a routed collection', async () => {
  // It is imported explicitly by src/pages/2025.astro instead, so the 2026 page
  // cannot reach last year's letter by querying a collection.
  const config = await readFile(path.join(ROOT, 'src', 'content.config.ts'), 'utf8');
  const collections = config.match(/export const collections = \{([^}]*)\}/)?.[1] ?? '';
  assert.ok(!collections.includes('archive'), 'archive must not be a queryable collection');
});

/* ------------------------------------------------------- the 2025 edition */

test('the 2025 archive carries everything /2025/ needs', async () => {
  const a = await readJson(path.join(CONTENT, 'archive', '2025.json'));
  assert.equal(a.year, 2025);
  assert.ok(a.name, 'display name missing');
  assert.ok(a.hero?.greeting && a.hero?.subtitle, 'hero copy missing');
  assert.ok(a.messageTitle, 'message title missing');
  assert.ok(a.sections?.gallery?.title && a.sections?.timeline?.title, 'section titles missing');
  assert.ok(a.paragraphs.length > 0, 'the 2025 letter is empty');
  assert.ok(a.closing.length > 0, 'the 2025 closing lines are empty');
});

test('the 2025 letter survived migration intact', async () => {
  // It was trapped in hardcoded HTML and is the actual deliverable of that
  // year. Four paragraphs and two closing lines, with curly apostrophes.
  const a = await readJson(path.join(CONTENT, 'archive', '2025.json'));
  assert.equal(a.paragraphs.length, 4);
  assert.equal(a.closing.length, 2);
  assert.ok(
    a.paragraphs[0].includes('’'),
    'expected U+2019 apostrophes — a straight quote means the text was re-typed, not migrated'
  );
  // The four commented-out generic template lines in the old index.html must
  // NOT have been picked up alongside the real message.
  const joined = a.paragraphs.join(' ');
  assert.ok(
    !joined.includes('You light up every room'),
    'generic template filler leaked into the archived letter'
  );
});

/* -------------------------------------------------------------- contrast */

test('every token pair passes WCAG AA', async () => {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = (hex) => {
    const [r, g, b] = hex.replace('#', '').match(/.{2}/g).map((h) => lin(parseInt(h, 16)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  const paper = '#F6F2EC';
  const sunk = '#EDE7DE';
  for (const [fg, bg] of [
    ['#2A2724', paper],
    ['#2A2724', sunk],
    ['#6B645C', paper],
    ['#6B645C', sunk],
    ['#6E1A2B', paper],
    ['#6E1A2B', sunk],
    ['#4A0F1D', paper],
  ]) {
    const r = ratio(fg, bg);
    assert.ok(r >= 4.5, `${fg} on ${bg} is ${r.toFixed(2)}:1, needs 4.5:1`);
  }

  // --brass must NOT pass, which is exactly why it is ornament-only. If this
  // ever starts passing, someone changed the value and the ornament/text rule
  // needs revisiting.
  assert.ok(ratio('#A8894F', paper) < 4.5, '--brass unexpectedly passes AA; revisit the ornament rule');
});

/* ----------------------------------------------------------- media manifest */

test('media manifest agrees with the timeline', async () => {
  const manifestPath = path.join(ROOT, 'media', 'manifest.json');
  if (!existsSync(manifestPath)) return; // media not built yet — build gate covers it
  const manifest = await readJson(manifestPath);

  for (const file of await timelineFiles()) {
    const data = await readJson(path.join(CONTENT, 'timeline', file));
    for (const ev of data.events) {
      if (ev.media.kind !== 'video') continue;
      const key = `videos/${data.year}/${path.basename(ev.media.src)}`;
      assert.ok(manifest[key], `no manifest entry for ${key}`);
      assert.ok(manifest[key].mp4, `${key}: H.264 is the guaranteed floor and must exist`);
    }
  }
});
