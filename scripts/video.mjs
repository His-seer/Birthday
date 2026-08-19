/**
 * VIDEO PIPELINE.
 *
 *   media/masters/<year>/timeline/<slug>.mp4
 *     -> media/derived/videos/<year>/<slug>.<hash>.mp4    H.264, the compatibility floor
 *     -> media/derived/videos/<year>/<slug>.<hash>.webm   VP9, the efficiency alternate
 *     -> src/assets/timeline/<year>/<slug>-poster.jpg     the poster frame
 *
 * Fixes AUDIT H4: 10 of 14 timeline entries were bare `<video controls>` with
 * no poster and no preload, so the browser range-requested all 11 clips on load
 * (2,395 KB transferred before any interaction, loadEventEnd 5,418 ms on
 * localhost with zero network latency). The section rendered as a column of
 * black rectangles wearing browser chrome.
 *
 * ---------------------------------------------------------------------------
 * TWO DEVIATIONS FROM PLAN.md, both deliberate:
 *
 * 1. VP9/WebM replaces AV1 as the alternate.
 *    The pinned ffmpeg build has no libsvtav1, and libaom-av1 is far too slow
 *    to sit in a script someone runs once a year. VP9 is also the better call
 *    on the merits: verified 2026-08-10, WebM/VP9 sits at 95.30% support
 *    versus AV1's 79.26% — and Safari only decodes AV1 on hardware
 *    (iPhone 15 Pro, M3+ Macs), never in software.
 *
 * 2. Encoding is SIZE-AWARE, not fixed-CRF.
 *    PLAN.md predicted the 43.6 MiB clip would land at 6-12 MiB. That estimate
 *    assumed over-bitrated phone footage. Probing showed otherwise: it is
 *    344 seconds of 1280x720 at 1063 kbps — already efficiently encoded, with
 *    little headroom. A plain CRF pass could leave it near or above the
 *    Cloudflare Pages 25 MiB per-file cap, which is hard and unraisable.
 *    So: encode at CRF, measure, and if the result exceeds MAX_BYTES, re-encode
 *    two-pass at a computed bitrate. The cap becomes impossible to breach
 *    rather than merely checked afterwards.
 * ---------------------------------------------------------------------------
 *
 * Run:  npm run media:video
 *       node scripts/video.mjs --only=posters
 *       node scripts/video.mjs --skip-vp9
 */

import { readdir, mkdir, stat, readFile, writeFile, rm, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const run = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MASTERS = path.join(ROOT, 'media', 'masters');
const DERIVED = path.join(ROOT, 'media', 'derived', 'videos');
const ASSETS = path.join(ROOT, 'src', 'assets');
const CACHE = path.join(ROOT, 'media', '.video-cache.json');

const FFMPEG = ffmpegPath;
const FFPROBE = ffprobeStatic.path;

/** Cloudflare Pages hard cap is 25 MiB per file and cannot be raised.
 *  20 MiB leaves headroom for container overhead and future re-encodes. */
const MAX_BYTES = 20 * 1024 * 1024;

const H264_CRF = 23; // libx264 documented default (ffmpeg-codecs.html)
const VP9_CRF = 33;
const AUDIO_KBPS = 128;

const VIDEO_RE = /\.(mp4|mov|m4v|webm|avi)$/i;
const MiB = (n) => (n / 1048576).toFixed(2);

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) ?? '').split('=')[1] || null;
const skipVp9 = args.includes('--skip-vp9') || (only && only !== 'vp9');
const skipH264 = only && only !== 'h264';
const skipPosters = only && only !== 'posters';

/**
 * Rotation in degrees, from either place ffprobe reports it.
 *
 * Modern files carry a display matrix in `side_data_list`; older ones use a
 * `rotate` tag. Returns a value in [0, 360).
 */
function rotationOf(stream) {
  const side = (stream.side_data_list ?? []).find((d) => d.rotation !== undefined);
  const deg = side ? Number(side.rotation) : Number(stream.tags?.rotate ?? 0);
  return Number.isFinite(deg) ? ((deg % 360) + 360) % 360 : 0;
}

