/**
 * Intake tests — the classification logic, not the file moving.
 *
 * Everything here is a pure function fed synthetic bytes, so the suite needs no
 * fixtures, no network and no client delivery folder. The parts that touch the
 * disk (scan, apply) are deliberately not covered: they are I/O plumbing around
 * these functions, and the decisions worth protecting all live here.
 *
 * Run:  npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  sniffFormat,
  parseExif,
  screenshotVerdict,
  isCameraRollName,
  slugify,
  aspectRatio,
  proposeEntry,
  targetExtension,
  markDuplicates,
  hintHeroCandidate,
  validatePlan,
  DESTS,
  TODO_SLUG,
} from '../scripts/intake.mjs';

/* ----------------------------------------------------------------- builders */

/** An ISO-BMFF header with a chosen major brand and compatible-brands list. */
const bmff = (major, compatible = []) => {
  const brands = [major, ...compatible];
  const size = 16 + compatible.length * 4;
  const buf = Buffer.alloc(Math.max(size, 16));
  buf.writeUInt32BE(size, 0);
  buf.write('ftyp', 4, 'latin1');
  buf.write(brands[0].padEnd(4, ' ').slice(0, 4), 8, 'latin1');
  buf.writeUInt32BE(0, 12); // minor version
  compatible.forEach((b, i) => buf.write(b.padEnd(4, ' ').slice(0, 4), 16 + i * 4, 'latin1'));
  return buf;
};

/**
 * A little-endian TIFF/EXIF blob carrying the given IFD0 tags, plus an optional
 * ExifIFD holding DateTimeOriginal. Mirrors how a real camera writes it: the
 * capture date is NOT in IFD0, it sits behind the 0x8769 pointer.
 */
const exif = ({ make, model, orientation, dateTimeOriginal, prefix = false } = {}) => {
  const ifd0 = [];
  if (make) ifd0.push({ tag: 0x010f, type: 2, value: make + '\0' });
  if (model) ifd0.push({ tag: 0x0110, type: 2, value: model + '\0' });
  if (orientation) ifd0.push({ tag: 0x0112, type: 3, value: orientation });
  const sub = dateTimeOriginal ? [{ tag: 0x9003, type: 2, value: dateTimeOriginal + '\0' }] : [];
  if (sub.length) ifd0.push({ tag: 0x8769, type: 4, value: 'SUBIFD_PTR' });

  // Layout: header(8) | IFD0 | IFD0 heap | SubIFD | SubIFD heap
  const ifd0At = 8;
  const ifd0Size = 2 + ifd0.length * 12 + 4;
  const heapAt = ifd0At + ifd0Size;

  const heap = [];
  let heapLen = 0;
  const inlineOrOffset = (e) => {
    if (e.type === 3) return { inline: true };
    if (e.type === 4 && e.value === 'SUBIFD_PTR') return { inline: true };
    const bytes = Buffer.from(e.value, 'latin1');
    if (bytes.length <= 4) return { inline: true, bytes };
    const at = heapAt + heapLen;
    heap.push(bytes);
    heapLen += bytes.length;
    return { inline: false, at, bytes };
  };
  const placed = ifd0.map((e) => ({ e, ...inlineOrOffset(e) }));

  const subAt = heapAt + heapLen;
  const subSize = sub.length ? 2 + sub.length * 12 + 4 : 0;
  const subHeapAt = subAt + subSize;
  const subHeap = [];
  let subHeapLen = 0;
  const subPlaced = sub.map((e) => {
    const bytes = Buffer.from(e.value, 'latin1');
    if (bytes.length <= 4) return { e, inline: true, bytes };
    const at = subHeapAt + subHeapLen;
    subHeap.push(bytes);
    subHeapLen += bytes.length;
    return { e, inline: false, at, bytes };
  });

  const total = subHeapAt + subHeapLen;
  const buf = Buffer.alloc(total);
  buf.write('II', 0, 'latin1');
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(ifd0At, 4);

  const writeIfd = (at, entries, resolvePtr) => {
    buf.writeUInt16LE(entries.length, at);
    entries.forEach((p, i) => {
      const off = at + 2 + i * 12;
      buf.writeUInt16LE(p.e.tag, off);
      buf.writeUInt16LE(p.e.type, off + 2);
      if (p.e.type === 3) {
        buf.writeUInt32LE(1, off + 4);
        buf.writeUInt16LE(p.e.value, off + 8);
      } else if (p.e.value === 'SUBIFD_PTR') {
        buf.writeUInt32LE(1, off + 4);
        buf.writeUInt32LE(resolvePtr, off + 8);
      } else {
        buf.writeUInt32LE(p.bytes.length, off + 4);
        if (p.inline) p.bytes.copy(buf, off + 8);
        else buf.writeUInt32LE(p.at, off + 8);
      }
    });
    buf.writeUInt32LE(0, at + 2 + entries.length * 12);
  };

  writeIfd(ifd0At, placed, subAt);
  let cursor = heapAt;
  for (const b of heap) {
    b.copy(buf, cursor);
    cursor += b.length;
  }
  if (sub.length) {
    writeIfd(subAt, subPlaced, 0);
    let c = subHeapAt;
    for (const b of subHeap) {
      b.copy(buf, c);
      c += b.length;
    }
  }

  return prefix ? Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), buf]) : buf;
};

