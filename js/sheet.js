// The contact sheet: every frame, small, in running order, in its own shape.
// No captions. A thumbnail takes you back to that photograph on the arc.

import {url, settle} from './media.js';

export class Sheet {
  constructor(el, grid, frames, {onPick} = {}) {
    Object.assign(this, {el, grid, frames, onPick});
    this.thumbs = frames.map((frame, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'thumb';
      b.dataset.i = i;
      b.setAttribute('aria-label', 'Frame ' + String(i + 1).padStart(2, '0'));
      b.style.aspectRatio = `${frame.w} / ${frame.h}`;
      b.style.setProperty('--c', frame.color);
      b.style.setProperty('--lqip', `url("${frame.lqip}")`);
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      img.decoding = 'async';
      b.append(img);
      return {b, img, frame};
    });
    grid.append(...this.thumbs.map(t => t.b));
    grid.addEventListener('click', e => {
      const b = e.target.closest('.thumb');
      if (b) this.onPick?.(Number(b.dataset.i));
    });
  }

  // thumbnails are fetched the first time the sheet is wanted, not before
  fill() {
    if (this.filled) return;
    this.filled = true;
    for (const {img, frame} of this.thumbs) {
      img.src = url.thumb(frame.file);
      settle(img).then(() => img.classList.add('in'));
    }
  }

  mark(i) {
    this.thumbs.forEach((t, k) => t.b.classList.toggle('current', k === i));
    this.thumbs[i]?.b.scrollIntoView({block: 'nearest'});
  }

  // an extremely quiet reveal: each thumbnail a moment after the last
  reveal(delay = 0) {
    return this.thumbs.map((t, k) =>
      t.b.animate([{opacity: 0}, {}], {duration: 360, delay: delay + k * 12, easing: 'ease', fill: 'backwards'}),
    );
  }

  rect(i) {
    return this.thumbs[i].b.getBoundingClientRect();
  }

  src(i) {
    const img = this.thumbs[i].img;
    return img.currentSrc || img.src;
  }

  hold(i, on) {
    this.thumbs[i]?.b.classList.toggle('held', on);
  }
}
