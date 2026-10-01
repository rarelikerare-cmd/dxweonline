// The sequence on its arc.
//
// Concept 11 drew this with three.js' CSS3DRenderer — 1.4 MB of library
// whose only output was one CSS transform per frame. Here that transform is
// written directly: the same 40° camera (as CSS perspective), the same arc,
// and the same turn, scale and blur for every distance from the centre —
// except on a phone, where the photographs stay sharp.
//
// What is new: a frame always comes to rest on a photograph, frames know
// their size before their photograph arrives, and nothing is computed while
// nothing moves.

import {srcset, settle, capture, PHONE} from './media.js';
import {reduced} from './motion.js';

const ARC_STEP = .36; // radians between neighbouring frames
const TURN = .72; // how far a frame turns toward the centre, per radian
const FIELD = 40; // the old camera's vertical field of view, degrees
const SHOWN = 3.5; // frames further than this from the centre are hidden…
const FETCH = 4.5; // …and frames this close start loading
const BLUR_PER_SPEED = .05; // motion blur, px per frame/second (tuned on a 120 Hz screen)

// A phone — a touch screen whose shorter side is at most 520 px, either way
// up — cannot blur several large photographs anew in every frame of a swipe
// without dropping frames, and its arc shows the neighbours only as slivers
// at the edges: there the photographs are never blurred, only moved.
const handheld = matchMedia('(pointer: coarse) and (max-width: 520px), (pointer: coarse) and (max-height: 520px)');

export class Carousel {
  constructor(root, arc, frames, {onOpen, onSettle} = {}) {
    Object.assign(this, {root, arc, frames, onOpen, onSettle});
    this.n = frames.length;
    this.position = 0;
    this.target = 0;
    this.velocity = 0;
    this.hover = -1;
    this.drag = null;
    this.wheel = null;
    this.running = false;
    this.live = false; // no photograph is fetched until the page says so
    this.fetching = 0;
    this.cards = frames.map((frame, i) => this.#card(frame, i));
    arc.append(...this.cards.map(card => card.el));
    this.#bind();
    new ResizeObserver(() => this.layout()).observe(root);
    handheld.addEventListener('change', () => this.wake());
    this.layout();
  }

  // ---------- frames ----------

  #card(frame, i) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'card';
    el.dataset.i = i;
    el.setAttribute('aria-label', 'Open frame ' + String(i + 1).padStart(2, '0'));
    el.style.setProperty('--c', frame.color);
    el.style.setProperty('--lqip', `url("${frame.lqip}")`);
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    el.append(img);
    el.addEventListener('pointerenter', e => {
      if (e.pointerType === 'mouse' && !this.drag) {
        this.hover = i;
        this.wake();
      }
    });
    el.addEventListener('pointerleave', () => {
      if (this.hover === i) {
        this.hover = -1;
        this.wake();
      }
    });
    el.addEventListener('focus', () => this.go(i));
    return {el, img, frame, i, w: 0, h: 0, ready: null, shown: false, scale: 1, lift: 0, transform: '', filter: ''};
  }

  // Start fetching a frame's photograph. Resolves once it is on screen.
  load(card, urgent = false) {
    if (card.ready) return card.ready;
    const {img, frame} = card;
    if (urgent) img.fetchPriority = 'high';
    img.sizes = Math.round(card.w) + 'px';
    img.srcset = srcset(frame.file, card.w);
    card.ready = settle(img).then(() => img.classList.add('in'));
    return card.ready;
  }

  // The photographs near the centre, nearest first: on a phone, where one is
  // on screen at a time, two at once — so the one in the middle never shares
  // the line with eight others — and elsewhere six, as many as are in view.
  #fetch() {
    const n = this.n, lanes = this.narrow ? 2 : 6, near = [];
    for (const card of this.cards) {
      if (card.ready) continue;
      const away = Math.abs(((((card.i - this.position + n / 2) % n) + n) % n) - n / 2);
      if (away < FETCH) near.push([away, card]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const [away, card] of near) {
      if (this.fetching >= lanes) break;
      this.fetching++;
      if (away < .5) card.img.fetchPriority = 'high';
      this.load(card).then(() => {
        this.fetching--;
        if (this.live) this.#fetch();
      });
    }
  }

  // ---------- geometry ----------