const detected = (over = {}) => ({
  format: 'jpeg',
  kind: 'image',
  width: 3024,
  height: 4032,
  aspect: '3:4',
  orientation: 'portrait',
  exifOrientation: 1,
  duration: null,
  captured: null,
  camera: 'Apple iPhone 15',
  bytes: 2_200_000,
  sha256: 'abc123',
  ...over,
});

// `detected` is destructured out so a partial override merges into the defaults
// instead of replacing the whole object via the spread below.
const entry = ({ detected: over, ...rest } = {}) => ({
  file: 'IMG_0001.JPG',
  action: 'copy',
  dest: 'photos',
  slug: 'img-0001',
  hints: [],
  reason: null,
  ...rest,
  detected: detected(over),
});

/* ------------------------------------------------------------ format sniffing */

test('sniffFormat identifies stills from magic bytes', () => {
  assert.equal(sniffFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0])).format, 'jpeg');
  assert.equal(
    sniffFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).format,
    'png',
  );
  assert.equal(sniffFormat(Buffer.from('GIF89a....', 'latin1')).format, 'gif');
  assert.equal(sniffFormat(Buffer.from('RIFF____WEBPVP8 ', 'latin1')).format, 'webp');
  assert.equal(sniffFormat(Buffer.from([0x49, 0x49, 0x2a, 0x00])).format, 'tiff');
});

test('sniffFormat separates HEIC, AVIF, MOV and MP4 inside ISO-BMFF', () => {
  // All four share the same ftyp container; only the brand distinguishes them,
  // which is why the extension is not consulted. Brands here are the ones real
  // encoders write: an iPhone clip is `qt  `, an MP4 is `isom`/`mp42` — never
  // the string "mp4".
  assert.deepEqual(
    ['heic', 'avif', 'qt  ', 'isom', 'mp42'].map((b) => sniffFormat(bmff(b)).format),
    ['heic', 'avif', 'mov', 'mp4', 'mp4'],
  );
  assert.equal(sniffFormat(bmff('heic')).kind, 'image');
  assert.equal(sniffFormat(bmff('qt  ')).kind, 'video');
});

test('sniffFormat reads the compatible-brands list, not just the major brand', () => {
  // Some encoders write mp42 as major while listing heic as compatible.
  assert.equal(sniffFormat(bmff('mp42', ['heic', 'mif1'])).format, 'heic');
});

test('sniffFormat falls back to video for an unknown ISO-BMFF brand', () => {
  const r = sniffFormat(bmff('zzzz'));
  assert.equal(r.format, 'iso-bmff');
  assert.equal(r.kind, 'video');
});

test('sniffFormat reports unknown rather than guessing', () => {
  assert.equal(sniffFormat(Buffer.from('not a media file at all', 'latin1')).kind, 'unknown');
  assert.equal(sniffFormat(Buffer.alloc(0)).format, 'unknown');
});

test('sniffFormat is what catches the 2025 extension lie (AUDIT H3.3)', () => {
  // JPEG bytes were shipped inside .PNG filenames. The bytes win.
  assert.equal(sniffFormat(Buffer.from([0xff, 0xd8, 0xff, 0xdb])).format, 'jpeg');
});

