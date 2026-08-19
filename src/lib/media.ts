/**
 * Video manifest access.
 *
 * The manifest is written by scripts/video.mjs and IS committed, while the
 * video bytes themselves are not (the brief: "never commit media"). That lets
 * the repo verify what should be present without carrying it.
 *
 * NOTE ON THE IMPORT — this is load-bearing.
 *
 * This module previously resolved the manifest from `import.meta.url` with
 * fs.readFileSync. That works in `astro dev`, where modules are served from
 * source, but NOT in `astro build`: Vite bundles this file, `import.meta.url`
 * stops pointing at src/lib/, the existsSync check fails, and loadManifest()
 * silently returns {}. Every video URL then renders as an empty attribute and
 * NOTHING plays on the deployed site — while dev keeps working perfectly.
 *
 * A static JSON import is resolved by Vite at build time in both modes, so the
 * two cannot drift. If the manifest is missing the build fails loudly, which is
 * the correct outcome: shipping a videoless site should not be silent.
 */
import manifest from '../../media/manifest.json';

export type VideoEntry = {
  mp4: string | null;
  webm: string | null;
  poster: string;
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
  bytes?: { mp4: number; webm: number };
};

const entries = manifest as unknown as Record<string, VideoEntry>;

export function loadManifest(): Record<string, VideoEntry> {
  return entries;
}

/** `src` is the extension-less base from content, e.g. "timeline/2025/he-cooks". */
export function getVideo(src: string): VideoEntry | null {
  return entries[src.replace(/^timeline\//, 'videos/')] ?? null;
}

/** Public URL for a derived video file, served from dist/media/. */
export function videoUrl(relative: string): string {
  return `/media/${relative.split('\\').join('/')}`;
}