/**
 * Probe DISPLAY dimensions, not stored ones.
 *
 * An iPhone records portrait video as a 1920x1080 landscape stream plus a 90
 * degree display matrix. ffmpeg auto-rotates on decode — an implicit transpose
 * runs BEFORE any -vf filter — so the frames reaching our scale filter are
 * already 1080x1920. Passing the stored 1920x1080 into capDimensions therefore
 * asked for `scale=1920:1080` on already-portrait frames and squashed every
 * clip into landscape, and wrote a 16:9 aspect into the timeline JSON for a
 * 9:16 video.
 *
 * This never fired for 2025 because those masters were already-transcoded web
 * files with no rotation metadata. Every 2026 master is a camera original.
 */
async function ffprobe(file) {
  const { stdout } = await run(
    FFPROBE,
    ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', file],
    { maxBuffer: 1 << 26 }
  );
  const j = JSON.parse(stdout);
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  if (!v) throw new Error(`No video stream in ${file}`);
  const rotation = rotationOf(v);
  const swapped = rotation === 90 || rotation === 270;
  return {
    width: swapped ? v.height : v.width,
    height: swapped ? v.width : v.height,
    rotation,
    duration: parseFloat(j.format.duration),
    hasAudio: Boolean(a),
  };
}

/**
 * Cap the long edge at 1920 and the short edge at 1080, preserving aspect and
 * forcing even dimensions (yuv420p requires them).
 *
 * Computed here rather than with an ffmpeg scale expression because a naive
 * `min(1920,iw)` is a NO-OP on a 1080x1920 portrait clip, and a naive
 * 1920x1080 box would wrongly squash portrait to 607x1080. Orientation-aware
 * arithmetic in JS is clearer and testable.
 */
/**
 * Step the resolution down until the size cap can buy acceptable quality.
 *
 * capDimensions bounds the FRAME; this bounds the BITRATE-PER-PIXEL, which is
 * what actually decides whether a clip looks watchable. The cap is a fixed
 * number of bytes, so the longer the clip the fewer bits each pixel gets:
 *
 *   hero, 3m23s at 1080x1920   ->  0.34 bits/px/s
 *   the 24-things film, 7m51s  ->  0.11 bits/px/s at the same frame size
 *
 * The floor is empirical, not invented: 2025 shipped 23-reasons-why at 286 kbps
 * and 1280x720, which is 0.31 bits/px/s, and that was accepted. So anything at
 * or above 0.31 is known-good, and a clip below it is downscaled a step at a
 * time until it clears — trading resolution for bits, which is the right way
 * round when the alternative is eight minutes of blocking on a face.
 *
 * The hero clears the floor at full size and is untouched.
 */
const QUALITY_FLOOR = 0.31; // bits per pixel per second, from 2025's shipped clip
const LADDER = [1080, 720, 540, 480]; // short edge, in descending order

function fitToQualityFloor(w, h, duration) {
  if (!duration || duration <= 0) return [w, h];
  const budgetBits = MAX_BYTES * 8 - AUDIO_KBPS * 1000 * duration;
  if (budgetBits <= 0) return [w, h];
  const bitsPerSecond = budgetBits / duration;

  const short = Math.min(w, h);
  for (const target of LADDER) {
    if (target > short) continue; // never upscale
    const scale = target / short;
    const nw = Math.max(2, Math.round(w * scale) - (Math.round(w * scale) % 2));
    const nh = Math.max(2, Math.round(h * scale) - (Math.round(h * scale) % 2));
    if (bitsPerSecond / (nw * nh) >= QUALITY_FLOOR) return [nw, nh];
  }
  // Nothing on the ladder clears it; use the smallest rather than give up.
  const target = LADDER[LADDER.length - 1];
  const scale = Math.min(1, target / short);
  const nw = Math.max(2, Math.round(w * scale) - (Math.round(w * scale) % 2));
  const nh = Math.max(2, Math.round(h * scale) - (Math.round(h * scale) % 2));
  return [nw, nh];
}

function capDimensions(w, h) {
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  const scale = Math.min(1, 1920 / long, 1080 / short);
  let nw = Math.round(w * scale);
  let nh = Math.round(h * scale);
  nw -= nw % 2;
  nh -= nh % 2;
  return [Math.max(2, nw), Math.max(2, nh)];
}