/* --------------------------------------------------------------------- EXIF */

test('parseExif reads Make, Model and Orientation from IFD0', () => {
  const r = parseExif(exif({ make: 'Apple', model: 'iPhone 15 Pro', orientation: 6 }));
  assert.equal(r.make, 'Apple');
  assert.equal(r.model, 'iPhone 15 Pro');
  assert.equal(r.orientation, 6);
});

test('parseExif follows the ExifIFD pointer for DateTimeOriginal', () => {
  const r = parseExif(exif({ make: 'Apple', dateTimeOriginal: '2026:08:15 14:32:10' }));
  // Normalised to ISO so it sorts chronologically as a string.
  assert.equal(r.captured, '2026-08-15T14:32:10');
});

test('parseExif accepts the APP1 "Exif\\0\\0" prefix or its absence', () => {
  const args = { make: 'Canon', dateTimeOriginal: '2026:01:02 03:04:05' };
  assert.deepEqual(parseExif(exif(args)), parseExif(exif({ ...args, prefix: true })));
});

test('parseExif returns empty on junk instead of throwing', () => {
  for (const bad of [null, undefined, Buffer.alloc(0), Buffer.from('nonsense'), Buffer.alloc(64)]) {
    const r = parseExif(bad);
    assert.equal(r.make, null);
    assert.equal(r.captured, null);
  }
});

test('parseExif survives a corrupt entry count without reading out of bounds', () => {
  const buf = exif({ make: 'Apple' });
  buf.writeUInt16LE(60000, 8); // IFD0 claims 60k entries
  assert.doesNotThrow(() => parseExif(buf));
  assert.equal(parseExif(buf).make, null);
});

/* -------------------------------------------------------------- screenshots */

test('camera EXIF is decisive proof of a photo', () => {
  const r = screenshotVerdict({
    format: 'png',
    width: 1179,
    height: 2556,
    make: 'Apple',
  });
  // Even at an exact screen resolution: a screenshot has no camera Make.
  assert.equal(r.verdict, 'photo');
});

test('a device screen resolution with no camera EXIF is a screenshot', () => {
  const r = screenshotVerdict({
    format: 'png',
    width: 1179,
    height: 2556,
    make: null,
  });
  assert.equal(r.verdict, 'screenshot');
  assert.match(r.why, /known device screen/);
});

test('screenshot detection is orientation-agnostic', () => {
  assert.equal(
    screenshotVerdict({ format: 'png', width: 2556, height: 1179, make: null }).verdict,
    'screenshot',
  );
});

test('a PNG with no camera EXIF at an unknown size is only LIKELY a screenshot', () => {
  const r = screenshotVerdict({
    format: 'png',
    width: 900,
    height: 1200,
    make: null,
  });
  assert.equal(r.verdict, 'likely-screenshot');
});

test('a cropped screenshot is caught by its retained screen width', () => {
  // The 2026 delivery's eight IMG_732x files: JPEG (iOS re-saves edited
  // screenshots), 1179 wide like the screen, shorter than it, no camera EXIF.
  const r = screenshotVerdict({ format: 'jpeg', width: 1179, height: 1563, make: null });
  assert.equal(r.verdict, 'likely-screenshot');
  assert.match(r.why, /cropped screenshot/);
});

test('a real photo at an arbitrary size is still not called a screenshot', () => {
  const r = screenshotVerdict({ format: 'jpeg', width: 1875, height: 2500, make: 'Canon' });
  assert.equal(r.verdict, 'photo');
});

test('an unmeasurable file gets no verdict rather than a guess', () => {
  assert.equal(
    screenshotVerdict({ format: 'png', width: null, height: null, make: null }).verdict,
    'unknown',
  );
});

/* ------------------------------------------------------------------- naming */

test('camera-roll names are recognised across vendors and download dupes', () => {
  for (const n of [
    'IMG_7353',
    'IMG_3035',
    'DSC01234',
    'PXL_20260815',
    'VID_0001',
    'IMG_7353 (1)',
    'Screenshot',
    'untitled',
    '20260815_143210',
    '1757719432848-554445544',
  ]) {
    assert.equal(isCameraRollName(n), true, `${n} should read as camera-roll`);
  }
});

