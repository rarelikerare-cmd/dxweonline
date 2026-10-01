// Where every photograph lives, and how it arrives.
//
// Three sizes of each frame, the same names as on the live site:
//   /thumb/  480 px — the contact sheet
//   /mid/    960 px — a frame on a phone, or on a 1× screen
//   /web/   1800 px — a frame on a 2× screen, and the open photograph

export const url = {
  thumb: file => '/thumb/' + encodeURIComponent(file),
  mid: file => '/mid/' + encodeURIComponent(file),
  web: file => '/web/' + encodeURIComponent(file),
};

// A frame no wider than a phone's (400 px) is offered no more than the 960 px
// file: on a phone it is about 980 px across, and Safari, which takes the
// first file at least that big, would otherwise fetch four times the bytes.
export const PHONE = 400;
export const srcset = (file, width = Infinity) =>
  `${url.thumb(file)} 480w, ${url.mid(file)} 960w` + (width > PHONE ? `, ${url.web(file)} 1800w` : '');

// Resolves once the image has loaded AND decoded, so it can be shown in one
// frame — never painted half-decoded on the main thread.
export function settle(img) {
  if (img.complete && img.naturalWidth) return img.decode().catch(() => {});
  return new Promise(resolve => {
    img.addEventListener('load', () => img.decode().catch(() => {}).then(resolve), {once: true});
    img.addEventListener('error', resolve, {once: true});
  });
}

// Fetch and decode a file without putting it on screen. The image is kept,
// so the decoded picture stays in memory for the moment it is wanted.
const warmed = new Map();
export function warm(src) {
  if (!warmed.has(src)) {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    warmed.set(src, settle(img).then(() => img));
    if (warmed.size > 12) warmed.delete(warmed.keys().next().value);
  }
  return warmed.get(src);
}

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Keep a gesture's pointer even if it leaves the element. A pointer that has
// already gone (a cancelled touch) cannot be captured; the gesture then just
// carries on uncaptured instead of throwing.
export function capture(el, id) {
  try {
    el.setPointerCapture(id);
  } catch {}
}

export const idle = fn =>
  'requestIdleCallback' in window ? requestIdleCallback(fn, {timeout: 1500}) : setTimeout(fn, 250);