  layout() {
    const w = this.root.clientWidth, h = this.root.clientHeight;
    if (!w || !h) return;
    this.width = w;
    this.height = h;
    this.root.style.perspective = h / (2 * Math.tan(((FIELD / 2) * Math.PI) / 180)) + 'px';
    // A tall stage — a phone, a tablet held upright — shows one photograph at a
    // time; a wide one shows the arc. A wide but low one, a phone on its side,
    // lets its photographs take more of the height, and so shows fewer of them.
    this.narrow = w < h * .9;
    const low = !this.narrow && h < 520;
    const maxW = w * (this.narrow ? .84 : low ? .5 : .46), maxH = h * (this.narrow ? .6 : low ? .72 : .48);
    this.spacing = this.narrow ? maxW + w * .035 : maxW + Math.max(35, w * .08);
    for (const card of this.cards) {
      const ratio = card.frame.w / card.frame.h;
      card.w = Math.min(maxW, maxH * ratio);
      card.h = card.w / ratio;
      const s = card.el.style;
      s.width = card.w + 'px';
      s.height = card.h + 'px';
      s.marginLeft = -card.w / 2 + 'px';
      s.marginTop = -card.h / 2 + 'px';
      if (card.ready) {
        card.img.sizes = Math.round(card.w) + 'px';
        // grown past a phone's size (a window made wider): now offer the big file too
        if (card.w > PHONE && !card.img.srcset.includes('1800w')) card.img.srcset = srcset(card.frame.file, card.w);
      }
      card.transform = '';
    }
    this.render(0, true);
  }

  // One frame of the arc. Returns true while anything is still in motion.
  render(dt, snap = false) {
    const still = reduced.matches, sharp = still || handheld.matches;
    const k = snap || still ? 1 : 1 - Math.exp(-12 * dt);
    const before = this.position;
    this.position += (this.target - this.position) * k;
    if (Math.abs(this.target - this.position) < 5e-4) this.position = this.target;
    const speed = dt > 0 ? (this.position - before) / dt : 0;
    this.velocity = snap ? 0 : this.velocity + (speed - this.velocity) * (still ? 1 : 1 - Math.exp(-14 * dt));
    if (Math.abs(this.velocity) < 1e-3) this.velocity = 0;
    let moving = this.position !== this.target || this.velocity !== 0;

    const n = this.n, radius = this.spacing / ARC_STEP;
    const motion = sharp ? 0 : Math.min(4.5, Math.abs(this.velocity) * BLUR_PER_SPEED);
    if (this.live) this.#fetch();
    for (const card of this.cards) {
      const offset = ((((card.i - this.position + n / 2) % n) + n) % n) - n / 2;
      const away = Math.abs(offset);
      const shown = away < SHOWN;
      const entering = shown && !card.shown;
      if (shown !== card.shown) {
        card.shown = shown;
        // 'inherit', not 'visible': a hidden place must still hide its frames
        card.el.style.visibility = shown ? 'inherit' : 'hidden';
      }
      if (!shown) continue;

      const hovered = this.hover === card.i;
      const scale = Math.max(.68, 1 - away * .13) * (hovered ? 1.035 : 1);
      const lift = hovered ? 35 : 0;
      const kk = entering || snap || still ? 1 : 1 - Math.exp(-12 * dt);
      card.scale += (scale - card.scale) * kk;
      card.lift += (lift - card.lift) * kk;
      if (Math.abs(scale - card.scale) < 1e-4 && Math.abs(lift - card.lift) < .02) {
        card.scale = scale;
        card.lift = lift;
      } else moving = true;

      const theta = offset * ARC_STEP;
      const x = Math.sin(theta) * radius;
      const z = (Math.cos(theta) - 1) * radius + card.lift;
      const turn = still ? 0 : -theta * TURN;
      const transform = `translate3d(${x.toFixed(2)}px,0,${z.toFixed(2)}px) rotateY(${turn.toFixed(4)}rad) scale(${card.scale.toFixed(4)})`;
      if (transform !== card.transform) {
        card.el.style.transform = transform;
        card.transform = transform;
      }
      const edge = Math.max(0, Math.min(5, (away - .18) * 3.2));
      const blur = sharp ? 0 : Math.min(7, edge + motion);
      const filter = blur < .05 ? 'none' : `blur(${blur.toFixed(2)}px)`;
      if (filter !== card.filter) {
        card.el.style.filter = filter;
        card.filter = filter;
      }
    }
    return moving;
  }

  wake() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(t => this.#tick(t));
  }