function audioArgs(hasAudio) {
  return hasAudio ? ['-c:a', 'aac', '-b:a', `${AUDIO_KBPS}k`, '-ac', '2'] : ['-an'];
}

async function encodeH264(input, output, info, [w, h]) {
  const base = [
    '-y', '-i', input,
    '-vf', `scale=${w}:${h}`,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-profile:v', 'high',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    ...audioArgs(info.hasAudio),
  ];

  await run(FFMPEG, [...base, '-crf', String(H264_CRF), output], { maxBuffer: 1 << 26 });
  let size = (await stat(output)).size;
  if (size <= MAX_BYTES) return { size, mode: `crf${H264_CRF}` };

  // Too big. Two-pass at a bitrate that lands ~85% of the cap, leaving room
  // for the audio track and container overhead.
  const audioBits = info.hasAudio ? AUDIO_KBPS * 1000 : 0;
  const targetBits = Math.floor((MAX_BYTES * 0.85 * 8) / info.duration) - audioBits;
  const kbps = Math.max(200, Math.floor(targetBits / 1000));

  const logDir = await mkdtempSafe();
  const passlog = path.join(logDir, 'pass');
  const twoPass = [
    '-y', '-i', input,
    '-vf', `scale=${w}:${h}`,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-profile:v', 'high',
    '-pix_fmt', 'yuv420p',
    '-b:v', `${kbps}k`,
    '-maxrate', `${Math.floor(kbps * 1.5)}k`,
    '-bufsize', `${kbps * 2}k`,
    '-passlogfile', passlog,
  ];
  await run(FFMPEG, [...twoPass, '-pass', '1', '-an', '-f', 'mp4', os.devNull], { maxBuffer: 1 << 26 });
  await run(FFMPEG, [...twoPass, '-pass', '2', '-movflags', '+faststart', ...audioArgs(info.hasAudio), output], { maxBuffer: 1 << 26 });
  await rm(logDir, { recursive: true, force: true });

  size = (await stat(output)).size;
  return { size, mode: `2-pass ${kbps}k` };
}

