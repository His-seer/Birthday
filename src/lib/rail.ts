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

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Step one tile, WRAPPING at both ends.
 *
 * Wrap rather than true infinite scroll, deliberately. A real loop means
 * cloning tiles and silently repositioning scrollLeft, which would make
 * JavaScript the mechanism again — a script failure would leave a broken rail
 * instead of a working one, which is the 2025 carousel's failure mode
 * (AUDIT M7). It would also duplicate every clip for a screen reader and make
 * the scrollbar lie about how much content there is.
 *
 * Wrapping gets the part that actually matters — no dead end at the edges —
 * for none of that. The rail is still just a scroll container.
 */
function step(rail: HTMLElement, direction: 1 | -1) {
  const tile = rail.firstElementChild as HTMLElement | null;
  if (!tile) return;

  // Tile width plus the flex gap, so one press lands cleanly on the next snap
  // point rather than drifting a few pixels short each time.
  const gap = parseFloat(getComputedStyle(rail).columnGap) || 0;
  const distance = tile.getBoundingClientRect().width + gap;

  // 1px of slack: fractional scroll widths mean scrollLeft rarely reaches the
  // maximum exactly, so a strict `>=` would never register as "at the end".
  const max = rail.scrollWidth - rail.clientWidth - 1;
  const atEnd = rail.scrollLeft >= max;
  const atStart = rail.scrollLeft <= 0;

  if ((direction === 1 && atEnd) || (direction === -1 && atStart)) {
    /* Jump, don't glide. Smooth-scrolling the full width of 34 clips to get
       back to the start is a long, disorienting ride past everything you just
       looked at — the wrap should read as "round again", not as a rewind. */
    rail.scrollTo({ left: direction === 1 ? 0 : rail.scrollWidth, behavior: 'auto' });
    return;
  }

  rail.scrollBy({ left: distance * direction, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

export function initRails(selector = '.rail') {
  document.querySelectorAll<HTMLElement>(selector).forEach((wrap) => {
    if (wrap.dataset[BOUND] !== undefined) return;

    const rail = wrap.querySelector<HTMLElement>('[data-rail-track]');
    const prev = wrap.querySelector<HTMLButtonElement>('.rail__nav--prev');
    const next = wrap.querySelector<HTMLButtonElement>('.rail__nav--next');
    if (!rail || !prev || !next) return;

    wrap.dataset[BOUND] = '';

    /* No disabled state any more: with wrapping, both directions are always
       available, so a disabled arrow would be lying about what a press does. */
    prev.addEventListener('click', () => step(rail, -1));
    next.addEventListener('click', () => step(rail, 1));
  });
}
