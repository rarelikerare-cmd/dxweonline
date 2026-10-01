// The words around the photographs, on the page.
//
// Every word is a strip of embossing tape stuck on the page, modelled and lit
// by js/tape-model.js. An element with the class .tape is stamped into its
// strip, drawn into a canvas centred over it; the words stay in the page, out
// of sight, for anything that reads it instead of looking at it.
//
//   <a class="tape" data-tilt="-1.2" data-vinyl="black" href="/work/">WORK</a>  →  stamp(el)
//
// data-vinyl is the strip's vinyl — "black", "white", "glass"; none, the plain
// black strip — and data-hover the one it turns into under the pointer, drawn
// a second time exactly over the first (app.css crosses them).
//
// Lighting the landing's name takes a phone a good part of a second, so no
// strip is lit on the page's own thread: helpers in the background
// (js/tape-worker.js) do it, one for the clear strip and one for the black
// ones. What is on screen goes first, then what the next move shows, then
// the strips labels turn into — nothing waits for the page to be idle — and
// what a helper has drawn it keeps on the device, so a second visit reads it
// back. Where a browser has no helpers, the page draws the strips itself, a
// few rows at a time between whatever else it has to do.

import {TAPE, span, plan, painting} from './tape-model.js';

const VINYLS = ['white', 'black', 'glass'];
const tapes = new Map(); // element → its label
const cache = new Map(); // the strips drawn this visit, by what they are
const pending = new Map(); // …and the ones asked for, by the same

// ---------- drawing on the page, where there is no helper ----------

// A painting worked through a slice at a time between whatever else the page
// has to do.
const later = (() => {
  const channel = new MessageChannel(), jobs = [];
  channel.port1.onmessage = () => jobs.shift()?.();
  return job => {
    jobs.push(job);
    channel.port2.postMessage(0);
  };
})();
function work(it, done) {
  const until = performance.now() + 10;
  for (;;) {
    let r;
    try {
      r = it.next();
    } catch {
      return done(null); // a strip that cannot be drawn is left out, not waited for
    }
    if (r.done) return done(r.value);
    if (performance.now() > until) return later(() => work(it, done));
  }
}
const plans = new Map();
const planOf = (word, tilt) => {
  const key = word + '|' + tilt;
  if (!plans.has(key)) plans.set(key, plan(word, tilt ?? undefined));
  return plans.get(key);
};
const here = job =>
  new Promise(resolve => {
    try {
      work(painting(planOf(job.word, job.tilt), job.cssH, job.dpr, job.vinyl), resolve);
    } catch {
      resolve(null);
    }
  });

// ---------- the helpers ----------

// One for each kind of strip. The page's head starts the clear one's and the
// black ones' before anything else (window.tapeHelpers), so that their code
// arrives with the page's; any other kind's is started when first needed.
const lanes = new Map();
let serial = 0;

function lane(vinyl) {
  const kind = vinyl || 'plain';
  if (lanes.has(kind)) return lanes.get(kind);
  const l = {queue: [], busy: null, timer: 0, worker: globalThis.tapeHelpers?.[kind] ?? null};
  if (!l.worker) {
    try {
      l.worker = new Worker(new URL('./tape-worker.js', import.meta.url), {type: 'module'});
    } catch {}
  }
  if (l.worker?.failed) {
    l.worker.terminate();
    l.worker = null;
  }
  if (l.worker) {
    l.worker.onmessage = e => answer(l, e.data);
    l.worker.onerror = l.worker.onmessageerror = () => fail(l);
  }
  lanes.set(kind, l);
  return l;
}

// What a helper draws next: what is on screen, then the labels the next move
// shows, then the strips labels turn into (the landing's black name, which
// only the pointer or that move shows) — and last what is only wanted ahead
// of time. The small ones first also make a helper quick for the big one.
const shown = el => (el.checkVisibility ? el.checkVisibility({visibilityProperty: true}) : true);
const rank = job => (job.ahead ? 4 : job.over ? 3 : shown(job.el) ? 0 : 2);
const wanted = key => [...tapes.values()].some(t => t.layers.some(l => l.want === key));