test('real moment names are not mistaken for camera-roll', () => {
  for (const n of ['first-flight', 'he-cooks-again', 'THEGRADBROS-28', 'shopping-spree']) {
    assert.equal(isCameraRollName(n), false, `${n} should read as meaningful`);
  }
});

test('slugify produces URL-safe output and is idempotent', () => {
  assert.equal(slugify('THEGRADBROS-28.jpeg'.replace(/\.jpeg$/, '')), 'thegradbros-28');
  assert.equal(slugify('First Flight! (2026)'), 'first-flight-2026');
  assert.equal(slugify('Café Déjà Vu'), 'cafe-deja-vu');
  const once = slugify('Saying bye — hate this part');
  assert.equal(slugify(once), once, 'slugify must be stable when reapplied');
});

test('slugify never returns an empty string', () => {
  assert.equal(slugify('!!!'), 'untitled');
  assert.equal(slugify(''), 'untitled');
});

test('aspectRatio reduces to the form the gallery JSON uses', () => {
  assert.equal(aspectRatio(3024, 4032), '3:4');
  assert.equal(aspectRatio(1080, 1920), '9:16');
  assert.equal(aspectRatio(1170, 2532), '195:422'); // the shape already in 2026.json
  assert.equal(aspectRatio(0, 100), null);
});

/* ---------------------------------------------------------------- proposals */

test('a video proposal defaults to timeline and refuses to invent a slug', () => {
  const e = proposeEntry({
    file: 'IMG_7353.MOV',
    ext: '.mov',
    format: 'mov',
    kind: 'video',
    width: 1920,
    height: 1080,
    duration: 344,
    hasAudio: true,
    bytes: 335_200_000,
    sha256: 'a'.repeat(64),
  });
  assert.equal(e.dest, 'timeline');
  assert.equal(e.slug, TODO_SLUG, 'a camera-roll clip name must not become a URL');
});

test('a photo proposal gets a real slug immediately', () => {
  // Gallery ids are never user-visible; 2025's are raw upload timestamps.
  const e = proposeEntry({
    file: 'IMG_3035.PNG',
    ext: '.png',
    format: 'png',
    kind: 'image',
    width: 1179,
    height: 2556,
    bytes: 2_200_000,
    sha256: 'b'.repeat(64),
  });
  assert.equal(e.dest, 'photos');
  assert.equal(e.slug, 'img-3035');
});

test('a meaningfully named clip keeps its name', () => {
  const e = proposeEntry({
    file: 'first-flight.mov',
    ext: '.mov',
    format: 'mov',
    kind: 'video',
    width: 1080,
    height: 1920,
    duration: 12,
    hasAudio: true,
    bytes: 1000,
    sha256: 'c'.repeat(64),
  });
  assert.equal(e.slug, 'first-flight');
});

test('HEIC is flagged for PNG conversion', () => {
  /* Not because sharp lacks a codec — libheif is compiled in — but because
     pixel decode fails on the real files past EOF. See the module header. */
  const e = proposeEntry({
    file: 'IMG_5082.HEIC',
    ext: '.heic',
    format: 'heic',
    kind: 'image',
    width: 3024,
    height: 4032,
    bytes: 3_200_000,
    sha256: 'd'.repeat(64),
  });
  assert.equal(e.dest, 'photos');
  assert.equal(e.convert, 'png');
  assert.equal(targetExtension(e), '.png');
  assert.ok(e.hints.some((h) => /converted to PNG/.test(h)));
});

test('an extension that disagrees with the bytes is surfaced as a hint', () => {
  const e = proposeEntry({
    file: 'photo.PNG',
    ext: '.png',
    format: 'jpeg',
    kind: 'image',
    formatMismatch: true,
    width: 100,
    height: 100,
    bytes: 10,
    sha256: 'e'.repeat(64),
  });
  assert.ok(e.hints.some((h) => /extension says \.png but bytes say jpeg/.test(h)));
});

test('an unmeasurable file is called out, a readable HEIC is not', () => {
  const broken = proposeEntry({
    file: 'x.heic',
    ext: '.heic',
    format: 'heic',
    kind: 'image',
    readError: 'unsupported image format',
    bytes: 10,
    sha256: 'f'.repeat(64),
  });
  assert.ok(broken.hints.some((h) => /NOT MEASURABLE/.test(h)));

  const fine = proposeEntry({
    file: 'y.heic',
    ext: '.heic',
    format: 'heic',
    kind: 'image',
    readError: 'unsupported image format',
    width: 3024,
    height: 4032,
    bytes: 10,
    sha256: 'g'.repeat(64),
  });
  assert.equal(
    fine.hints.some((h) => /NOT MEASURABLE/.test(h)),
    false,
  );
});

