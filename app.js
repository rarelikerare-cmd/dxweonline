// dxwe — the app.
//
// One page, four places — the landing (/), the sequence (/work), the contact
// sheet (/index) and the contact page (/contact, opened in a tab of its own) —
// and one photograph open (/work/6676). Every place has an address, the back
// button walks between them, and a photograph is carried from one place into
// the next instead of being loaded again.

import {Carousel} from './js/carousel.js';
import {Viewer} from './js/viewer.js';
import {Sheet} from './js/sheet.js';
import {Contact} from './js/contact.js';
import {stampAll, drawn} from './js/tape.js';
import {settle, wait, idle} from './js/media.js';
import {GLIDE, reduced, together, release, onto, fade} from './js/motion.js';

const $ = id => document.getElementById(id);
const html = document.documentElement;
const landing = $('landing');
const ground = landing.querySelector('.landing-ground');
const photo = $('landingPhoto');
const match = $('landingMatch');
const work = $('work');
const carouselEl = $('carousel');
const sheetEl = $('sheet');
const contactEl = $('contact');
const contactLink = $('contactLink');
const masthead = work.querySelector('.masthead');
const bottom = work.querySelector('.bottom');
const labels = [masthead, bottom];
const name = $('enter'); // DXWE on the landing…
const wordmark = $('wordmark'); // …and above the sequence

