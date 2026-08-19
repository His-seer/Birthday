/**
 * INTAKE — triage a client delivery folder into media/masters/<year>/.
 *
 * The client delivers a FLAT folder of camera-roll files. The pipelines need
 * them sorted into photos/ timeline/ hero/ with meaningful timeline slugs,
 * because every output path and content id is derived structurally from the
 * master path (see relocate-masters.mjs for how that layout was chosen).
 *
 *   <download-dir>/*  ->  media/masters/<year>/{photos,timeline,hero}/
 *
 * TWO STEPS, because only one of them can be automated:
 *
 *   node scripts/intake.mjs <download-dir>      SCAN  — inspect, write a plan
 *   <edit media/intake.plan.json>               HUMAN — set dest and slugs
 *   node scripts/intake.mjs --apply             APPLY — validate, then place
 *
 * What the scan determines from CONTENT, not filenames:
 *
 *   - true format from magic bytes, so a JPEG named .PNG cannot slip through
 *     (that exact mismatch is AUDIT H3.3, and it shipped in 2025)
 *   - dimensions, orientation and the aspect string the gallery JSON wants
 *   - duration, codec and audio presence for video
 *   - EXIF DateTimeOriginal and camera Make/Model — read HERE because the
 *     image pipeline deliberately strips EXIF downstream, so this is the last
 *     point at which real capture order is knowable
 *   - sha256 content hash, so a file delivered twice under two names is caught
 *     before it becomes two timeline events
 *   - screenshot vs camera photo: iOS names screenshots IMG_####.PNG, exactly
 *     like photos, so the name cannot distinguish them. Absence of camera EXIF
 *     plus a known device screen resolution can.
 *
 * What it CANNOT determine, and therefore proposes as TODO-SLUG rather than
 * guessing: which moment a clip depicts. A timeline filename becomes the URL
 * and the content id, so `first-flight.mp4` is a human decision. Photos are
 * exempt — 2025's gallery ids are raw upload timestamps and that is harmless.
 *
 * HEIC is converted to PNG, and the reason is worth recording because two
 * plausible explanations were both wrong before the real one:
 *
 *   1. "prebuilt sharp has no HEVC decoder." False — libheif is compiled in.
 *   2. "it is libheif's iref security limit." Also false. `{ unlimited: true }`
 *      lifts that and metadata() then succeeds, which looks like a fix.
 *   3. Actually: metadata() only parses headers. PIXEL decode still fails on
 *      every file in the 2026 delivery with "bad seek to <filesize + 32>", and
 *      the downloads are byte-exact against Drive's Content-Length — so the
 *      files are intact and this libheif build is simply wrong about them.
 *
 * So the decode is delegated: sharp first (portable, and correct if a future
 * libheif fixes this), then Windows Imaging Component via heic-to-png.ps1. WIC
 * also applies HEIF's `irot` transform property, which libheif's metadata does
 * NOT report — sharp calls one of these photos 4032x3024 where WIC calls it
 * 3024x4032, and WIC is right. PNG because it is lossless, keeping the single
 * lossy step in images.mjs. The untouched original goes to _originals/, which no
 * pipeline reads.
 *
 * This is why conversion lives in intake and not in images.mjs: intake is the
 * layer that normalises a messy delivery, so the pipeline stays portable.
 *
 * Nothing is deleted, and nothing is overwritten. Default is COPY, so the
 * client's download folder survives and a bad plan costs nothing but disk.
 *
 * Run:  node scripts/intake.mjs ~/Downloads/2026
 *       node scripts/intake.mjs --apply
 *       node scripts/intake.mjs --apply --move
 *       node scripts/intake.mjs <dir> --year=2027
 */

import {
  readdir,
  mkdir,
  stat,
  readFile,
  writeFile,
  copyFile,
  rename,
  open,
} from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const run = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const MASTERS = path.join(ROOT, 'media', 'masters');
const PLAN = path.join(ROOT, 'media', 'intake.plan.json');

const FFMPEG = ffmpegPath;
const FFPROBE = ffprobeStatic.path;

/** Destinations the pipelines actually read.
 *
 *  `clips` is gallery video: shown as a uniform contact sheet, so like `photos`
 *  its filename is never user-visible and a machine name is perfectly fine.
 *  Only `timeline` and `hero` turn a slug into a URL and a content id, which is
 *  why those are the ones that demand a real name. */
export const DESTS = ['photos', 'timeline', 'hero', 'clips'];

/** Destinations whose slug is never surfaced, so camera-roll names are allowed. */
const MACHINE_NAMED = new Set(['photos', 'clips']);

/** Slug placeholder. Apply refuses to run while any timeline or hero entry
 *  still carries it — the whole point of the human step. */
export const TODO_SLUG = 'TODO-SLUG';