test('the placed extension follows the bytes, not the delivered name', () => {
  // The whole point of H3.3: JPEG bytes arriving as .PNG must not stay .PNG.
  assert.equal(
    targetExtension(entry({ file: 'IMG_3035.PNG', detected: { format: 'jpeg' } })),
    '.jpg',
  );
  assert.equal(targetExtension(entry({ file: 'a.jpeg', detected: { format: 'jpeg' } })), '.jpg');
  assert.equal(targetExtension(entry({ file: 'b.MOV', detected: { format: 'mov' } })), '.mov');
  assert.equal(
    targetExtension(entry({ file: 'c.mkv', detected: { format: 'matroska' } })),
    '.webm',
  );
});

test('a HEIC entry is placed as the PNG it becomes', () => {
  assert.equal(
    targetExtension(entry({ file: 'IMG_5082.HEIC', convert: 'png', detected: { format: 'heic' } })),
    '.png',
  );
  // A non-converted still keeps its own canonical extension.
  assert.equal(targetExtension(entry({ file: 'x.HEIC', detected: { format: 'heic' } })), '.heic');
});

test('an unrecognised container keeps its delivered extension', () => {
  assert.equal(
    targetExtension(entry({ file: 'x.m2ts', detected: { format: 'iso-bmff' } })),
    '.m2ts',
  );
});

test('duplicates are detected by content, not by name', () => {
  // The 2026 delivery has IMG_7353.MOV twice under two Drive ids.
  const out = markDuplicates([
    entry({ file: 'IMG_7353.MOV', detected: { sha256: 'same' } }),
    entry({ file: 'IMG_7353 (1).MOV', detected: { sha256: 'same' } }),
    entry({ file: 'other.MOV', detected: { sha256: 'different' } }),
  ]);
  assert.equal(out[0].action, 'copy');
  assert.equal(out[1].action, 'skip');
  assert.match(out[1].reason, /identical content to IMG_7353\.MOV/);
  assert.equal(out[2].action, 'copy');
});

test('the canonical name survives a duplicate, whatever the list order', () => {
  /* " (1)" sorts BEFORE "." in ASCII, so first-wins keeps the browser's copy and
     discards the real one. The kept file must be the clean name either way. */
  for (const order of [
    ['IMG_7353 (1).MOV', 'IMG_7353.MOV'],
    ['IMG_7353.MOV', 'IMG_7353 (1).MOV'],
  ]) {
    const out = markDuplicates(order.map((file) => entry({ file, detected: { sha256: 'same' } })));
    const kept = out.filter((e) => e.action !== 'skip');
    assert.equal(kept.length, 1);
    assert.equal(kept[0].file, 'IMG_7353.MOV', `wrong copy kept for order ${order.join(', ')}`);
  }
});

test('a file no pipeline can read defaults to skip, not to a plausible target', () => {
  const e = proposeEntry({
    file: 'notes.txt',
    ext: '.txt',
    format: 'unknown',
    kind: 'unknown',
    bytes: 9,
    sha256: 'h'.repeat(64),
  });
  assert.equal(e.action, 'skip');
  assert.match(e.reason, /unrecognised format/);
});

test('the longest clip is hinted as hero, not assigned as hero', () => {
  const out = hintHeroCandidate([
    entry({ file: 'a.mov', detected: { kind: 'video', duration: 12 } }),
    entry({ file: 'b.mov', detected: { kind: 'video', duration: 344 } }),
  ]);
  assert.ok(out[1].hints.some((h) => /hero candidate/.test(h)));
  assert.equal(out[1].dest, 'photos', 'dest stays as proposed — the human decides hero');
});