const boxOf = el => ({left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight});
const place = (el, r) =>
  Object.assign(el.style, {left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px'});

// ---------- the words ----------

// DXWE, WORK and CONTACT, the viewer's counter and buttons, and the landing's
// name: strips of embossing tape (js/tape.js). The letters are drawn, not set
// in a font. The landing's is big, and drawn a slice at a time; it comes in
// once it is there.
stampAll();
Promise.race([drawn(name, true), wait(2500)]).then(() => html.classList.add('name-ready'));

// the landing's name as clear vinyl, and as the black it turns into
const layers = () => [name.querySelector('canvas:not(.tape-over)'), name.querySelector('.tape-over')];

// ---------- the landing photograph ----------

// Its box is the whole picture scaled to cover the screen — not the screen
// itself — so it can travel into a frame without being re-cropped on the way.
const LW = Number(photo.getAttribute('width')), LH = Number(photo.getAttribute('height'));
function cover() {
  const w = landing.clientWidth, h = landing.clientHeight, s = Math.max(w / LW, h / LH);
  place(photo, {left: (w - LW * s) / 2, top: (h - LH * s) / 2, width: LW * s, height: LH * s});
}
new ResizeObserver(cover).observe(landing);
cover();

let landingReady = null;
const loadLanding = () =>
  (landingReady ??= (() => {
    photo.fetchPriority = html.dataset.view === 'landing' ? 'high' : 'low';
    photo.src = '/background/landing.jpg';
    return settle(photo).then(() => photo.classList.add('in'));
  })());
if (html.dataset.view === 'landing') loadLanding();

// ---------- the contact page ----------

// CONTACT opens it in a tab of its own. There its photograph is the first
// thing fetched; anywhere else it is only fetched in the background — a while
// after the sequence's own, or at once when the pointer reaches for CONTACT —
// so that tab finds it on the device.
const contact = new Contact(contactEl);
if (html.dataset.view === 'contact') contact.load(true);
for (const type of ['pointerenter', 'focus']) contactLink.addEventListener(type, () => contact.prefetch(), {once: true});
let prefetching = null;
const prefetchContact = () => (prefetching ??= wait(3000).then(() => idle(() => contact.prefetch())));

// ---------- the sequence ----------

const sequence = await fetch('/sequence.json').then(r => r.json());
const {frames} = sequence;
const indexOf = id => frames.findIndex(f => f.id === id);
// The landing photograph is a print of the first frame, so the way in and out
// can turn one into the other — only while that is so (tools/sequence.mjs).
const continues = frames[0]?.id === sequence.landing?.match;
let held = -1; // the frame whose photograph is open
let remembered = -1;

const carousel = new Carousel(carouselEl, $('arc'), frames, {
  onOpen: i => navigate('/work/' + frames[i].id),
  onSettle: i => remember(i),
});

const viewer = new Viewer($('viewer'), frames, {
  onStep: i => {
    carousel.hold(held, false);
    carousel.hold(i, true);
    held = i;
    carousel.go(i); // the sequence follows behind the glass
    here = {view: 'work', id: frames[i].id};
    history.replaceState({...history.state, frame: i}, '', address(here));
  },
  onDismiss: () => leave(),
});

const sheet = new Sheet(sheetEl, $('sheetGrid'), frames, {onPick: i => navigate('/work', {pick: i})});

// ---------- places and addresses ----------

// Addresses end in a slash: on a static host every place is a folder with its
// own copy of the page. The old site's /work.html still leads to the work.
function parse(path) {
  const p = path.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  if (p === '/') return {view: 'landing'};
  if (p === '/work') return {view: 'work'};
  if (p === '/index') return {view: 'index'};
  if (p === '/contact') return {view: 'contact'};
  const m = p.match(/^\/work\/([a-z0-9-]+)$/i);
  return m && indexOf(m[1].toLowerCase()) >= 0 ? {view: 'work', id: m[1].toLowerCase()} : null;
}
const address = r =>
  r.view === 'landing' ? '/' : r.view === 'index' ? '/index/' : r.view === 'contact' ? '/contact/' : r.id ? `/work/${r.id}/` : '/work/';

let here = {view: null}; // what is on screen
let wanted = null;
let queue = Promise.resolve();

function navigate(path, options = {}) {
  const route = parse(path);
  if (!route || address(route) === location.pathname) return;
  // `app` marks an entry this page pushed: the one before it is ours too
  if (options.replace) history.replaceState({app: history.state?.app}, '', address(route));
  else history.pushState({app: true}, '', address(route));
  arrive(route, options);
}

// Back out of the open photograph or the contact sheet. When the page
// before is ours the real back button is used, so it stays honest; a
// visitor who arrived straight on a photograph lands on the sequence.
function leave() {
  if (history.state?.app) history.back();
  else navigate('/work', {replace: true});
}

addEventListener('popstate', () => arrive(parse(location.pathname) ?? {view: 'landing'}));

// The newest wish wins; a move already under way always finishes first.
function arrive(route, options = {}) {
  wanted = {route, options};
  queue = queue.then(async () => {
    if (!wanted) return;
    const {route: to, options: o} = wanted;
    wanted = null;
    try {
      await travel(here, to, o);
    } catch (error) {
      console.warn('dxwe: move skipped', error);
    }
    here = to;
    if (to.view === 'work' && !to.id) remember(carousel.current());
    if (to.view === 'work' || to.view === 'index') prefetchContact();
  });
}

async function travel(from, to, o) {
  const i = to.id ? indexOf(to.id) : -1;
  if (!from.view) return first(to, i);
  if (viewer.isOpen) {
    if (to.view === 'work' && to.id) return viewer.jump(i); // photograph to photograph, through history
    if (to.view === 'work') return putBack();
    await putBack({quick: true});
  }
  if (from.view !== to.view) {
    if (from.view === 'landing' && to.view === 'work') await enter(Math.max(i, 0));
    else if (from.view === 'work' && to.view === 'landing') await home();
    else if (from.view === 'work' && to.view === 'index') await toSheet();
    else if (from.view === 'index' && to.view === 'work') await fromSheet(o.pick ?? -1);
    else await swap(to.view);
  }
  if (i >= 0) await lift(i);
}

// A first visit lands straight on its place, with a plain fade.
async function first(to, i) {
  html.dataset.view = to.view;
  if (to.view === 'landing') return; // already on screen, arriving on its own
  // the contact page's own photograph first; the sequence's once it is there
  if (to.view === 'contact') contact.load(true).then(() => idle(liven));
  else carousel.live = true;
  const at = i >= 0 ? i : Number.isInteger(history.state?.frame) ? history.state.frame : 0;
  carousel.set(at);
  remembered = at;
  const moves = labels.map(l => fade(l, 0, 1, {duration: 420}));
  if (to.view === 'index') {
    sheet.fill();
    sheet.mark(at);
    moves.push(fade(sheetEl, 0, 1, {duration: 420}));
  } else if (to.view === 'contact') moves.push(fade(contactEl, 0, 1, {duration: 420}), ...contact.reveal());
  else moves.push(fade(carouselEl, 0, 1, {duration: 420}));
  await Promise.all([together(moves).then(() => release(moves)), i >= 0 && lift(i, {plain: true})]);
  idle(loadLanding); // for the way home
}

// While the landing is on screen the sequence is laid out behind it and its
// first frames are fetched and decoded — after the landing's own photograph,
// never competing with it — so entering costs nothing.
let primed = null;
const prime = () =>
  (primed ??= (async () => {
    await Promise.race([loadLanding(), wait(2500)]);
    carousel.live = true;
    carousel.load(carousel.cards[0], true);
    carousel.set(0);
    await Promise.race([carousel.cards[0].ready, wait(4000)]);
  })());

// ---------- landing → sequence: the photograph becomes the first frame,
// the name goes up and becomes the one above it ----------

async function enter(at) {
  await prime();
  carousel.set(carousel.nearest(at, 0));
  if (at !== 0 || !continues || reduced.matches || !photo.classList.contains('in')) return swap('work');
  const card = carousel.cards[0];
  const [, whole] = await Promise.all([Promise.race([card.ready, wait(1500)]), Promise.race([drawn(name).then(() => true), wait(1500)])]);
  const rect = carousel.rect(0), box = boxOf(photo);
  place(match, rect);
  match.src = card.img.currentSrc;
  await Promise.race([settle(match), wait(400)]);

  const D = 1000, there = onto(box, rect), back = onto(rect, box);
  const up = onto(name.getBoundingClientRect(), wordmark.getBoundingClientRect());
  const [clear, dark] = layers(), c0 = Number(getComputedStyle(clear).opacity), d0 = Number(getComputedStyle(dark).opacity);
  html.dataset.view = 'work';
  landing.style.visibility = 'visible'; // it stays up while its photograph travels
  carousel.hold(0, true);
  const moves = [
    photo.animate([{transform: 'none'}, {transform: there}], {duration: D, easing: GLIDE, fill: 'both'}),
    match.animate([{transform: back}, {transform: 'none'}], {duration: D, easing: GLIDE, fill: 'both'}),
    // The landing print gives way to the frame's own scan — black film edge
    // and all — only once it is nearly frame-sized, so that edge never
    // flashes across the whole screen.
    photo.animate([{opacity: 1}, {opacity: 1, offset: .62}, {opacity: 0, offset: .94}, {opacity: 0}], {duration: D, fill: 'both'}),
    match.animate([{opacity: 0}, {opacity: 0, offset: .55}, {opacity: 1, offset: .9}, {opacity: 1}], {duration: D, fill: 'both'}),
    fade(ground, 1, 0, {duration: 320}),
    // meanwhile the name goes up and becomes the one above the sequence: the
    // same strip, clear while it is over the photograph and black once it is
    // over the snow — black already, if the pointer turned it
    name.animate([{transform: 'none'}, {transform: up}], {duration: D, easing: GLIDE, fill: 'both'}),
    name.animate([{opacity: 1}, {opacity: 1, offset: .86}, {opacity: 0}], {duration: D, fill: 'both'}),
    ...(whole ? [
      clear.animate([{opacity: c0}, {opacity: c0, offset: .3}, {opacity: 0, offset: .6}, {opacity: 0}], {duration: D, fill: 'both'}),
      dark.animate([{opacity: d0}, {opacity: d0, offset: .3}, {opacity: 1, offset: .6}, {opacity: 1}], {duration: D, fill: 'both'}),
    ] : []),
    fade(masthead, 0, 1, {duration: 140, delay: D - 140}),
    fade(carouselEl, 0, 1, {duration: 450, delay: 400, easing: GLIDE}),
    fade(bottom, 0, 1, {duration: 350, delay: 560}),
  ];
  await together(moves);
  carousel.hold(0, false);
  landing.style.visibility = '';
  release(moves);
}

// ---------- sequence → landing: the first frame grows back into it, and
// the name comes back down ----------

async function home() {
  const [, whole] = await Promise.all([Promise.race([loadLanding(), wait(1500)]), Promise.race([drawn(name).then(() => true), wait(1500)])]);
  if (carousel.current() !== 0 || !continues || reduced.matches || !photo.classList.contains('in')) return swap('landing');
  carousel.set(carousel.nearest(0));
  const card = carousel.cards[0];
  const rect = carousel.rect(0), box = boxOf(photo);
  place(match, rect);
  match.src = card.img.currentSrc;
  await Promise.race([settle(match), wait(400)]);

  const D = 900, there = onto(box, rect), back = onto(rect, box);
  const up = onto(name.getBoundingClientRect(), wordmark.getBoundingClientRect());
  const [clear, dark] = layers();
  landing.style.visibility = 'visible';
  carousel.hold(0, true);
  const moves = [
    match.animate([{transform: 'none'}, {transform: back}], {duration: D, easing: GLIDE, fill: 'both'}),
    photo.animate([{transform: there}, {transform: 'none'}], {duration: D, easing: GLIDE, fill: 'both'}),
    match.animate([{opacity: 1}, {opacity: 1, offset: .08}, {opacity: 0, offset: .42}, {opacity: 0}], {duration: D, fill: 'both'}),
    photo.animate([{opacity: 0}, {opacity: 0, offset: .05}, {opacity: 1, offset: .38}, {opacity: 1}], {duration: D, fill: 'both'}),
    fade(ground, 0, 1, {duration: 260, delay: D - 280}),
    name.animate([{transform: up}, {transform: 'none'}], {duration: D, easing: GLIDE, fill: 'both'}),
    name.animate([{opacity: 0}, {opacity: 1, offset: .12}, {opacity: 1}], {duration: D, fill: 'both'}),
    ...(whole ? [
      dark.animate([{opacity: 1}, {opacity: 1, offset: .4}, {opacity: 0, offset: .7}, {opacity: 0}], {duration: D, fill: 'both'}),
      clear.animate([{opacity: 0}, {opacity: 0, offset: .4}, {opacity: 1, offset: .7}, {opacity: 1}], {duration: D, fill: 'both'}),
    ] : []),
    fade(masthead, 1, 0, {duration: 120}),
    fade(carouselEl, 1, 0, {duration: 380, easing: GLIDE}),
    fade(bottom, 1, 0, {duration: 200}),
  ];
  await together(moves);
  html.dataset.view = 'landing';
  landing.style.visibility = '';
  carousel.hold(0, false);
  release(moves);
}

// ---------- every other change of place: a plain crossfade ----------

const layerOf = view => (view === 'landing' ? landing : view === 'index' ? sheetEl : view === 'contact' ? contactEl : carouselEl);

// The sequence starts fetching its photographs, nearest first — on the
// contact page only once that page's own photograph is there.
function liven() {
  if (carousel.live) return;
  carousel.live = true;
  carousel.wake();
}

async function swap(view) {
  const from = html.dataset.view;
  if (from === view) return;
  const out = layerOf(from), into = layerOf(view);
  if (view === 'contact') contact.load(true).then(() => idle(liven));
  else if (view !== 'landing') liven();
  if (view === 'index') {
    sheet.fill();
    sheet.mark(carousel.current());
  }
  for (const el of [out, into, work]) el.style.visibility = 'visible';
  html.dataset.view = view;
  const moves = [fade(out, 1, 0, {duration: 320}), fade(into, 0, 1, {duration: 420, delay: 100})];
  if (view === 'contact') moves.push(...contact.reveal(100));
  if (from === 'landing') moves.push(...labels.map(l => fade(l, 0, 1, {duration: 380, delay: 200})));
  if (view === 'landing') moves.push(...labels.map(l => fade(l, 1, 0, {duration: 220})));
  await together(moves);
  for (const el of [out, into, work]) el.style.visibility = '';
  release(moves);
}

// ---------- sequence ↔ contact sheet ----------

async function toSheet() {
  sheet.fill();
  sheet.mark(carousel.current());
  carouselEl.style.visibility = 'visible';
  html.dataset.view = 'index';
  const moves = [fade(carouselEl, 1, 0, {duration: 260}), fade(sheetEl, 0, 1, {duration: 300, delay: 100}), ...sheet.reveal(120)];
  await together(moves);
  carouselEl.style.visibility = '';
  release(moves);
}

// A thumbnail flies to its place on the arc; the sheet dissolves around it.
async function fromSheet(pick) {
  if (pick < 0 || reduced.matches) {
    if (pick >= 0) carousel.set(carousel.nearest(pick));
    return swap('work');
  }
  carousel.set(carousel.nearest(pick));
  const card = carousel.cards[pick];
  carousel.load(card, true);
  const from = sheet.rect(pick);
  const ghost = new Image();
  ghost.className = 'ghost';
  ghost.alt = '';
  ghost.src = sheet.src(pick);
  await Promise.race([settle(ghost), wait(200)]);

  sheetEl.style.visibility = 'visible';
  html.dataset.view = 'work';
  const rect = carousel.rect(pick);
  place(ghost, rect);
  work.append(ghost);
  carousel.hold(pick, true);
  sheet.hold(pick, true);
  const moves = [
    ghost.animate([{transform: onto(rect, from)}, {transform: 'none'}], {duration: 560, easing: GLIDE, fill: 'both'}),
    fade(sheetEl, 1, 0, {duration: 240}),
    fade(carouselEl, 0, 1, {duration: 380, delay: 160}),
  ];
  await together(moves);
  await Promise.race([card.ready, wait(300)]);
  carousel.hold(pick, false);
  sheet.hold(pick, false);
  ghost.remove();
  sheetEl.style.visibility = '';
  release(moves);
}

// ---------- a frame opens, and goes back ----------

async function lift(i, {plain = false} = {}) {
  if (!carousel.isShown(i)) carousel.set(carousel.nearest(i));
  const card = carousel.cards[i];
  const from = plain ? null : carousel.rect(i);
  const src = card.img.complete && card.img.naturalWidth ? card.img.currentSrc : null;
  carousel.go(i); // the sequence brings it to the centre, behind the glass
  carousel.hold(i, true);
  held = i;
  work.inert = true;
  await viewer.open(i, {from, src});
}

async function putBack({quick = false} = {}) {
  const i = viewer.i;
  carousel.set(carousel.nearest(i)); // exactly centred, still behind the glass
  await viewer.close({to: quick ? null : carousel.rect(i)});
  carousel.hold(i, false);
  held = -1;
  work.inert = false;
  remember(i);
}

// The sequence remembers where it was, per history entry: reload, or come
// back from Instagram, and it is still on the same photograph.
function remember(i) {
  if (here.view !== 'work' || viewer.isOpen || i === remembered) return;
  remembered = i;
  history.replaceState({...history.state, frame: i}, '', location.pathname);
}

// ---------- keys and links ----------

addEventListener('keydown', e => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape') {
    if (viewer.isOpen || here.view === 'index') {
      e.preventDefault();
      leave();
    }
    return;
  }
  const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (!d) return;
  if (viewer.isOpen) {
    e.preventDefault();
    viewer.step(d);
  } else if (here.view === 'work' && (!document.activeElement || document.activeElement === document.body)) {
    e.preventDefault();
    carousel.step(d);
  }
});

document.addEventListener('click', e => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  // CONTACT opens the contact page in a tab of its own — not once more from that page
  if (e.target.closest('a') === contactLink && here.view === 'contact') return e.preventDefault();
  const a = e.target.closest('a[data-route]');
  if (!a) return;
  e.preventDefault();
  const to = a.getAttribute('href');
  if (parse(to)?.view === 'index' && here.view === 'index') return leave(); // WORK again: back to the sequence
  if (parse(to)?.view === 'index' && here.view === 'contact') return navigate('/work'); // WORK there: the sequence
  navigate(to);
});

// ---------- keep it on the device ----------

if ('serviceWorker' in navigator && isSecureContext) {
  const register = () => idle(() => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  if (document.readyState === 'complete') register();
  else addEventListener('load', register, {once: true});
}

// ---------- go ----------

const start = parse(location.pathname) ?? (/^\/work\//.test(location.pathname) ? {view: 'work'} : {view: 'landing'});
if (address(start) !== location.pathname) history.replaceState(history.state, '', address(start));
arrive(start);
if (start.view === 'landing') prime();
