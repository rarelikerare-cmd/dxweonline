// Keeps dxwe on the device: a second visit opens instantly, and a photograph
// that has been seen once opens without a network.
//
// Code and data go to the network first, so an edit is live on the next
// load; photographs come from the cache first — a file under the same name
// never changes. (Replace a photograph under the same name — the landing's
// landing.jpg, the contact page's contact.jpg — and bump VERSION.)
//
// Whatever goes into the cache is asked of the server, never taken from the
// browser's own copy: GitHub Pages lets the browser keep a file ten minutes
// without asking, so a new VERSION filled from there could keep the
// photograph it replaces. The server answers "unchanged" cheaply.

const VERSION = 'dxwe-app-11';
const SHELL = [
  '/',
  '/app.css',
  '/lqip.css',
  '/app.js',
  '/js/carousel.js',
  '/js/viewer.js',
  '/js/sheet.js',
  '/js/contact.js',
  '/js/media.js',
  '/js/motion.js',
  '/js/tape.js',
  '/js/tape-model.js',
  '/js/tape-worker.js',
  '/sequence.json',
  '/site.webmanifest',
];
const asked = {cache: 'no-cache'}; // revalidated with the server, every time

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(SHELL.map(url => new Request(url, asked))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const {origin, pathname, hostname} = new URL(request.url);
  if (request.mode === 'navigate') {
    // every address is the same page
    event.respondWith(fresh(request, '/'));
  } else if (origin === location.origin && /^\/(web|mid|thumb|background|icons)\//.test(pathname)) {
    event.respondWith(kept(request));
  } else if (origin === location.origin) {
    event.respondWith(fresh(request));
  } else if (/^fonts\.(googleapis|gstatic)\.com$/.test(hostname)) {
    event.respondWith(kept(request));
  }
});

async function kept(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request, asked);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function fresh(request, key = request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request, asked);
    if (response.ok) cache.put(key, response.clone());
    return response;
  } catch {
    return (await cache.match(key)) || Response.error();
  }
}