  #tick(now) {
    const dt = Math.min(Math.max((now - this.last) / 1000, 0), .05);
    this.last = now;
    if (this.render(dt) || this.drag) requestAnimationFrame(t => this.#tick(t));
    else {
      this.running = false;
      this.onSettle?.(this.current());
    }
  }

  // ---------- positions ----------

  // the frame nearest the centre, 0…n-1
  current() {
    return ((Math.round(this.position) % this.n) + this.n) % this.n;
  }

  // the position that shows frame i, reached the shorter way round
  nearest(i, from = Math.round(this.target)) {
    let d = (((i - from) % this.n) + this.n) % this.n;
    if (d > this.n / 2) d -= this.n;
    return from + d;
  }

  // jump without motion — behind glass, or before a photograph lands
  set(position) {
    this.position = this.target = position;
    this.velocity = 0;
    this.hover = -1;
    this.render(0, true);
  }

  go(i) {
    this.target = this.nearest(i);
    this.wake();
  }

  step(d) {
    this.target = Math.round(this.target) + d;
    this.wake();
  }

  isShown(i) {
    return this.cards[i].shown;
  }

  rect(i) {
    return this.cards[i].el.getBoundingClientRect();
  }

  // keep a frame off screen while its photograph is somewhere else
  hold(i, on) {
    this.cards[i]?.el.classList.toggle('held', on);
  }

  // ---------- input ----------

  #bind() {
    const root = this.root;

    root.addEventListener('wheel', e => {
      if (e.ctrlKey) return;
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const px = d * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.width : 1);
      this.wheel ??= {from: this.target};
      this.target += px / this.spacing;
      clearTimeout(this.wheelEnd);
      this.wheelEnd = setTimeout(() => {
        this.#snap(this.wheel.from, this.target);
        this.wheel = null;
        this.wake();
      }, 160);
      this.wake();
    }, {passive: false});

    root.addEventListener('pointerdown', e => {
      if (e.button !== 0 || this.drag) return;
      this.drag = {id: e.pointerId, x: e.clientX, from: this.target, moved: false, trail: [[e.timeStamp, e.clientX]]};
    });

    root.addEventListener('pointermove', e => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      if (!d.moved) {
        if (Math.abs(dx) < 6) return;
        d.moved = true;
        this.hover = -1;
        capture(root, e.pointerId);
        root.classList.add('dragging');
      }
      this.target = d.from - dx / this.spacing;
      d.trail.push([e.timeStamp, e.clientX]);
      if (d.trail.length > 6) d.trail.shift();
      this.wake();
    });

    const release = e => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      root.classList.remove('dragging');
      if (!d.moved) return;
      // the click that ends a drag is not a request to open a frame
      this.dragged = true;
      setTimeout(() => (this.dragged = false), 0);
      // release speed from the last few samples, px per ms (positive = rightward);
      // too short a trail to trust counts as no fling at all
      const [t0, x0] = d.trail[0], [t1, x1] = d.trail[d.trail.length - 1];
      const v = t1 - t0 >= 12 ? Math.max(-2.5, Math.min(2.5, (x1 - x0) / (t1 - t0))) : 0;
      if (this.narrow) {
        // one photograph per swipe
        const dx = e.clientX - d.x, from = Math.round(d.from);
        const go = Math.abs(dx) > this.spacing * .18 || Math.abs(v) > .35;
        this.target = go ? from + ((Math.abs(v) > .35 ? v : dx) < 0 ? 1 : -1) : from;
      } else {
        // a fling carries on, but never more than three frames past the hand
        const fling = Math.max(-3, Math.min(3, (-v * 140) / this.spacing));
        this.#snap(d.from, this.target + fling);
      }
      this.wake();
    };
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);

    root.addEventListener('click', e => {
      if (this.dragged) {
        e.preventDefault();
        return;
      }
      const el = e.target.closest('.card');
      if (el) this.onOpen?.(Number(el.dataset.i));
    });

    root.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        this.step(e.key === 'ArrowRight' ? 1 : -1);
      } else if ((e.key === 'Enter' || e.key === ' ') && e.target === root) {
        e.preventDefault();
        this.onOpen?.(this.current());
      }
    });
  }

  // End a gesture on a photograph: a small nudge falls back, anything more
  // carries on to the next frame in the direction it was going.
  #snap(from, to) {
    const d = to - from;
    this.target = Math.abs(d) < .05 ? Math.round(to) : Math.round(to + Math.sign(d) * .35);
  }
}