test('a skipped duplicate cannot win the hero hint', () => {
  const out = hintHeroCandidate([
    entry({ file: 'a.mov', detected: { kind: 'video', duration: 12 } }),
    entry({
      file: 'dupe.mov',
      action: 'skip',
      detected: { kind: 'video', duration: 999 },
    }),
    entry({ file: 'c.mov', detected: { kind: 'video', duration: 30 } }),
  ]);
  assert.ok(out[2].hints.some((h) => /hero candidate/.test(h)));
  assert.equal(out[1].hints.length, 0);
});

/* --------------------------------------------------------------- validation */

const plan = (entries) => ({ source: '/tmp/delivery', year: '2026', entries });

test('a well-formed plan validates clean', () => {
  const errors = validatePlan(
    plan([
      entry({ file: 'a.jpg', dest: 'photos', slug: 'img-0001' }),
      entry({
        file: 'b.mov',
        dest: 'timeline',
        slug: 'first-flight',
        detected: { kind: 'video' },
      }),
      entry({
        file: 'c.mov',
        dest: 'hero',
        slug: 'hero-video',
        detected: { kind: 'video' },
      }),
    ]),
    () => true,
  );
  assert.deepEqual(errors, []);
});

test('an unreplaced TODO-SLUG blocks apply', () => {
  const errors = validatePlan(
    plan([entry({ dest: 'timeline', slug: TODO_SLUG, detected: { kind: 'video' } })]),
    () => true,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /still TODO-SLUG/);
});

test('a camera-roll slug on a timeline entry blocks apply', () => {
  // Passes slugify but is still meaningless, and it would become the URL.
  const errors = validatePlan(
    plan([
      entry({
        dest: 'timeline',
        slug: 'img-7353',
        detected: { kind: 'video' },
      }),
    ]),
    () => true,
  );
  assert.match(errors[0], /still a camera-roll name/);
});

test('a camera-roll slug on a PHOTO entry is allowed', () => {
  const errors = validatePlan(plan([entry({ dest: 'photos', slug: 'img-3035' })]), () => true);
  assert.deepEqual(errors, []);
});

test('a non-URL-safe slug blocks apply and suggests the fix', () => {
  const errors = validatePlan(
    plan([
      entry({
        dest: 'timeline',
        slug: 'First Flight!',
        detected: { kind: 'video' },
      }),
    ]),
    () => true,
  );
  assert.match(errors[0], /not URL-safe \(try "first-flight"\)/);
});

test('two entries claiming one target blocks apply', () => {
  const errors = validatePlan(
    plan([
      entry({
        file: 'a.mov',
        dest: 'timeline',
        slug: 'first-flight',
        detected: { kind: 'video' },
      }),
      entry({
        file: 'b.mov',
        dest: 'timeline',
        slug: 'first-flight',
        detected: { kind: 'video' },
      }),
    ]),
    () => true,
  );
  assert.match(errors[0], /claimed by both a\.mov and b\.mov/);
});

test('media in a directory its pipeline never reads blocks apply', () => {
  const video = validatePlan(
    plan([entry({ dest: 'photos', slug: 'clip', detected: { kind: 'video' } })]),
    () => true,
  );
  assert.match(video[0], /skipped by images\.mjs/);

  const still = validatePlan(
    plan([entry({ dest: 'hero', slug: 'pic', detected: { kind: 'image' } })]),
    () => true,
  );
  assert.match(still[0], /read by video\.mjs only/);
});

test('an unknown dest blocks apply', () => {
  const errors = validatePlan(plan([entry({ dest: 'gallery', slug: 'x' })]), () => true);
  assert.match(errors[0], new RegExp(DESTS.join(', ')));
});

test('an unrecognised format must be skipped explicitly, not placed', () => {
  const errors = validatePlan(
    plan([entry({ slug: 'x', detected: { kind: 'unknown' } })]),
    () => true,
  );
  assert.match(errors[0], /unrecognised format/);
});

test('a file that vanished from the delivery folder blocks apply', () => {
  const errors = validatePlan(plan([entry({ file: 'gone.jpg', slug: 'gone' })]), () => false);
  assert.match(errors[0], /no longer in \/tmp\/delivery/);
});

test('skipped entries are exempt from every rule', () => {
  const errors = validatePlan(
    plan([
      entry({
        action: 'skip',
        dest: 'nonsense',
        slug: TODO_SLUG,
        detected: { kind: 'unknown' },
      }),
    ]),
    () => false,
  );
  assert.deepEqual(errors, []);
});