const MiB = (n) => (n / 1048576).toFixed(2);
const KiB = (n) => (n / 1024).toFixed(0);

/* ------------------------------------------------------------------ sniffing */

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MATROSKA_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

/** ISO base media file format brands, mapped to what the file really is.
 *  An iPhone .MOV is major brand `qt  `; an iPhone photo is `heic`. */
const BMFF_BRANDS = {
  heic: ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1'],
  avif: ['avif', 'avis'],
  mov: ['qt  '],
  mp4: ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'mmp4', 'M4V ', 'dash'],
};

const IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp', 'tiff', 'gif', 'heic', 'avif']);

/**
 * The extension a format SHOULD carry.
 *
 * Used so the placed master's extension follows its bytes. Detecting that
 * IMG_3035.PNG holds JPEG and then copying the lie forward would leave AUDIT
 * H3.3 alive in masters — sharp sniffs content and would still read it, so the
 * mismatch survives silently until someone trusts the name.
 */
const CANONICAL_EXT = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
  tiff: '.tif',
  gif: '.gif',
  heic: '.heic',
  avif: '.avif',
  mov: '.mov',
  mp4: '.mp4',
  matroska: '.webm',
};

/** Where a planned entry will land, extension included. */
export function targetExtension(e) {
  if (e.convert === 'png') return '.png';
  // iso-bmff is a recognised container with an unrecognised brand; its own
  // extension is the best available guess.
  return CANONICAL_EXT[e.detected.format] ?? path.parse(e.file).ext.toLowerCase();
}

/**
 * Identify a file from its leading bytes. Extensions lie — 2025 shipped JPEG
 * bytes inside .PNG filenames (AUDIT H3.3), and iPhone HEICs arrive as both
 * .heic and .HEIC in the same delivery.
 */
export function sniffFormat(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { format: 'jpeg', kind: 'image' };
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC)) {
    return { format: 'png', kind: 'image' };
  }
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString('latin1'))) {
    return { format: 'gif', kind: 'image' };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return { format: 'webp', kind: 'image' };
  }
  if (
    buf.length >= 4 &&
    ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
      (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a))
  ) {
    return { format: 'tiff', kind: 'image' };
  }
  if (buf.length >= 4 && buf.subarray(0, 4).equals(MATROSKA_MAGIC)) {
    // WebM is a Matroska profile; the DocType lives further in. Either way the
    // video pipeline reads it, so the distinction does not change any decision.
    return { format: 'matroska', kind: 'video' };
  }

  if (buf.length >= 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    // Check the major brand, then the compatible-brands list. A file can claim
    // `mp42` as major while listing `heic` as compatible.
    const boxSize = buf.readUInt32BE(0);
    const end = Math.min(buf.length, boxSize > 16 ? boxSize : 16);
    const brands = [buf.subarray(8, 12).toString('latin1')];
    for (let i = 16; i + 4 <= end; i += 4) brands.push(buf.subarray(i, i + 4).toString('latin1'));

    for (const [format, known] of Object.entries(BMFF_BRANDS)) {
      if (brands.some((b) => known.includes(b))) {
        return {
          format,
          kind: IMAGE_FORMATS.has(format) ? 'image' : 'video',
          brands: brands.filter(Boolean),
        };
      }
    }
    // Unrecognised brand, but ISO-BMFF with an ftyp box is overwhelmingly video.
    return {
      format: 'iso-bmff',
      kind: 'video',
      brands: brands.filter(Boolean),
    };
  }

  return { format: 'unknown', kind: 'unknown' };
}

/* ---------------------------------------------------------------------- EXIF */

/** TIFF field byte widths, indexed by EXIF type id. */
const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_ORIENTATION = 0x0112;
const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME_ORIGINAL = 0x9003;

/**
 * Minimal EXIF reader — Make, Model, Orientation, DateTimeOriginal.
 *
 * sharp hands back the raw APP1 payload and offers no parser, and pulling a
 * full EXIF library in for four tags is not worth the dependency. Only the
 * tags that change an intake decision are read; everything else is ignored.
 */