function pump(l) {
  while (!l.busy && l.queue.length) {
    let best = l.queue[0], low = rank(best);
    for (const job of l.queue) {
      const r = rank(job);
      if (r < low) [best, low] = [job, r];
    }
    l.queue.splice(l.queue.indexOf(best), 1);
    // a label resized or restamped since no longer needs what it asked for
    if (!best.ahead && !wanted(best.key)) {
      pending.delete(best.key);
      continue;
    }
    l.busy = best;
    if (!l.worker) {
      here(best).then(out => finish(l, best, out));
      return;
    }
    const {id, word, tilt, cssH, dpr, vinyl} = best;
    l.worker.postMessage({id, word, tilt, cssH, dpr, vinyl});
    l.timer = setTimeout(() => fail(l), 20000); // one that never answers is given up
  }
}

function answer(l, msg) {
  const job = l.busy;
  if (!job || msg.id !== job.id) return;
  clearTimeout(l.timer);
  if (msg.error) return fail(l);
  finish(l, job, {image: new ImageData(new Uint8ClampedArray(msg.pixels), msg.width, msg.height), width: msg.width, height: msg.height});
}

// A helper whose code did not load, or that stopped answering: the page
// draws that kind of strip itself from now on.
function fail(l) {
  if (!l.worker) return;
  clearTimeout(l.timer);
  l.worker.terminate();
  l.worker = null;
  if (l.busy) l.queue.unshift(l.busy);
  l.busy = null;
  pump(l);
}

function finish(l, job, out) {
  l.busy = null;
  pending.delete(job.key);
  if (out) {
    out.dpr = job.dpr;
    cache.set(job.key, out);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    for (const t of tapes.values()) {
      for (const layer of t.layers) if (layer.want === job.key && layer.drawn !== job.key) draw(t, layer, out);
    }
  }
  pump(l);
}

function ask(key, spec, el, over, ahead = false) {
  if (cache.has(key)) return;
  const job = pending.get(key);
  if (job) {
    if (job.ahead && !ahead) Object.assign(job, {el, over, ahead}); // wanted now after all
    return;
  }
  const l = lane(spec.vinyl);
  pending.set(key, {id: ++serial, key, el, over, ahead, ...spec});
  l.queue.push(pending.get(key));
  // everything asked for in this frame is in before a helper picks from it
  if (!l.soon) {
    l.soon = true;
    queueMicrotask(() => {
      l.soon = false;
      pump(l);
    });
  }
}

// ---------- labels on the page ----------

// A label is its strip, drawn into a canvas — and, where it has data-hover,
// drawn a second time as the strip it turns into under the pointer, laid
// exactly over the first.
function need(t) {
  const el = t.el, style = getComputedStyle(el);
  const cssH = parseFloat(style.height), cssW = parseFloat(style.width);
  if (!(cssH > 0)) return;
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  t.box = {cssH, cssW, dpr};
  for (const layer of t.layers) {
    const key = `${t.word}|${t.tilt}|${cssH}|${dpr}|${layer.vinyl}`;
    layer.want = key;
    if (layer.drawn === key) continue;
    if (cache.has(key)) draw(t, layer, cache.get(key));
    else ask(key, {word: t.word, tilt: t.tilt, cssH, dpr, vinyl: layer.vinyl}, el, !!layer.over);
  }
  if (t.layers.every(l => l.drawn === l.want)) t.onReady();
}

function draw(t, layer, out) {
  const c = layer.canvas, {cssH, cssW} = t.box, w = out.width / out.dpr, h = out.height / out.dpr;
  c.width = out.width;
  c.height = out.height;
  c.getContext('2d').putImageData(out.image, 0, 0);
  Object.assign(c.style, {width: w + 'px', height: h + 'px', left: (cssW - w) / 2 + 'px', top: (cssH - h) / 2 + 'px'});
  layer.drawn = layer.want;
  t.at = {h: cssH, w, ch: h};
  if (layer === t.layers[0]) t.onFirst();
  if (t.layers.every(l => l.drawn === l.want)) t.onReady();
}