async function mkdtempSafe() {
  const dir = path.join(os.tmpdir(), `bday-ff-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function encodeVp9(input, output, info, [w, h]) {
  await run(
    FFMPEG,
    [
      '-y', '-i', input,
      '-vf', `scale=${w}:${h}`,
      '-c:v', 'libvpx-vp9',
      '-crf', String(VP9_CRF),
      // -b:v 0 is what selects true constant-quality mode. Without it libvpx
      // runs constrained-quality and silently ignores much of the CRF.
      '-b:v', '0',
      '-deadline', 'good',
      '-cpu-used', '4',
      '-row-mt', '1',
      '-pix_fmt', 'yuv420p',
      ...(info.hasAudio ? ['-c:a', 'libopus', '-b:a', `${AUDIO_KBPS}k`] : ['-an']),
      output,
    ],
    { maxBuffer: 1 << 26 }
  );
  return (await stat(output)).size;
}

async function extractPoster(input, output, info, [w, h]) {
  // 10% in, or 1s, whichever is later — the first frame of a phone clip is
  // very often black or a blurred autofocus frame, and the poster IS the
  // visual for the entry.
  const ts = Math.max(1, Math.min(info.duration * 0.1, info.duration - 0.1));
  const tmp = path.join(os.tmpdir(), `poster-${Math.random().toString(36).slice(2)}.png`);
  await run(
    FFMPEG,
    ['-y', '-ss', ts.toFixed(2), '-i', input, '-frames:v', '1', '-vf', `scale=${w}:${h}`, tmp],
    { maxBuffer: 1 << 26 }
  );
  await mkdir(path.dirname(output), { recursive: true });
  await sharp(tmp)
    .resize(1800, 1800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(output);
  await unlink(tmp).catch(() => {});
  return (await stat(output)).size;
}

async function main() {
  if (!existsSync(MASTERS)) {
    console.error('\nNo masters at media/masters/. See README "Yearly update".\n');
    process.exit(1);
  }

  const cache = existsSync(CACHE) ? JSON.parse(await readFile(CACHE, 'utf8')) : {};
  const manifest = {};
  const rows = [];

  for (const year of (await readdir(MASTERS, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)) {
    // `hero/` carries the 2025 edition's hero clip. It is not a timeline event,
    // but it needs the same transcode + poster treatment to appear on /2025/.
    // `clips` is gallery video — same transcode and poster treatment, but it
    // never becomes a timeline event. Posters still land under
    // assets/timeline/<year>/ so a single glob finds every poster on the site.
    for (const kind of ['timeline', 'hero', 'clips']) {
    const dir = path.join(MASTERS, year, kind);
    if (!existsSync(dir)) continue;

    for (const file of (await readdir(dir)).sort()) {
      if (!VIDEO_RE.test(file)) continue;

      const input = path.join(dir, file);
      const slug = path.parse(file).name;
      const key = `videos/${year}/${slug}`;

      const srcBuf = await readFile(input);
      const srcHash = createHash('sha256').update(srcBuf).digest('hex');
      const short = srcHash.slice(0, 8);
      const srcSize = srcBuf.length;

      const info = await ffprobe(input);
      const capped = capDimensions(info.width, info.height);
      // Then trade resolution for bitrate if the cap cannot fund this length.
      const dims = fitToQualityFloor(capped[0], capped[1], info.duration);
      const downscaled = dims[0] !== capped[0] || dims[1] !== capped[1];

      const outDir = path.join(DERIVED, year);
      await mkdir(outDir, { recursive: true });
      const mp4 = path.join(outDir, `${slug}.${short}.mp4`);
      const webm = path.join(outDir, `${slug}.${short}.webm`);
      // Posters always live under assets/timeline/<year>/ so one glob finds them.
      const poster = path.join(ASSETS, 'timeline', year, `${slug}-poster.jpg`);

      const cached = cache[key];
      const fresh = cached?.hash === srcHash;

      /* A previously-DROPPED alternate must not be re-encoded on every run.
         The pruning step below deletes a webm that loses to its own H.264, so
         the file is deliberately absent — and an existsSync check alone reads
         that as "not built yet" and re-encodes it, only to discard it again.
         On the 344s clip that is ~30 minutes of wasted CPU every single run.
         So the decision is remembered, not just the artefact. */
      const previouslyDropped = fresh ? (cached?.vp9Dropped ?? null) : null;

      let mp4Size = fresh && existsSync(mp4) ? (await stat(mp4)).size : 0;
      let webmSize = fresh && existsSync(webm) ? (await stat(webm)).size : 0;
      let mode = cached?.mode ?? '';

      if (!skipH264 && !(fresh && mp4Size)) {
        process.stdout.write(`  encoding h264  ${slug} ... `);
        const r = await encodeH264(input, mp4, info, dims);
        mp4Size = r.size;
        mode = r.mode;
        process.stdout.write(`${MiB(mp4Size)} MiB (${mode})\n`);
      }
      if (!skipVp9 && !previouslyDropped && !(fresh && webmSize)) {
        process.stdout.write(`  encoding vp9   ${slug} ... `);
        webmSize = await encodeVp9(input, webm, info, dims);
        process.stdout.write(`${MiB(webmSize)} MiB\n`);
      }
      if (!skipPosters && !(fresh && existsSync(poster))) {
        await extractPoster(input, poster, info, dims);
      }

      // An "alternate" that is bigger than the primary is worse than useless:
      // it costs deploy size and can be picked by the browser over the smaller
      // file. Drop it when it does not earn its place.
      //
      // This is not hypothetical. On the 344s 720p clip, H.264 was constrained
      // to 286 kbps by the two-pass fallback to fit the cap, while VP9 at
      // CRF 33 ran free and produced 36.60 MiB — larger than the H.264 by 2x
      // AND over Cloudflare's 25 MiB hard cap, which would have failed the
      // deploy outright.
      let dropped = previouslyDropped;
      if (!dropped && webmSize && mp4Size) {
        if (webmSize > MAX_BYTES) {
          dropped = `over ${MiB(MAX_BYTES)} MiB cap`;
        } else if (webmSize >= mp4Size * 0.95) {
          dropped = 'no smaller than h264';
        }
      }
      if (dropped && webmSize) {
        await rm(webm, { force: true });
        webmSize = 0;
      }

      manifest[key] = {
        mp4: mp4Size ? path.posix.join('videos', year, `${slug}.${short}.mp4`) : null,
        webm: webmSize ? path.posix.join('videos', year, `${slug}.${short}.webm`) : null,
        poster: `timeline/${year}/${slug}-poster`,
        width: dims[0],
        height: dims[1],
        duration: Number(info.duration.toFixed(2)),
        hasAudio: info.hasAudio,
        bytes: { mp4: mp4Size, webm: webmSize },
      };
      cache[key] = { hash: srcHash, mode, vp9Dropped: dropped };

      // The cap check MUST cover every emitted file, not just the mp4.
      rows.push({
        slug,
        srcSize,
        mp4Size,
        webmSize,
        dims,
        over: mp4Size > MAX_BYTES || webmSize > MAX_BYTES,
        dropped,
        mode,
      });
    }
    }
  }

  await writeFile(CACHE, JSON.stringify(cache, null, 2) + '\n');
  await mkdir(path.join(ROOT, 'media'), { recursive: true });
  await writeFile(
    path.join(ROOT, 'media', 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );

  // Write real dimensions back into the timeline content, replacing the
  // provisional "9:16" the migration guessed.
  await syncAspects(manifest);

  const tot = rows.reduce(
    (a, r) => ({
      src: a.src + r.srcSize,
      mp4: a.mp4 + r.mp4Size,
      webm: a.webm + r.webmSize,
    }),
    { src: 0, mp4: 0, webm: 0 }
  );

  console.log('\n  ' + 'clip'.padEnd(46) + 'source'.padStart(9) + 'h264'.padStart(9) + 'vp9'.padStart(9) + '   mode');
  for (const r of rows) {
    console.log(
      '  ' + r.slug.slice(0, 45).padEnd(46) +
        (MiB(r.srcSize) + 'M').padStart(9) +
        (MiB(r.mp4Size) + 'M').padStart(9) +
        (r.webmSize ? MiB(r.webmSize) + 'M' : '-').padStart(9) +
        '   ' + r.mode +
        (r.dropped ? `   [vp9 dropped: ${r.dropped}]` : '') +
        (r.over ? '   *** OVER CAP ***' : '')
    );
  }
  console.log(
    `\n  TOTAL${' '.repeat(41)}${(MiB(tot.src) + 'M').padStart(9)}${(MiB(tot.mp4) + 'M').padStart(9)}${(tot.webm ? MiB(tot.webm) + 'M' : '-').padStart(9)}`
  );
  console.log(`\n  deployed video: ${MiB(tot.mp4 + tot.webm)} MiB  (from ${MiB(tot.src)} MiB of masters)`);
  const over = rows.filter((r) => r.over);
  console.log(
    over.length
      ? `\n  ${over.length} file(s) EXCEED the ${MiB(MAX_BYTES)} MiB budget — deploy would fail.\n`
      : `\n  All files under the ${MiB(MAX_BYTES)} MiB budget (Cloudflare Pages hard cap: 25 MiB).\n`
  );
}

/** Replace provisional aspect ratios in timeline content with measured ones. */
async function syncAspects(manifest) {
  const dir = path.join(ROOT, 'src', 'content', 'timeline');
  if (!existsSync(dir)) return;
  let changed = 0;

  for (const file of await readdir(dir)) {
    if (!file.endsWith('.json')) continue;
    const p = path.join(dir, file);
    const data = JSON.parse(await readFile(p, 'utf8'));
    for (const ev of data.events) {
      if (ev.media.kind !== 'video') continue;
      const m = manifest[`videos/${data.year}/${path.basename(ev.media.src)}`];
      if (!m) continue;
      const g = (a, b) => (b ? g(b, a % b) : a);
      const d = g(m.width, m.height) || 1;
      const aspect = `${m.width / d}:${m.height / d}`;
      if (ev.media.aspect !== aspect) {
        ev.media.aspect = aspect;
        changed++;
      }
    }
    await writeFile(p, JSON.stringify(data, null, 2) + '\n');
  }
  if (changed) console.log(`\n  synced ${changed} measured aspect ratio(s) into timeline content`);
}

main().catch((err) => {
  console.error(`\nVideo pipeline failed: ${err.message}\n${err.stderr ?? ''}\n`);
  process.exit(1);
});
