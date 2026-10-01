// A helper that draws strips of tape away from the page. js/tape.js hands it
// one strip at a time — a word, its tilt, its size on screen, the screen's
// density, its vinyl — and gets the pixels back: the same model, the same
// pixels, only not on the page's own thread, so nothing on the page waits
// while a strip is lit. Each helper keeps to one kind of strip (the clear
// one, or the black ones), so it is quick from its first.
//
// What it has drawn it keeps on the device, so a second visit reads the
// strip back instead of lighting it again — under the model's name, so a
// strip drawn by an earlier model is never shown for a later one.

import {MODEL, plan, paint} from './tape-model.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// the same word and tilt is the same strip, whatever its vinyl or size: its
// wear is worked out once
const plans = new Map();
const planOf = (word, tilt) => {
  const key = word + '|' + tilt;
  if (!plans.has(key)) plans.set(key, plan(word, tilt ?? undefined));
  return plans.get(key);
};

// ---------- the strips kept on the device ----------

// In the lab the model is not stamped with its hash: take it from the file.
const fnv = text => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
const version = MODEL !== 'lab'
  ? Promise.resolve(MODEL)
  : fetch(new URL('./tape-model.js', import.meta.url), {cache: 'no-store'}).then(r => (r.ok ? r.text() : Promise.reject())).then(fnv).catch(() => null);

const KEEP = 24 << 20; // at most this much of them, the most recently used
const request = r => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const store = new Promise(resolve => {
  try {
    const open = indexedDB.open('dxwe-tape', 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('strips'); // key → {width, height, data, packed}
      open.result.createObjectStore('seen'); // key → {at, bytes}
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = open.onblocked = () => resolve(null);
  } catch {
    resolve(null);
  }
});

// deflated, a strip takes a quarter of the room — and comes back exactly
const packs = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
const through = (buffer, stream) => new Response(new Blob([buffer]).stream().pipeThrough(stream)).arrayBuffer();

async function recall(key) {
  const db = await store;
  if (!db) return null;
  const tx = db.transaction(['strips', 'seen'], 'readwrite');
  const hit = await request(tx.objectStore('strips').get(key));
  if (!hit) return null;
  tx.objectStore('seen').put({at: Date.now(), bytes: hit.data.byteLength}, key);
  const pixels = hit.packed ? await through(hit.data, new DecompressionStream('deflate')) : hit.data;
  return pixels.byteLength === hit.width * hit.height * 4 ? {width: hit.width, height: hit.height, pixels} : null;
}

async function keep(key, width, height, pixels) {
  const db = await store;
  if (!db) return;
  const data = packs ? await through(pixels, new CompressionStream('deflate')) : pixels;
  const tx = db.transaction(['strips', 'seen'], 'readwrite');
  tx.objectStore('strips').put({width, height, data, packed: packs}, key);
  tx.objectStore('seen').put({at: Date.now(), bytes: data.byteLength}, key);
  await new Promise(resolve => (tx.oncomplete = tx.onabort = tx.onerror = resolve));
  tidy(db, await version);
}

// Drop what an earlier model drew, and past the room kept, what was used
// least recently.
async function tidy(db, v) {
  const tx = db.transaction(['strips', 'seen'], 'readwrite'), seen = tx.objectStore('seen');
  const [keys, values] = await Promise.all([request(seen.getAllKeys()), request(seen.getAll())]);
  const all = keys.map((key, i) => ({key, ...values[i]})).sort((a, b) => b.at - a.at);
  let total = 0;
  for (const e of all) {
    const current = String(e.key).startsWith(v + '|');
    if (current) total += e.bytes;
    if (!current || total > KEEP) {
      tx.objectStore('strips').delete(e.key);
      seen.delete(e.key);
    }
  }
}

// ---------- one strip ----------

onmessage = async ({data: job}) => {
  const {id, word, tilt, cssH, dpr, vinyl} = job;
  try {
    const v = await version;
    const key = v && `${v}|${word}|${tilt}|${cssH}|${dpr}|${vinyl}`;
    // a store that is slow to answer is not waited for: the strip is drawn
    const hit = key && (await Promise.race([recall(key).catch(() => null), wait(400).then(() => null)]));
    if (hit) return postMessage({id, ...hit}, [hit.pixels]);
    const out = paint(planOf(word, tilt), cssH, dpr, vinyl);
    const pixels = out.image.data.buffer, copy = key ? pixels.slice(0) : null;
    postMessage({id, width: out.width, height: out.height, pixels}, [pixels]);
    if (copy) keep(key, out.width, out.height, copy).catch(() => {});
  } catch (error) {
    postMessage({id, error: String(error)});
  }
};
