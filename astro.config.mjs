// @ts-check
import { defineConfig } from 'astro/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/**
 * Serve derived video at /media/* during `astro dev`.
 *
 * Video lives in media/derived/ — outside src/ and outside public/, because it
 * must never be committed. In production scripts/copy-media.mjs places it in
 * dist/media/. Without this, /media/* 404s in dev and every timeline video
 * silently fails to play, which would make the local preview lie about the one
 * thing most worth checking.
 */
const serveMediaInDev = {
  name: 'serve-media-in-dev',
  hooks: {
    'astro:server:setup': ({ server }) => {
      const MIME = { '.mp4': 'video/mp4', '.webm': 'video/webm' };
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/media/')) return next();
        const rel = decodeURIComponent(req.url.split('?')[0].replace('/media/', ''));
        const file = path.join(ROOT, 'media', 'derived', rel);
        // Contain to media/derived — never serve outside it.
        if (!file.startsWith(path.join(ROOT, 'media', 'derived')) || !fs.existsSync(file)) {
          return next();
        }
        res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes');
        const { size } = fs.statSync(file);
        const range = req.headers.range;
        if (range) {
          const [s, e] = range.replace('bytes=', '').split('-');
          const start = Number(s);
          const end = e ? Number(e) : size - 1;
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
          res.setHeader('Content-Length', end - start + 1);
          return fs.createReadStream(file, { start, end }).pipe(res);
        }
        res.setHeader('Content-Length', size);
        fs.createReadStream(file).pipe(res);
      });
    },
  },
};

// The deployed origin. Used for absolute OG image URLs, which must be absolute
// or link previews render blank (AUDIT M8).
// Set from the first deploy, 2026-08-19. Cloudflare appended `-enm` because the
// bare `birthday-2026` name was already taken on another account — and that host
// is live, serving an unrelated birthday card. So a wrong value here does not
// 404, it silently points og:image and canonical at a stranger's site and link
// previews render blank (AUDIT M8). Must match the deployed project exactly.
const SITE = process.env.SITE_URL ?? 'https://birthday-2026-enm.pages.dev';

export default defineConfig({
  site: SITE,

  // `static` is the default in Astro 5+ (hybrid was merged into it). Stated
  // explicitly because this being static is the whole architecture: it is what
  // deletes AUDIT C1-C4 by removing the write layer.
  output: 'static',

  // No Cloudflare adapter. Verified 2026-08-10: @astrojs/cloudflare is for
  // on-demand rendering only. A static build deploys `dist/` as-is.
  // https://docs.astro.build/en/guides/deploy/cloudflare/

  image: {
    // AUDIT H3.1: last year's pipeline used sharp's `fit: 'cover'` and
    // force-cropped 1179x2556 portrait phone photos into 800x600 landscape,
    // discarding ~65% of frame height and cutting heads off.
    //
    // Astro's default image service ALSO crops by default (objectFit: 'cover').
    // Left alone it would silently re-create exactly that bug.
    //
    // Two guards:
    //   1. `objectFit: 'contain'` here, so no layout-driven crop.
    //   2. Components pass `widths` only and never a fixed `height`, so sharp
    //      scales proportionally instead of cropping to fit a box.
    objectFit: 'contain',
    objectPosition: 'center',

    // Opt into responsive styles so `widths`/`sizes` produce correctly-scaled
    // images rather than overflowing their container.
    responsiveStyles: true,
  },

  build: {
    // Content-hashed filenames are what make `Cache-Control: immutable` safe
    // in _headers. AUDIT H5: last year served max-age=0 on 117 MiB of
    // immutable media.
    assets: '_assets',
  },

  integrations: [serveMediaInDev],

  devToolbar: { enabled: false },
});
