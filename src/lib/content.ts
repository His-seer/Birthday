import { getCollection, getEntry } from 'astro:content';

export const TODO = 'TODO-CONTENT';

/** True when a field is still an unfilled placeholder. */
export function isTodo(value: unknown): boolean {
  return typeof value === 'string' && value.trim().startsWith(TODO);
}

/**
 * Placeholders must not leak into user-visible metadata — a share preview
 * reading "TODO-CONTENT" is worse than no preview at all, and AUDIT M8 found
 * the preview blank already. So metadata falls back to a sensible derived
 * value while the placeholder stays outstanding in the build report.
 *
 * Body copy deliberately does NOT fall back: an unfilled paragraph should be
 * visibly unfilled, so it cannot ship by accident.
 */
export function orElse(value: string, fallback: string): string {
  return isTodo(value) || !value.trim() ? fallback : value;
}

export async function getYear(year: number) {
  const entry = await getEntry('years', String(year));
  if (!entry) throw new Error(`No content/years/${year}.json`);
  return entry.data;
}

/** Cumulative timeline, newest year first. Adding year N+1 is adding a file. */
export async function getTimeline() {
  const entries = await getCollection('timeline');
  return entries
    .map((e) => e.data)
    .sort((a, b) => b.year - a.year)
    .map((y) => ({
      ...y,
      /* ORDER IS THE FILE'S ORDER. Dates are for display only.
         
         Sorting by date assumes every moment has a trustworthy one. For 2026
         half of them do not: several stills are screenshots whose EXIF records
         when the screenshot was taken rather than when the moment happened
         (one was captured months after the event it shows), and two clips carry
         only a batch-export timestamp. Sorting on that data put the year in the
         wrong order twice.
         
         Deriving order from unreliable data is worse than authoring it. The
         timeline file is hand-maintained and append-only, so its array order is
         a deliberate editorial decision — a date that is merely unknown no
         longer drags a moment to one end of the chapter, and no invented date
         has to be rendered to the reader to fix the sequence. */
      events: [...y.events],
    }));
}

/**
 * The section heading, with the count DERIVED from the array.
 *
 * The brief locks this verbatim as "24 Things I love about Bruce" and
 * separately forbids hardcoding the count. With 24 entries this renders that
 * string character-for-character; with any other count it stays truthful
 * rather than repeating last year's "23" over non-matching content.
 */
export function itemsTitle(items: {
  titleTemplate: string;
  titleName: string;
  entries: string[];
}): string {
  return items.titleTemplate
    .replace('{count}', String(items.entries.length))
    .replace('{name}', items.titleName);
}

/** Hero line, assembled from data. No name appears in any template. */
export function heroTitle(hero: { greeting: string }, names: { primary: string }): string {
  return `${hero.greeting} ${names.primary}`;
}

export type VideoManifestEntry = {
  mp4: string | null;
  webm: string | null;
  poster: string;
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
};

/** Human-readable clip length for the play affordance, e.g. "1:24". */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function aspectToRatio(aspect: string): number {
  const [w, h] = aspect.split(':').map(Number);
  return w / h;
}
