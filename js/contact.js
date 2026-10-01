// The contact panel: one photograph of dxwe, laid out like the frame in the
// middle of the arc (app.css), and under it a strip of tape that leads to
// Instagram. CONTACT opens it the way WORK opens the contact sheet; its
// photograph is fetched and decoded in the background before that, so the
// panel comes in whole.

import {srcset, settle, PHONE} from './media.js';
import {GLIDE, reduced} from './motion.js';

const FILE = 'contact.jpg'; // in /thumb, /mid and /web, like every photograph

export class Contact {
  constructor(el) {
    this.el = el;
    this.frame = el.querySelector('.contact-photo');
    this.img = el.querySelector('img');
    this.strip = el.querySelector('.contact-ig');
    this.ready = null;
    new ResizeObserver(() => this.#size()).observe(this.frame);
  }

  // Offered the size it is shown at — and the big file too once it is wider
  // than a phone's frame (a window made wider), as the arc does.
  #size(start = false) {
    const width = this.frame.offsetWidth, img = this.img;
    if (!width || !(start || this.ready)) return;
    img.sizes = Math.round(width) + 'px';
    if (start || (width > PHONE && !img.srcset.includes('1800w'))) img.srcset = srcset(FILE, width);
  }

  // Fetch and decode the photograph — in the background, or at once
  // (`urgent`). Resolves once it can be shown.
  load(urgent = false) {
    if (urgent) this.img.fetchPriority = 'high';
    if (this.ready) return this.ready;
    this.#size(true);
    this.ready = settle(this.img).then(() => this.img.classList.add('in'));
    return this.ready;
  }

  // The photograph rises a little into its place, and its strip comes after.
  reveal(delay = 0) {
    if (reduced.matches) return [];
    return [
      this.frame.animate([{transform: 'translateY(12px)'}, {transform: 'none'}], {duration: 720, delay, easing: GLIDE, fill: 'backwards'}),
      this.strip.animate([{opacity: 0}, {opacity: 1}], {duration: 420, delay: delay + 220, easing: 'ease', fill: 'backwards'}),
    ];
  }
}