// Resolves once a label has been drawn: the whole of it, or only its own strip.
export const drawn = (el, first = false) => tapes.get(el)?.[first ? 'first' : 'ready'] ?? Promise.resolve();

// Draw a strip a label is about to show — the viewer's next number — before
// it is wanted, after everything else (and after what the label shows now,
// which is asked for in the same frame, just before).
export function ahead(el, words) {
  requestAnimationFrame(() => {
    const t = tapes.get(el);
    if (!t?.box) return;
    const word = words.trim().toUpperCase(), {cssH, dpr} = t.box;
    for (const layer of t.layers) {
      ask(`${word}|${t.tilt}|${cssH}|${dpr}|${layer.vinyl}`, {word, tilt: t.tilt, cssH, dpr, vinyl: layer.vinyl}, el, !!layer.over, true);
    }
  });
}

// Labels are measured in the next frame, all at once, and asked for.
const queue = new Set();
let frame = 0;
function schedule(t) {
  queue.add(t);
  frame ||= requestAnimationFrame(() => {
    frame = 0;
    const now = [...queue];
    queue.clear();
    now.forEach(need);
  });
}

// While the window is being resized — or the phone turned — a strip is only
// stretched to its new size; it is drawn again once the size has held still.
const sizes = new ResizeObserver(entries =>
  entries.forEach(e => {
    const t = tapes.get(e.target);
    if (!t) return;
    if (!t.at) return schedule(t);
    const {width, height} = e.contentRect, f = height / t.at.h, w = t.at.w * f, h = t.at.ch * f;
    for (const {canvas} of t.layers) Object.assign(canvas.style, {width: w + 'px', height: h + 'px', left: (width - w) / 2 + 'px', top: (height - h) / 2 + 'px'});
    clearTimeout(t.later);
    t.later = setTimeout(() => schedule(t), 160);
  }),
);
let resolution = null;
function watchResolution() {
  resolution?.removeEventListener('change', watchResolution);
  resolution = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  resolution.addEventListener('change', watchResolution, {once: true});
  tapes.forEach(schedule);
}
watchResolution();

// Stamp an element's words into tape.
export function stamp(el, words = el.dataset.tape ?? el.textContent) {
  const word = words.trim().toUpperCase();
  const vinyl = VINYLS.includes(el.dataset.vinyl) ? el.dataset.vinyl : '', hover = VINYLS.includes(el.dataset.hover) ? el.dataset.hover : '';
  let t = tapes.get(el);
  if (t && t.word === word && t.vinyl === vinyl && t.hover === hover) return;
  if (!t) {
    t = {el};
    t.first = new Promise(resolve => (t.onFirst = resolve));
    t.ready = new Promise(resolve => (t.onReady = resolve));
    tapes.set(el, t);
    sizes.observe(el);
  }
  const canvas = over => {
    const c = document.createElement('canvas');
    c.setAttribute('aria-hidden', 'true');
    if (over) c.className = 'tape-over';
    return c;
  };
  t.word = word;
  t.tilt = el.dataset.tilt != null ? Number(el.dataset.tilt) : null;
  t.vinyl = vinyl;
  t.hover = hover;
  t.layers = [{canvas: (t.base ??= canvas(false)), vinyl}];
  if (hover) t.layers.push({canvas: (t.over ??= canvas(true)), vinyl: hover, over: true});
  const text = document.createElement('span');
  text.className = 'tape-words';
  text.textContent = words.trim();
  el.replaceChildren(text, ...t.layers.map(l => l.canvas));
  el.style.setProperty('--tape-ratio', (span(word) / TAPE).toFixed(4));
  el.dataset.stamped = word;
  schedule(t);
}

export const stampAll = (root = document) => root.querySelectorAll('.tape').forEach(el => stamp(el));
