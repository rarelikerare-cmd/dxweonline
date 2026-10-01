// Every move in one place. Only transform and opacity are ever animated,
// so everything runs on the compositor and nothing is laid out mid-flight.

export const reduced = matchMedia('(prefers-reduced-motion: reduce)');

export const GLIDE = 'cubic-bezier(.4,0,.2,1)'; // long moves: the landing, a frame opening
export const EASE = 'cubic-bezier(.23,1,.32,1)'; // short settles

// Start animations on one shared clock, so layers that travel together
// cannot drift apart by a frame. Resolves when the last one has finished.
export function together(animations) {
  const now = document.timeline.currentTime;
  for (const a of animations) a.startTime = now;
  return Promise.all(animations.map(a => a.finished.catch(() => {})));
}

// End a set of fill-mode animations once the page's own styles already
// describe their end state — the swap is invisible.
export const release = animations => animations.forEach(a => a.cancel());

// The transform that puts an element whose layout box is `box` exactly over
// `rect`, for transform-origin at the centre. Scaled by width.
export function onto(box, rect) {
  const s = rect.width / box.width;
  const dx = rect.left + rect.width / 2 - (box.left + box.width / 2);
  const dy = rect.top + rect.height / 2 - (box.top + box.height / 2);
  return `translate(${dx}px,${dy}px) scale(${s})`;
}

// The same, for transform-origin at the top left corner.
export const ontoCorner = (box, rect) =>
  `translate(${rect.left - box.left}px,${rect.top - box.top}px) scale(${rect.width / box.width})`;

export const fade = (el, from, to, timing) =>
  el.animate([{opacity: from}, {opacity: to}], {fill: 'both', easing: 'ease', ...timing});
