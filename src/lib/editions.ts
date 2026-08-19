/**
 * The editions that exist, and the only place they are declared.
 *
 * The list was previously inline in YearSwitch. Once the title page also needed
 * it, a second copy would have meant that adding 2027 required editing two
 * files that had no reason to know about each other — and the failure mode is
 * silent: one switcher offering a year the other does not.
 *
 * Adding next year is one line here.
 */
export type Edition = {
  year: number;
  href: string;
  /** Shown under the year in the footer/banner switcher. */
  label: string;
};

export const EDITIONS: readonly Edition[] = [
  { year: 2025, href: '/2025/', label: 'The first one' },
  { year: 2026, href: '/', label: 'This year' },
];

/**
 * Editions other than `current`, newest first.
 *
 * Newest-first because the title page renders these immediately after the
 * current year, so the sequence reads backwards in time from where you are —
 * 2027 · 2026 · 2025 — which is how a run of back issues is listed.
 */
export function priorEditions(current: number): Edition[] {
  return EDITIONS.filter((e) => e.year !== current).sort((a, b) => b.year - a.year);
}
