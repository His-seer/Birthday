/**
 * Peek-rail controls — shared by GalleryGrid and ClipSheet.
 *
 * Browsing a rail costs ZERO JavaScript: the scrolling, the snapping and the
 * keyboard interaction are all native (`overflow-x` + `scroll-snap-type`, and
 * a `tabindex="0"` scroll container is arrow-key scrollable by the browser).
 * This module only adds the pointer affordance — prev/next buttons — because a
 * mouse has no swipe gesture. If it fails to load, the rail still works.
 *
 * That is the structural difference from the 2025 carousel this replaces,
 * where JS *was* the mechanism and a script error meant no photographs at all.
 */

/** Idempotent: both components import this, and neither should bind twice. */
const BOUND = 'railBound';

function scrollByTile(rail: HTMLElement, direction: 1 | -1) {
  const tile = rail.firstElementChild as HTMLElement | null;
  if (!tile) return;

  // Tile width plus the flex gap, so one press lands cleanly on the next snap
  // point rather than drifting a few pixels short each time.
  const gap = parseFloat(getComputedStyle(rail).columnGap) || 0;
  const step = tile.getBoundingClientRect().width + gap;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  rail.scrollBy({ left: step * direction, behavior: reduced ? 'auto' : 'smooth' });
}

function syncDisabled(rail: HTMLElement, prev: HTMLButtonElement, next: HTMLButtonElement) {
  // 1px of slack: fractional scroll widths mean scrollLeft rarely hits the
  // maximum exactly, which would leave "next" enabled forever at the end.
  const max = rail.scrollWidth - rail.clientWidth - 1;
  prev.disabled = rail.scrollLeft <= 0;
  next.disabled = rail.scrollLeft >= max;
}

export function initRails(selector = '.rail') {
  document.querySelectorAll<HTMLElement>(selector).forEach((wrap) => {
    if (wrap.dataset[BOUND] !== undefined) return;

    const rail = wrap.querySelector<HTMLElement>('[data-rail-track]');
    const prev = wrap.querySelector<HTMLButtonElement>('.rail__nav--prev');
    const next = wrap.querySelector<HTMLButtonElement>('.rail__nav--next');
    if (!rail || !prev || !next) return;

    wrap.dataset[BOUND] = '';

    prev.addEventListener('click', () => scrollByTile(rail, -1));
    next.addEventListener('click', () => scrollByTile(rail, 1));

    const sync = () => syncDisabled(rail, prev, next);
    rail.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync, { passive: true });
    sync();
  });
}
