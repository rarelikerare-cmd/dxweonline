// One photograph, open.
//
// It lifts out of its frame on the arc and goes back into it, with the
// sequence visible behind glass the whole time. Arrow keys, the buttons or a
// sideways swipe step through; a swipe down puts it back; a pinch, a
// double-tap or a double-click looks closer.

import {url, settle, warm, wait, capture} from './media.js';
import {GLIDE, EASE, reduced, together, release, ontoCorner, fade} from './motion.js';
import {stamp, ahead} from './tape.js';

const pad = n => String(n).padStart(2, '0');
const count = (i, n) => `${pad(i + 1)} / ${pad(n)}`; // the counter under the photograph
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class Viewer {
  constructor(el, frames, {onStep, onDismiss} = {}) {
    Object.assign(this, {el, frames, onStep, onDismiss});
    this.glass = el.querySelector('.viewer-glass');
    this.photo = el.querySelector('.viewer-photo');
    this.meta = el.querySelector('.viewer-meta');
    this.chrome = [...el.querySelectorAll('.chrome')];
    this.i = -1;
    this.isOpen = false;
    this.busy = Promise.resolve();
    this.pending = null;
    this.zoom = {s: 1, x: 0, y: 0};
    this.pointers = new Map();
    this.#bind();
    addEventListener('resize', () => this.isOpen && this.#size(this.frames[this.i]));
  }

  // ---------- open and close ----------

  // Open frame i, lifting it out of `from` (its frame's rect on screen).
  // `src` is what that frame already shows, so the first paint is instant.
  async open(i, {from = null, src = null} = {}) {
    await this.busy;
    const frame = this.frames[i], photo = this.photo;
    this.i = i;
    this.pending = null;
    this.#label(i);
    this.#size(frame);
    for (const el of [this.glass, photo, ...this.chrome]) el.style.opacity = '0';
    photo.src = src || url.web(frame.file);
    this.el.classList.add('open');
    this.isOpen = true;
    await Promise.race([settle(photo), wait(700)]);

    const moves = [
      fade(this.glass, 0, 1, {duration: 320}),
      ...this.chrome.map(c => fade(c, 0, 1, {duration: 240, delay: 200})),
    ];
    if (from && !reduced.matches) {
      moves.push(photo.animate(
        [{transform: ontoCorner(this.#box(), from), opacity: 1}, {transform: 'none', opacity: 1}],
        {duration: 460, easing: GLIDE, fill: 'both'},
      ));
    } else moves.push(fade(photo, 0, 1, {duration: 240}));
    for (const el of [this.glass, photo, ...this.chrome]) el.style.opacity = '';
    this.busy = together(moves).then(() => release(moves));
    await this.busy;
    this.#sharpen(frame);
    this.#neighbours(i);
  }

  // Put the photograph back into `to` (its frame's rect), or fade it out.
  // Starts from wherever a swipe or a zoom has left it.
  async close({to = null} = {}) {
    await this.busy;
    if (!this.isOpen) return;
    const photo = this.photo, now = getComputedStyle(photo);
    const moves = [
      fade(this.glass, Number(getComputedStyle(this.glass).opacity), 0, {duration: 300, delay: 60}),
      ...this.chrome.map(c => fade(c, 1, 0, {duration: 140})),
    ];
    if (to && !reduced.matches) {
      moves.push(photo.animate(
        [{transform: now.transform, opacity: now.opacity}, {transform: ontoCorner(this.#box(), to), opacity: 1}],
        {duration: 420, easing: GLIDE, fill: 'both'},
      ));
    } else moves.push(fade(photo, Number(now.opacity), 0, {duration: 200}));
    this.busy = together(moves);
    await this.busy;
    this.el.classList.remove('open');
    this.isOpen = false;
    this.zoom = {s: 1, x: 0, y: 0};
    photo.classList.remove('zoomed');
    for (const el of [photo, this.glass]) el.style.transform = el.style.opacity = '';
    release(moves);
  }

  // ---------- stepping ----------

  // straight to frame i (the back button, between two open photographs)
  jump(i) {
    if (this.isOpen && i >= 0 && i !== this.i) this.#show(i, i > this.i ? 1 : -1);
  }

  step(d) {
    if (!this.isOpen || this.zoom.s > 1) return;
    const n = this.frames.length;
    this.#show((((this.pending ?? this.i) + d) % n + n) % n, d);
  }

  async #show(i, dir) {
    this.pending = i;
    this.dir = dir;
    if (this.stepping) return;
    this.stepping = true;
    const photo = this.photo;
    while (this.pending !== null && this.pending !== this.i) {
      const target = this.pending, frame = this.frames[target], d = this.dir;
      const next = warm(url.web(frame.file));
      const x = this.dragX || 0;
      this.dragX = 0;
      const out = photo.animate(
        [{transform: `translateX(${x}px)`, opacity: photo.style.opacity || 1}, {transform: `translateX(${x - d * 56}px)`, opacity: 0}],
        {duration: 150, easing: 'ease-in', fill: 'forwards'},
      );
      await out.finished.catch(() => {});
      await Promise.race([next, wait(900)]);
      this.i = target;
      this.#label(target);
      this.#size(frame);
      photo.style.transform = photo.style.opacity = '';
      photo.src = url.web(frame.file);
      await Promise.race([settle(photo), wait(300)]);
      this.onStep?.(target);
      const back = photo.animate(
        [{transform: `translateX(${d * 56}px)`, opacity: 0}, {transform: 'none', opacity: 1}],
        {duration: 240, easing: EASE},
      );
      out.cancel();
      await back.finished.catch(() => {});
    }
    this.pending = null;
    this.stepping = false;
    this.#neighbours(this.i);
  }

  // ---------- size and detail ----------

  // at its largest the photograph is 92% of the screen's width, 82% of its height
  #size(frame) {
    const s = Math.min((innerWidth * .92) / frame.w, (innerHeight * .82) / frame.h);
    this.photo.style.width = frame.w * s + 'px';
    this.photo.style.height = frame.h * s + 'px';
  }

  // the photograph's layout box, before any transform
  #box() {
    const p = this.photo;
    return {left: p.offsetLeft, top: p.offsetTop, width: p.offsetWidth, height: p.offsetHeight};
  }

  #label(i) {
    const n = this.frames.length;
    stamp(this.meta, count(i, n));
    // and the numbers either side, so that a step shows its own at once
    for (const d of [1, -1]) ahead(this.meta, count((i + d + n) % n, n));
    this.photo.alt = 'Frame ' + pad(i + 1);
  }

  // The frame may have opened with its smaller file; swap in the full one
  // once it has decoded — same picture, same size, so the swap is invisible.
  #sharpen(frame) {
    const full = url.web(frame.file);
    if (this.photo.currentSrc.endsWith(full)) return;
    const i = this.i;
    warm(full).then(() => {
      if (this.isOpen && this.i === i && !this.stepping) this.photo.src = full;
    });
  }

  #neighbours(i) {
    const n = this.frames.length;
    for (const d of [1, -1]) warm(url.web(this.frames[(i + d + n) % n].file));
  }

  // ---------- zoom ----------

  #apply() {
    const {s, x, y} = this.zoom;
    this.photo.style.transform = s === 1 && !x && !y ? '' : `translate(${x}px,${y}px) scale(${s})`;
    this.photo.classList.toggle('zoomed', s > 1);
  }

  // Keep a zoomed photograph covering the screen where it can, and centred
  // on its own frame where it cannot.
  #clamp() {
    const box = this.#box(), {s} = this.zoom;
    const W = box.width * s, H = box.height * s;
    this.zoom.x = W <= innerWidth ? (box.width - W) / 2 : clamp(this.zoom.x, innerWidth - W - box.left, -box.left);
    this.zoom.y = H <= innerHeight ? (box.height - H) / 2 : clamp(this.zoom.y, innerHeight - H - box.top, -box.top);
  }

  // zoom to scale s, keeping screen point (px, py) where it is
  #zoomAt(s, px, py, from = this.zoom) {
    const box = this.#box();
    const lx = (px - box.left - from.x) / from.s, ly = (py - box.top - from.y) / from.s;
    this.zoom = {s, x: px - box.left - s * lx, y: py - box.top - s * ly};
    this.#clamp();
  }

  #toggleZoom(px, py) {
    const before = getComputedStyle(this.photo).transform;
    if (this.zoom.s > 1) this.zoom = {s: 1, x: 0, y: 0};
    else {
      this.#zoomAt(2.5, px, py);
      this.#sharpen(this.frames[this.i]);
    }
    this.#apply();
    if (!reduced.matches) {
      this.photo.animate([{transform: before}, {transform: this.photo.style.transform || 'none'}], {duration: 280, easing: EASE});
    }
  }

  #springBack() {
    const photo = this.photo, now = getComputedStyle(photo);
    const moves = [photo.animate([{transform: now.transform, opacity: now.opacity}, {transform: 'none', opacity: 1}], {duration: 260, easing: EASE})];
    const glass = Number(getComputedStyle(this.glass).opacity);
    if (glass < 1) moves.push(this.glass.animate([{opacity: glass}, {opacity: 1}], {duration: 260}));
    photo.style.transform = photo.style.opacity = this.glass.style.opacity = '';
    this.dragX = 0;
  }

  // ---------- input ----------

  #bind() {
    const el = this.el, photo = this.photo;
    el.querySelector('#lbClose').addEventListener('click', () => this.onDismiss?.());
    el.querySelector('#lbPrev').addEventListener('click', () => this.step(-1));
    el.querySelector('#lbNext').addEventListener('click', () => this.step(1));

    // a click on the glass (not the photograph, not a button) puts it back
    el.addEventListener('click', e => {
      if (this.moved) return;
      if (e.target === photo || e.target.closest('button')) return;
      this.onDismiss?.();
    });

    photo.addEventListener('dblclick', e => {
      if (this.pointerType !== 'mouse') return; // touch double-taps are handled below
      e.preventDefault();
      this.#toggleZoom(e.clientX, e.clientY);
    });

    el.addEventListener('pointerdown', e => {
      this.pointerType = e.pointerType;
      if (!this.isOpen || e.target.closest('button')) return;
      this.pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.gesture = null;
        this.pinch = {d: Math.hypot(b.x - a.x, b.y - a.y), m: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}, z: {...this.zoom}};
        for (const id of this.pointers.keys()) capture(el, id);
      } else if (this.pointers.size === 1) {
        this.moved = false;
        this.gesture = {id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, trail: [[e.timeStamp, e.clientX, e.clientY]], z: {...this.zoom}, type: e.pointerType};
      }
    });

    el.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pinch && this.pointers.size === 2) {
        // the point that was under the fingers stays under them, as they
        // spread and as they travel
        const [a, b] = [...this.pointers.values()], q = this.pinch, box = this.#box();
        const s = clamp((q.z.s * Math.hypot(b.x - a.x, b.y - a.y)) / q.d, 1, 5);
        const lx = (q.m.x - box.left - q.z.x) / q.z.s, ly = (q.m.y - box.top - q.z.y) / q.z.s;
        this.zoom = {s, x: (a.x + b.x) / 2 - box.left - s * lx, y: (a.y + b.y) / 2 - box.top - s * ly};
        this.#clamp();
        this.#apply();
        this.moved = true;
        return;
      }
      const g = this.gesture;
      if (!g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      g.trail.push([e.timeStamp, e.clientX, e.clientY]);
      if (g.trail.length > 6) g.trail.shift();
      if (!g.axis) {
        if (Math.hypot(dx, dy) < 8) return;
        g.axis = this.zoom.s > 1 ? 'pan' : Math.abs(dx) > Math.abs(dy) ? 'x' : dy > 0 ? 'down' : 'none';
        capture(el, e.pointerId);
        this.moved = true;
      }
      if (g.axis === 'pan') {
        this.zoom.x = g.z.x + dx;
        this.zoom.y = g.z.y + dy;
        this.#clamp();
        this.#apply();
      } else if (g.axis === 'x') {
        this.dragX = dx;
        photo.style.transform = `translateX(${dx}px)`;
        photo.style.opacity = String(1 - Math.min(Math.abs(dx) / 700, .5));
      } else if (g.axis === 'down') {
        const d = Math.max(0, dy), s = 1 - Math.min(d / 1400, .25), box = this.#box();
        // scale about the centre, although the photograph's origin is its corner
        photo.style.transform = `translate(${dx * .3 + ((1 - s) * box.width) / 2}px,${d + ((1 - s) * box.height) / 2}px) scale(${s})`;
        this.glass.style.opacity = String(1 - Math.min(d / 420, 1));
      }
    });

    const up = e => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      if (this.pinch) {
        if (this.pointers.size < 2) {
          this.pinch = null;
          this.gesture = null;
          if (this.zoom.s < 1.04) {
            this.zoom = {s: 1, x: 0, y: 0};
            this.#apply();
          }
          setTimeout(() => (this.moved = false), 0);
        }
        return;
      }
      const g = this.gesture;
      if (!g || g.id !== e.pointerId) return;
      this.gesture = null;
      if (!g.axis) {
        // a tap; two quick taps on a touch screen look closer
        if (g.type !== 'mouse' && e.target === photo) {
          const t = e.timeStamp, last = this.lastTap;
          if (last && t - last.t < 300 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) {
            this.lastTap = null;
            this.#toggleZoom(e.clientX, e.clientY);
          } else this.lastTap = {t, x: e.clientX, y: e.clientY};
        }
        return;
      }
      setTimeout(() => (this.moved = false), 0);
      const [t0, x0, y0] = g.trail[0], [t1, x1, y1] = g.trail[g.trail.length - 1], dt = Math.max(t1 - t0, 1);
      const vx = (x1 - x0) / dt, vy = (y1 - y0) / dt;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (g.axis === 'x') {
        if (Math.abs(dx) > 70 || Math.abs(vx) > .45) this.step(dx < 0 ? 1 : -1);
        else this.#springBack();
      } else if (g.axis === 'down') {
        if (dy > 110 || vy > .6) this.onDismiss?.();
        else this.#springBack();
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    // trackpads: a pinch zooms, a sideways two-finger swipe steps
    el.addEventListener('wheel', e => {
      e.preventDefault();
      if (!this.isOpen) return;
      if (e.ctrlKey) {
        const s = clamp(this.zoom.s * Math.exp(-e.deltaY * .01), 1, 5);
        if (s === 1) this.zoom = {s: 1, x: 0, y: 0};
        else this.#zoomAt(s, e.clientX, e.clientY);
        this.#apply();
        return;
      }
      if (this.zoom.s > 1) {
        this.zoom.x -= e.deltaX;
        this.zoom.y -= e.deltaY;
        this.#clamp();
        this.#apply();
        return;
      }
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || this.swipeLock) return;
      this.swipe = (this.swipe || 0) + e.deltaX;
      clearTimeout(this.swipeEnd);
      this.swipeEnd = setTimeout(() => (this.swipe = 0), 200);
      if (Math.abs(this.swipe) > 60) {
        this.step(this.swipe > 0 ? 1 : -1);
        this.swipe = 0;
        this.swipeLock = true;
        setTimeout(() => (this.swipeLock = false), 450);
      }
    }, {passive: false});

    // Safari reports trackpad pinches as gesture events
    let base = null;
    el.addEventListener('gesturestart', e => {
      e.preventDefault();
      base = {...this.zoom};
    });
    el.addEventListener('gesturechange', e => {
      e.preventDefault();
      if (!base) return;
      this.#zoomAt(clamp(base.s * e.scale, 1, 5), e.clientX, e.clientY, base);
      this.#apply();
    });
    el.addEventListener('gestureend', e => {
      e.preventDefault();
      base = null;
      if (this.zoom.s < 1.04) {
        this.zoom = {s: 1, x: 0, y: 0};
        this.#apply();
      }
    });
  }
}