export function parseExif(buf) {
  const empty = { make: null, model: null, orientation: null, captured: null };
  if (!buf || buf.length < 8) return empty;

  // sharp sometimes includes the "Exif\0\0" APP1 prefix, sometimes not.
  let base = 0;
  if (buf.subarray(0, 4).toString('latin1') === 'Exif') base = 6;
  if (buf.length < base + 8) return empty;

  const order = buf.subarray(base, base + 2).toString('latin1');
  if (order !== 'II' && order !== 'MM') return empty;
  const LE = order === 'II';

  const u16 = (o) => (LE ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (LE ? buf.readUInt32LE(o) : buf.readUInt32BE(o));

  if (u16(base + 2) !== 42) return empty;

  const out = { ...empty };

  const readEntryValue = (entry, type, count) => {
    const size = (TYPE_SIZE[type] ?? 0) * count;
    if (!size) return null;
    // Values of 4 bytes or fewer sit inline in the entry; longer ones are at an
    // offset measured from the TIFF header, not from the entry.
    const at = size <= 4 ? entry + 8 : base + u32(entry + 8);
    if (at < 0 || at + size > buf.length) return null;
    if (type === 2)
      return buf
        .subarray(at, at + size)
        .toString('latin1')
        .replace(/\0.*$/, '')
        .trim();
    if (type === 3) return u16(at);
    if (type === 4) return u32(at);
    return null;
  };

  const walk = (ifdOffset, depth = 0) => {
    if (depth > 2 || ifdOffset <= 0 || ifdOffset + 2 > buf.length) return;
    const count = u16(ifdOffset);
    // A corrupt offset can claim thousands of entries; bound by the buffer.
    if (count > 4096 || ifdOffset + 2 + count * 12 > buf.length) return;

    for (let i = 0; i < count; i++) {
      const entry = ifdOffset + 2 + i * 12;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const n = u32(entry + 4);

      if (tag === TAG_MAKE) out.make ??= readEntryValue(entry, type, n) || null;
      else if (tag === TAG_MODEL) out.model ??= readEntryValue(entry, type, n) || null;
      else if (tag === TAG_ORIENTATION) out.orientation ??= readEntryValue(entry, type, n) ?? null;
      else if (tag === TAG_DATETIME_ORIGINAL || tag === TAG_DATETIME) {
        const v = readEntryValue(entry, type, n);
        // DateTimeOriginal (capture) beats DateTime (last modified).
        if (v && (tag === TAG_DATETIME_ORIGINAL || !out.captured)) out.captured = v;
      } else if (tag === TAG_EXIF_IFD) {
        const sub = readEntryValue(entry, type, n);
        if (typeof sub === 'number') walk(base + sub, depth + 1);
      }
    }
  };

  walk(base + u32(base + 4));

  // "YYYY:MM:DD HH:MM:SS" is EXIF's format and sorts wrong as a string.
  if (out.captured) {
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(out.captured);
    out.captured = m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}` : null;
  }

  return out;
}

/* -------------------------------------------------------------- screenshots */

/**
 * Portrait pixel resolutions of shipped phone and tablet screens. Landscape is
 * handled by comparing the sorted pair, so each entry covers both.
 */
const SCREEN_SIZES = [
  // iPhone
  [640, 1136],
  [750, 1334],
  [828, 1792],
  [1080, 1920],
  [1125, 2436],
  [1170, 2532],
  [1179, 2556],
  [1206, 2622],
  [1242, 2208],
  [1242, 2688],
  [1284, 2778],
  [1290, 2796],
  [1320, 2868],
  // iPad
  [1488, 2266],
  [1536, 2048],
  [1620, 2160],
  [1640, 2360],
  [1668, 2224],
  [1668, 2388],
  [2048, 2732],
  // common Android
  [1080, 2280],
  [1080, 2340],
  [1080, 2400],
  [1440, 2560],
  [1440, 2960],
  [1440, 3120],
];

/** Short edges of every screen above — a crop keeps the width, loses the height. */
const SCREEN_SHORT_EDGES = new Set(SCREEN_SIZES.map(([w]) => w));

const isKnownScreen = (w, h) => {
  const [a, b] = [Math.min(w, h), Math.max(w, h)];
  return SCREEN_SIZES.some(([sw, sh]) => sw === a && sh === b);
};

/**
 * Screenshot or camera photo? iOS gives both the same IMG_####.ext naming, so
 * this has to come from content. A camera Make in EXIF is decisive proof of a
 * photo; its absence plus a device-screen resolution is strong evidence of a
 * screenshot. Anything less confident says so rather than picking.
 */
export function screenshotVerdict({ format, width, height, make }) {
  if (make) return { verdict: 'photo', why: `camera EXIF (${make})` };
  if (!width || !height) return { verdict: 'unknown', why: 'no dimensions' };
  if (isKnownScreen(width, height)) {
    return {
      verdict: 'screenshot',
      why: `${width}x${height} is a known device screen, no camera EXIF`,
    };
  }
  /* A CROPPED screenshot keeps the screen's width and loses its height, so the
     exact-resolution test above misses it — and iOS re-saves an edited
     screenshot as JPEG, so the PNG test below misses it too. The 2026 delivery
     has eight of these: 1179px wide (an iPhone 15/16 screen), heights from 861
     to 1563, no camera EXIF, all captured inside 21 minutes. */
  if (SCREEN_SHORT_EDGES.has(width) || SCREEN_SHORT_EDGES.has(height)) {
    return {
      verdict: 'likely-screenshot',
      why: `${width}x${height}: one edge is a device screen width, no camera EXIF — cropped screenshot?`,
    };
  }
  if (format === 'png') return { verdict: 'likely-screenshot', why: 'PNG with no camera EXIF' };
  return {
    verdict: 'unknown',
    why: 'no camera EXIF, dimensions match no known screen',
  };
}

/* -------------------------------------------------------------------- naming */

/** Camera-roll and screen-capture filename shapes, which carry no meaning. */
const CAMERA_ROLL_RE =
  /^(img|dsc|dscn|dscf|mvi|vid|pxl|dji|gopr|gp|photo|video|screenshot|screen[ _-]?shot|capture|untitled)[-_ ]?\d*$/i;

/** Bare timestamps and upload ids: 20260815_143210, 1757719432848-554445544. */
const TIMESTAMP_RE = /^\d{6,}([-_]\d+)*$/;

/**
 * Browsers add " (1)" when a name is downloaded twice — a duplicate tell.
 *
 * Bounded to two digits on purpose. `\d+` also swallows " (2026)", which is a
 * year a human deliberately put in a name, and stripping it would silently
 * turn `first-flight (2026)` into `first-flight`. A download counter never
 * reaches three digits in practice; a year always has four.
 */
const DOWNLOAD_DUPE_RE = /\s*\((\d{1,2})\)$/;

export function isCameraRollName(basename) {
  const stem = basename.replace(DOWNLOAD_DUPE_RE, '').trim();
  return CAMERA_ROLL_RE.test(stem) || TIMESTAMP_RE.test(stem);
}

/** Filesystem- and URL-safe. A timeline slug becomes a public path segment. */
export function slugify(basename) {
  return (
    basename
      .replace(DOWNLOAD_DUPE_RE, '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'untitled'
  );
}

/** The gallery JSON's `aspect` field, reduced so it reads as a ratio. */
export function aspectRatio(w, h) {
  if (!w || !h) return null;
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

/* ----------------------------------------------------------------- proposals */

/**
 * Turn one inspected file into a plan entry.
 *
 * Photos get their real slug immediately — a gallery id is never user-visible,
 * and 2025's are raw upload timestamps. Timeline and hero get TODO-SLUG when
 * the name is camera-roll, because that string becomes the URL.
 */
export function proposeEntry(f) {
  const hints = [];
  const stem = path.parse(f.file).name;

  const dest = f.kind === 'video' ? 'timeline' : 'photos';
  const cameraRoll = isCameraRollName(stem);
  const slug = MACHINE_NAMED.has(dest) || !cameraRoll ? slugify(stem) : TODO_SLUG;

  if (f.format === 'heic') hints.push('HEIC — converted to PNG on apply (sharp, else Windows WIC)');
  if (f.formatMismatch) hints.push(`extension says ${f.ext} but bytes say ${f.format}`);
  if (f.screenshot === 'screenshot' || f.screenshot === 'likely-screenshot') {
    hints.push(`${f.screenshot}: ${f.screenshotWhy}`);
  }
  if (DOWNLOAD_DUPE_RE.test(stem))
    hints.push('name ends in " (n)" — a second download of the same file?');
  if (f.kind === 'video' && !f.hasAudio) hints.push('no audio track');
  // Not hinted here — an unknown kind sets `reason` below, which already prints.
  // A HEIC that sharp refused is expected and already explained above; a file
  // neither reader could measure is a genuine problem and must be visible.
  if (f.readError && !f.width)
    hints.push(`NOT MEASURABLE — ${f.readError.split('\n')[0].slice(0, 90)}`);

  // A file no pipeline can read defaults to skip. Proposing `photos/notes` for a
  // notes.txt and relying on the human to read a hint gets it placed by anyone
  // skimming; the delivery folder always carries some stray non-media.
  const unreadable = f.kind === 'unknown';

  return {
    file: f.file,
    action: unreadable ? 'skip' : 'copy',
    dest,
    slug,
    convert: f.format === 'heic' ? 'png' : null,
    detected: {
      format: f.format,
      kind: f.kind,
      width: f.width ?? null,
      height: f.height ?? null,
      aspect: aspectRatio(f.width, f.height),
      orientation: f.width && f.height ? (f.height > f.width ? 'portrait' : 'landscape') : null,
      // The raw EXIF orientation value, kept separately from the human-readable
      // one above because apply needs it to bake rotation into a HEIC->PNG
      // conversion. Dropping it would silently ship sideways photos.
      exifOrientation: f.orientation ?? null,
      duration: f.duration ?? null,
      captured: f.captured ?? null,
      camera: f.make ? [f.make, f.model].filter(Boolean).join(' ') : null,
      bytes: f.bytes,
      sha256: f.sha256.slice(0, 16),
    },
    hints,
    reason: unreadable ? 'unrecognised format — no pipeline reads it' : null,
  };
}

/**
 * Mark repeat content. Grouping is by full sha256, so a file delivered twice
 * under two names collapses even when Drive shows two distinct ids — which is
 * exactly what the 2026 delivery does with IMG_7353.MOV.
 */
export function markDuplicates(entries) {
  const groups = new Map();
  for (const e of entries) {
    const key = e.detected.sha256;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    /* Which copy survives is NOT arbitrary. Naive first-wins keeps whichever
       sorted first, and " (1)" sorts BEFORE "." — so `IMG_7353 (1).MOV` beat
       `IMG_7353.MOV` and the canonical file was the one thrown away. Prefer the
       name without a download counter, then the shorter name. */
    const isDupeName = (e) => (DOWNLOAD_DUPE_RE.test(path.parse(e.file).name) ? 1 : 0);
    const keep = group
      .slice()
      .sort(
        (a, b) =>
          isDupeName(a) - isDupeName(b) ||
          a.file.length - b.file.length ||
          a.file.localeCompare(b.file),
      )[0];

    for (const e of group) {
      if (e === keep) continue;
      e.action = 'skip';
      e.reason = `identical content to ${keep.file}`;
    }
  }
  return entries;
}

/** Flag the longest clip as the hero candidate without deciding it. */
export function hintHeroCandidate(entries) {
  const clips = entries.filter(
    (e) => e.detected.kind === 'video' && e.action !== 'skip' && e.detected.duration,
  );
  if (clips.length < 2) return entries;
  const longest = clips.reduce((a, b) => (b.detected.duration > a.detected.duration ? b : a));
  longest.hints.push(
    `longest clip (${Math.round(longest.detected.duration)}s of ${clips.length}) — hero candidate, set dest to "hero"`,
  );
  return entries;
}

/* ------------------------------------------------------------------ scanning */

async function hashFile(p) {
  const h = createHash('sha256');
  await pipeline(createReadStream(p), h);
  return h.digest('hex');
}

async function readHead(p, n = 65536) {
  const fh = await open(p, 'r');
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

async function ffprobeFile(file) {
  const { stdout } = await run(
    FFPROBE,
    ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', file],
    { maxBuffer: 1 << 26 },
  );
  const j = JSON.parse(stdout);
  const v = j.streams?.find((s) => s.codec_type === 'video');
  const a = j.streams?.find((s) => s.codec_type === 'audio');
  const tags = { ...(j.format?.tags ?? {}), ...(v?.tags ?? {}) };
  const created =
    tags['com.apple.quicktime.creationdate'] || tags.creation_time || tags.date || null;

  /* DISPLAY dimensions, not stored ones. An iPhone stores portrait video as a
     landscape stream plus a rotation matrix; reporting 1920x1080 for a clip that
     displays 1080x1920 would put a 16:9 aspect on a 9:16 video. Every clip in
     the 2026 delivery is rotated. */
  const side = (v?.side_data_list ?? []).find((d) => d.rotation !== undefined);
  const deg = side ? Number(side.rotation) : Number(v?.tags?.rotate ?? 0);
  const rotation = Number.isFinite(deg) ? ((deg % 360) + 360) % 360 : 0;
  const swapped = rotation === 90 || rotation === 270;

  return {
    width: (swapped ? v?.height : v?.width) ?? null,
    height: (swapped ? v?.width : v?.height) ?? null,
    duration: j.format?.duration ? parseFloat(j.format.duration) : null,
    hasAudio: Boolean(a),
    codec: v?.codec_name ?? null,
    captured: created
      ? String(created)
          .replace(/\.\d+Z?$/, '')
          .replace(/Z$/, '')
      : null,
  };
}

/** Recursive, so a delivery that arrives as a nested zip still works. */
async function listFiles(dir, base = dir) {
  const out = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    if (d.name.startsWith('.')) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...(await listFiles(p, base)));
    else out.push(path.relative(base, p));
  }
  return out.sort();
}

async function inspect(dir, rel) {
  const abs = path.join(dir, rel);
  const bytes = (await stat(abs)).size;
  const head = await readHead(abs);
  const sniff = sniffFormat(head);
  const ext = path.parse(rel).ext.toLowerCase();

  const f = {
    file: rel,
    ext,
    bytes,
    sha256: await hashFile(abs),
    format: sniff.format,
    kind: sniff.kind,
    width: null,
    height: null,
    duration: null,
    hasAudio: null,
    make: null,
    model: null,
    orientation: null,
    captured: null,
    screenshot: null,
    screenshotWhy: null,
    formatMismatch: false,
    readError: null,
  };

  // Does the extension agree with the bytes? .heic/.HEIC vs heic is agreement.
  const extFormat = {
    '.jpg': 'jpeg',
    '.jpeg': 'jpeg',
    '.png': 'png',
    '.webp': 'webp',
    '.gif': 'gif',
    '.tif': 'tiff',
    '.tiff': 'tiff',
    '.heic': 'heic',
    '.heif': 'heic',
    '.avif': 'avif',
    '.mov': 'mov',
    '.mp4': 'mp4',
    '.m4v': 'mp4',
    '.webm': 'matroska',
    '.mkv': 'matroska',
  }[ext];
  if (extFormat && extFormat !== f.format && f.format !== 'iso-bmff') f.formatMismatch = true;

  if (f.kind === 'image') {
    try {
      // unlimited: lifts libheif's iref cap, which a real iPhone HEIC exceeds.
      // Same flag images.mjs uses, for the same reason.
      const meta = await sharp(abs, { unlimited: true }).metadata();
      f.width = meta.width ?? null;
      f.height = meta.height ?? null;
      Object.assign(f, parseExif(meta.exif));
      // autoOrient swaps the axes for orientation 5-8; report display dimensions.
      if (f.orientation >= 5 && f.orientation <= 8) [f.width, f.height] = [f.height, f.width];
    } catch (err) {
      f.readError = err.message;
      try {
        const probe = await ffprobeFile(abs);
        f.width = probe.width;
        f.height = probe.height;
        f.captured ??= probe.captured;
      } catch {
        /* neither reader could open it; the scan reports that below */
      }
    }
    const v = screenshotVerdict({
      format: f.format,
      width: f.width,
      height: f.height,
      make: f.make,
    });
    f.screenshot = v.verdict;
    f.screenshotWhy = v.why;
  } else if (f.kind === 'video') {
    try {
      Object.assign(f, await ffprobeFile(abs));
    } catch (err) {
      f.readError = err.message;
    }
  }

  return f;
}

async function scan(dir, year) {
  if (!existsSync(dir)) {
    console.error(`\nNo such folder: ${dir}\n`);
    process.exit(1);
  }

  const files = await listFiles(dir);
  if (!files.length) {
    console.error(`\n${dir} is empty.\n`);
    process.exit(1);
  }

  console.log(
    `\nIntake scan — ${files.length} files in ${dir}\n  target: media/masters/${year}/\n`,
  );

  const inspected = [];
  for (const rel of files) {
    inspected.push(await inspect(dir, rel));
    // Only when a human is watching: \r overwriting is meaningless in a pipe or
    // a CI log, where it just concatenates every tick onto one line.
    if (process.stdout.isTTY)
      process.stdout.write(`\r  inspected ${inspected.length}/${files.length}`);
  }
  if (process.stdout.isTTY) process.stdout.write('\r' + ' '.repeat(40) + '\r');

  const entries = hintHeroCandidate(markDuplicates(inspected.map(proposeEntry)));

  /* ---- report ---- */
  console.log(
    '  ' +
      'file'.padEnd(24) +
      'bytes'.padStart(9) +
      '  ' +
      'format'.padEnd(9) +
      'dimensions'.padEnd(12) +
      'dur'.padStart(6) +
      '  ' +
      'captured'.padEnd(21) +
      'proposed',
  );
  console.log('  ' + '-'.repeat(110));

  for (const e of entries) {
    const d = e.detected;
    const dims = d.width && d.height ? `${d.width}x${d.height}` : '-';
    const dur = d.duration ? `${Math.round(d.duration)}s` : '-';
    const target = e.action === 'skip' ? 'SKIP' : `${e.dest}/${e.slug}`;
    console.log(
      '  ' +
        e.file.slice(0, 23).padEnd(24) +
        (KiB(d.bytes) + 'K').padStart(9) +
        '  ' +
        d.format.padEnd(9) +
        dims.padEnd(12) +
        dur.padStart(6) +
        '  ' +
        // Trimmed to seconds for the table only. The plan keeps the full value,
        // timezone offset included — a MOV creation_time is 24 chars and ran into
        // the next column at padEnd(20).
        (d.captured ?? '-').slice(0, 19).padEnd(21) +
        target,
    );
    for (const h of e.hints) console.log(' '.repeat(6) + `- ${h}`);
    if (e.reason) console.log(' '.repeat(6) + `- ${e.reason}`);
  }

  /* ---- what needs a human ---- */
  const kept = entries.filter((e) => e.action !== 'skip');
  const isDupe = (e) => Boolean(e.reason?.startsWith('identical content'));
  const dupes = entries.filter(isDupe);
  const otherSkips = entries.filter((e) => e.action === 'skip' && !isDupe(e));
  const todo = kept.filter((e) => e.slug === TODO_SLUG);
  const unreadable = inspected.filter((f) => !f.width && f.kind !== 'unknown');
  const unknown = inspected.filter((f) => f.kind === 'unknown');
  const heic = kept.filter((e) => e.convert === 'png');
  const shots = kept.filter((e) => e.hints.some((h) => h.includes('screenshot')));

  await mkdir(path.dirname(PLAN), { recursive: true });
  await writeFile(
    PLAN,
    JSON.stringify(
      {
        _note:
          'EDIT THIS FILE, then run: node scripts/intake.mjs --apply. Set `dest` to photos, ' +
          'timeline or hero. Replace every TODO-SLUG on a timeline/hero entry — that string ' +
          'becomes the URL and the content id. Set `action` to "skip" to leave a file behind. ' +
          '`detected` is read-only evidence from the scan; editing it changes nothing.',
        source: dir,
        year,
        entries,
      },
      null,
      2,
    ) + '\n',
  );

  console.log(`
  ${kept.length} to place   ${MiB(kept.reduce((a, e) => a + e.detected.bytes, 0))} MiB
  ${dupes.length} duplicate${dupes.length === 1 ? '' : 's'} skipped   ${otherSkips.length} other skip${
    otherSkips.length === 1 ? '' : 's'
  }
  ${todo.length} timeline/hero slug${todo.length === 1 ? '' : 's'} need naming
  ${heic.length} HEIC -> PNG   ${shots.length} look like screenshots
  ${unreadable.length} could not be measured   ${unknown.length} unrecognised format`);

  if (todo.length) {
    console.log(`
  Next: open media/intake.plan.json and replace ${TODO_SLUG} on these ${todo.length}:`);
    for (const e of todo) console.log(`    ${e.file}`);
  }
  console.log(`\n  Then: node scripts/intake.mjs --apply\n`);
}

/* --------------------------------------------------------------------- apply */

/**
 * Validate the edited plan. Every failure is fatal and every failure names its
 * files — the repo's verify.mjs sets that precedent deliberately, because a
 * warning in a script run once a year is a warning nobody reads.
 */
export function validatePlan(plan, existsFn) {
  const errors = [];
  const active = plan.entries.filter((e) => e.action !== 'skip');

  for (const e of active) {
    if (!DESTS.includes(e.dest)) {
      errors.push(`${e.file}: dest "${e.dest}" is not one of ${DESTS.join(', ')}`);
    }
    if (!e.slug || e.slug === TODO_SLUG) {
      errors.push(`${e.file}: slug is still ${TODO_SLUG} — name the moment, it becomes the URL`);
    } else if (slugify(e.slug) !== e.slug) {
      errors.push(`${e.file}: slug "${e.slug}" is not URL-safe (try "${slugify(e.slug)}")`);
    } else if (!MACHINE_NAMED.has(e.dest) && isCameraRollName(e.slug)) {
      errors.push(`${e.file}: slug "${e.slug}" is still a camera-roll name, not a moment`);
    }
    if (!['copy', 'move'].includes(e.action)) {
      errors.push(`${e.file}: action "${e.action}" must be copy, move or skip`);
    }
    if (e.detected.kind === 'unknown') {
      errors.push(`${e.file}: unrecognised format — no pipeline reads it. Set action to "skip".`);
    }
  }

  // One slug per dest. Two files landing on timeline/first-flight would silently
  // clobber, and the second would win.
  const byTarget = new Map();
  for (const e of active) {
    const key = `${e.dest}/${e.slug}`;
    if (byTarget.has(key))
      errors.push(`${key}: claimed by both ${byTarget.get(key)} and ${e.file}`);
    else byTarget.set(key, e.file);
  }

  // Videos cannot go to photos/ and stills cannot go to hero/: the pipelines
  // read those directories with format-specific regexes and would skip silently.
  for (const e of active) {
    if (e.detected.kind === 'image' && e.dest === 'clips') {
      errors.push(`${e.file}: clips/ is read by video.mjs only — a still there is never picked up`);
    }
    if (e.detected.kind === 'video' && e.dest === 'photos') {
      errors.push(`${e.file}: a video in photos/ is skipped by images.mjs — use timeline or hero`);
    }
    if (e.detected.kind === 'image' && e.dest === 'hero') {
      errors.push(`${e.file}: hero/ is read by video.mjs only — a still there is never picked up`);
    }
  }

  for (const e of active) {
    if (existsFn && !existsFn(e.file)) errors.push(`${e.file}: no longer in ${plan.source}`);
  }

  return errors;
}

/**
 * Decode one HEIC to PNG. Returns the decoder that succeeded.
 *
 * sharp first: portable, and the right answer if a future libheif handles these
 * files. WIC second: Windows-only, but it actually works here and applies HEIF's
 * irot transform, so the PNG lands at true display orientation with no EXIF to
 * rely on. Order matters — never the other way round.
 */
async function heicToPng(from, to) {
  try {
    await sharp(from, { unlimited: true }).autoOrient().png({ compressionLevel: 6 }).toFile(to);
    return 'sharp';
  } catch {
    /* Expected for the 2026 delivery: pixel decode fails past EOF. */
  }
  if (process.platform !== 'win32') {
    throw new Error(
      `sharp cannot decode ${path.basename(from)} and the WIC fallback is Windows-only. ` +
        `Ask for a JPEG re-export.`
    );
  }
  const script = path.join(__dirname, 'heic-to-png.ps1');
  // -ExecutionPolicy Bypass is process-scoped: it does not change machine policy.
  await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-In', from, '-Out', to], { maxBuffer: 1 << 26 });
  if (!existsSync(to)) throw new Error(`WIC produced no output for ${path.basename(from)}`);
  return 'wic';
}

async function apply(useMove) {
  if (!existsSync(PLAN)) {
    console.error(
      `\nNo plan at media/intake.plan.json.\nRun the scan first: node scripts/intake.mjs <download-dir>\n`,
    );
    process.exit(1);
  }

  const plan = JSON.parse(await readFile(PLAN, 'utf8'));
  const { source, year } = plan;

  const errors = validatePlan(plan, (rel) => existsSync(path.join(source, rel)));

  const active = plan.entries.filter((e) => e.action !== 'skip');

  // Destination collisions are checked before anything moves, so a rerun after
  // a partial failure cannot half-overwrite an existing master.
  const targets = active.map((e) => ({
    e,
    to: path.join(MASTERS, year, e.dest, `${e.slug}${targetExtension(e)}`),
  }));
  for (const { e, to } of targets) {
    if (existsSync(to))
      errors.push(`${e.file}: ${path.relative(ROOT, to)} already exists — nothing is overwritten`);
  }

  if (errors.length) {
    console.error(
      `\nPlan is not ready — ${errors.length} problem${errors.length === 1 ? '' : 's'}:\n`,
    );
    for (const e of errors) console.error(`  ${e}`);
    console.error(`\nNothing was moved. Fix media/intake.plan.json and run --apply again.\n`);
    process.exit(1);
  }

  console.log(`\nIntake apply — ${targets.length} files -> media/masters/${year}/`);
  console.log(`  mode: ${useMove ? 'MOVE' : 'copy'}\n`);

  let placed = 0;
  let converted = 0;
  const decoders = new Set();

  for (const { e, to } of targets) {
    const from = path.join(source, e.file);
    await mkdir(path.dirname(to), { recursive: true });

    if (e.convert === 'png') {
      decoders.add(await heicToPng(from, to));
      // The original is the only lossless copy and no pipeline reads _originals/.
      const keep = path.join(MASTERS, year, '_originals', path.basename(e.file));
      await mkdir(path.dirname(keep), { recursive: true });
      if (!existsSync(keep)) await (useMove ? rename(from, keep) : copyFile(from, keep));
      converted++;
    } else {
      await (useMove ? rename(from, to) : copyFile(from, to));
    }
    placed++;
    const outSize = (await stat(to)).size;
    console.log(
      `  ${e.file.slice(0, 26).padEnd(27)} -> ${path.relative(MASTERS, to).replace(/\\/g, '/').padEnd(40)} ${(
        KiB(outSize) + 'K'
      ).padStart(9)}`,
    );
  }

  const skipped = plan.entries.length - targets.length;
  console.log(`
  placed ${placed}   converted ${converted}${decoders.size ? ` (${[...decoders].join(', ')})` : ''}   skipped ${skipped}

  Next: npm run media          transcode, poster frames, aspect ratios
        then add captions and copy to src/content/years/${year}.json
`);
}

/* ----------------------------------------------------------------------- cli */

async function main() {
  const args = process.argv.slice(2);
  const useMove = args.includes('--move');
  const yearArg = (args.find((a) => a.startsWith('--year=')) ?? '').split('=')[1];
  const dir = args.find((a) => !a.startsWith('--'));

  if (args.includes('--apply')) return apply(useMove);

  if (!dir) {
    console.error(`
Usage:
  node scripts/intake.mjs <download-dir> [--year=YYYY]   scan and write a plan
  node scripts/intake.mjs --apply [--move]              place the planned files
`);
    process.exit(1);
  }

  const year = yearArg ?? String(new Date().getFullYear());
  if (!/^\d{4}$/.test(year)) {
    console.error(`\n--year must be four digits, got "${year}"\n`);
    process.exit(1);
  }

  return scan(path.resolve(dir), year);
}

// Guarded so the tests can import the pure helpers above without running the CLI.
if (path.resolve(process.argv[1] ?? '') === path.resolve(__filename)) {
  main().catch((err) => {
    console.error(`\nIntake failed: ${err.message}\n`);
    process.exit(1);
  });
}
