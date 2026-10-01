// The lettering: embossing tape.
//
// Every word around the photographs is a strip of black Dymo tape stuck on
// the page. It is not a font and not a filter effect: each strip is modelled
// in millimetres and lit —
//
//   · every letter punched up out of the vinyl as a rounded ridge, whitened
//     where the plastic stretched most (the walls), greyer on its domed top
//     and lighter again along the ridge; a grey halo where the strip was
//     pulled up around it, while what it closes in — inside an O, a D, an
//     8 — stays the strip's own black; no two pressed alike, none sitting
//     exactly on the line, no edge quite clean;
//   · the little cell each punch pulls up in the strip, and the seams
//     between the cells;
//   · the curl the strip keeps from the machine, so its ends stand off the
//     page a little and their shadow widens;
//   · cut ends that are never quite square, blank tape before the first
//     letter longer than after the last, a speck of dust;
//   · one soft light from the top left, the gloss of the vinyl reflecting a
//     big soft source, the small shadow every letter throws on the strip,
//     the shadow the strip throws on the page —
//
// and lit once, at the screen's own resolution, into pixels. No strip is
// stuck on straight; the same word always comes out the same.
//
// This is the strip alone, with nothing of the page in it, so that it can be
// drawn away from the page (js/tape-worker.js) as well as on it; js/tape.js
// puts the strips on the page.
//
// "white" is the same strip the other way round: white tape, its letters
// inked black. "black" is the black strip after the same wear the white one
// has been through, "glass" a clear one; no vinyl, the plain black strip.

// The strips a device has drawn are kept on it under this name (see
// js/tape-worker.js). The live build writes this file's own hash here, so a
// change to how a strip looks is never covered up by one drawn before it.
export const MODEL = '9879c9eef751';

// ---------- the tape, in millimetres ----------

export const TAPE = 9.5; // the strip's width: the label's height on screen
const CAP = 3.1; // letter height on the die's centre line: walls and all, a letter is 0.4 of the strip
const STROKE = 0.5; // the die's stroke, half way up the wall
const RELIEF = 0.28; // how far a letter stands up out of the strip…
const DOME = 0.2; // …of which the rounded top of its stroke
const PITCH = 5.2; // one step of the wheel: every letter takes the same
const LEAD = 3.4; // blank strip before the first letter's cell…
const TAIL = 2.1; // …and after the last one's
const THICK = 0.1; // the vinyl, lying on the page
const MARGIN = 2.2; // room around the strip for its tilt and its shadow

// ---------- the light ----------

const unit = ([x, y, z]) => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};
const KEY = unit([-0.52, -0.56, 0.64]); // a window at the top left, ~40° up
const KEY_I = 1.9;
const AMBIENT = 0.7; // the room
// What the gloss reflects: the sky through that window, a big soft shape a
// little off overhead. The eye is a hand's length above the strip, so along
// its length the strip sees the sky at slightly different angles, and
// catches it on part of it only.
const SKY = unit([-0.22, -0.28, 0.93]);
const SKY_I = 1.4;
const SKY_EDGE = [Math.cos(0.37), Math.cos(0.2)]; // its soft edge, as cosines
const SKY_TINT = [0.8, 0.9, 1.1];
const EYE = 160; // mm
const F0 = 0.045; // how much of the light vinyl reflects straight on
const VINYL = [0.0052, 0.0058, 0.0068]; // black tape (linear)
const WHITE = [0.66, 0.73, 0.8]; // stretched, whitened vinyl, a little cool under the sky

// The white strip: where the black one whitens, it is inked. Its grey halo
// takes as much ink as the black strip looks lighter there, so it reads the
// same the other way round; the letter itself is inked through, so it reads
// black, and only the light on it shows its shape.
const PAPER = [0.66, 0.66, 0.64]; // white tape (linear), not brand new…
const INK = [0.011, 0.011, 0.012]; // …and its letters
const INKED = new Float32Array(257);
{
  const y = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const lin = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const srgb = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  const light = w => 1 - srgb((y(VINYL) + (y(WHITE) - y(VINYL)) * w) / y(WHITE));
  for (let i = 0; i <= 256; i++) {
    const w = i / 256, t = Math.min(1, Math.max(0, (w - 0.12) / 0.14));
    INKED[i] = Math.max(1 - lin(light(w)) / lin(light(0)), t * t * (3 - 2 * t));
  }
}

// The worn black strip. What wears black vinyl shows the other way round
// from white: dust and grime grey it a little, scratches and grit are light,
// and where it was handled it is duller. Black is where the eye sees most,
// so a little goes a long way.
const DUST = [0.3, 0.29, 0.27]; // what collects on black vinyl (linear)
const FILM = 0.05; // how much of it the slow grime shows…
const GRIT = 0.35; // …and the scratches and specks
const HAZE = 0.35; // where it is dull, what it reflects of the sky, spread out

// The clear strip — the landing's name at rest, in glass. What is under it
// shows through, a little dimmed; over that lies what the vinyl scatters
// where it is whitened (its letters, a torn end, a scratch) and what its
// gloss reflects. Its cut edge is a line of light with a darker one just
// inside, as a pane of glass has, and round it is a faint glow, as round the
// glass word it stands in for. It has the black strip's wear, so the two are
// one strip: one clear, one black.
const FROST = 0.72; // how opaque whitened clear vinyl is…
const FROST_ALBEDO = 0.7; // …and how light
const TINT = 0.05; // what the clear vinyl takes of the light through it
const RIM = 0.45, RIM_W = 0.07; // its lit edge, and how wide (mm)
const EDGE_DARK = 0.18; // the darker line inside it
const GLOW = 0.16, GLOW_R = 0.5; // the glow round it, and how far it reaches (mm)

// ---------- the wheel ----------

// every character: the width of its centre-line box (letter height = 100),
// and the path of the die
const LETTERS = {
  A: [74, 'M0 100L37 0L74 100M13.3 64H60.7'],
  B: [70, 'M0 100V0H46A20 20 0 0 1 66 20V26A20 20 0 0 1 46 46H0M0 46H48A22 22 0 0 1 70 68V78A22 22 0 0 1 48 100H0'],
  C: [78, 'M78 24A24 24 0 0 0 54 0H24A24 24 0 0 0 0 24V76A24 24 0 0 0 24 100H54A24 24 0 0 0 78 76'],
  D: [74, 'M0 0V100H46A28 28 0 0 0 74 72V28A28 28 0 0 0 46 0Z'],
  E: [60, 'M60 0H0V100H60M0 50H52'],
  F: [60, 'M60 0H0V100M0 50H52'],
  G: [78, 'M78 24A24 24 0 0 0 54 0H24A24 24 0 0 0 0 24V76A24 24 0 0 0 24 100H54A24 24 0 0 0 78 76V54H44'],
  H: [70, 'M0 0V100M70 0V100M0 50H70'],
  I: [0, 'M0 0V100'],
  J: [60, 'M60 0V76A24 24 0 0 1 36 100H24A24 24 0 0 1 0 76V70'],
  K: [70, 'M0 0V100M68 0L0 62M24.1 40L72 100'],
  L: [58, 'M0 0V100H58'],
  M: [84, 'M0 100V0L42 66L84 0V100'],
  N: [70, 'M0 100V0L70 100V0'],
  O: [78, 'M24 0H54A24 24 0 0 1 78 24V76A24 24 0 0 1 54 100H24A24 24 0 0 1 0 76V24A24 24 0 0 1 24 0Z'],
  P: [68, 'M0 100V0H46A22 22 0 0 1 68 22V30A22 22 0 0 1 46 52H0'],
  Q: [78, 'M24 0H54A24 24 0 0 1 78 24V76A24 24 0 0 1 54 100H24A24 24 0 0 1 0 76V24A24 24 0 0 1 24 0ZM52 74L82 104'],
  R: [70, 'M0 100V0H46A21 21 0 0 1 67 21V29A21 21 0 0 1 46 50H0M38 50L70 100'],
  S: [72, 'M72 20C72 8 64 0 50 0H24C10 0 0 9 0 22C0 36 10 46 24 46H48C62 46 72 55 72 72V76C72 90 62 100 48 100H22C8 100 0 91 0 80'],
  T: [70, 'M0 0H70M35 0V100'],
  U: [72, 'M0 0V76A24 24 0 0 0 24 100H48A24 24 0 0 0 72 76V0'],
  V: [74, 'M0 0L37 100L74 0'],
  W: [90, 'M0 0L20 100L45 18L70 100L90 0'],
  X: [70, 'M0 0L70 100M70 0L0 100'],
  Y: [72, 'M0 0L36 52L72 0M36 52V100'],
  Z: [66, 'M2 0H66L0 100H66'],
  0: [62, 'M22 0H40A22 22 0 0 1 62 22V78A22 22 0 0 1 40 100H22A22 22 0 0 1 0 78V22A22 22 0 0 1 22 0Z'],
  1: [40, 'M4 22L30 0V100'],
  2: [64, 'M2 24C2 10 12 0 28 0H36C52 0 62 10 62 25C62 38 55 46 42 54L0 100H64'],
  3: [62, 'M2 12C6 4 14 0 26 0H36C50 0 60 9 60 23C60 37 50 46 36 46H24M36 46C52 46 62 56 62 72C62 89 51 100 36 100H26C14 100 5 95 0 86'],
  4: [66, 'M48 100V0L0 68H66'],
  5: [62, 'M58 0H8L4 44C12 40 20 38 30 38H36C52 38 62 50 62 68C62 88 50 100 34 100H26C14 100 5 95 0 86'],
  6: [64, 'M58 8C53 3 45 0 36 0H30C12 0 0 16 0 42V70C0 88 12 100 30 100H34C52 100 64 88 64 70C64 52 52 40 34 40H30C16 40 4 47 0 58'],
  7: [62, 'M0 0H62L20 100'],
  8: [62, 'M28 0H34C48 0 57 9 57 22C57 36 48 46 34 46H28C14 46 5 36 5 22C5 9 14 0 28 0ZM26 46H36C51 46 62 56 62 72C62 89 51 100 36 100H26C11 100 0 89 0 72C0 56 11 46 26 46Z'],
  9: [64, 'M6 92C11 97 19 100 28 100H34C52 100 64 84 64 58V30C64 12 52 0 34 0H30C12 0 0 12 0 30C0 48 12 60 30 60H34C48 60 60 53 64 42'],
  '/': [48, 'M48 -2L0 102'],
  '×': [56, 'M0 22L56 78M56 22L0 78'],
  '←': [80, 'M80 50H6M34 18L2 50L34 82'],
  '→': [80, 'M0 50H74M46 18L78 50L46 82'],
  '-': [40, 'M0 54H40'],
  '+': [58, 'M29 22V78M0 50H58'],
  '.': [0, 'M0 100h.01'],
  ',': [8, 'M7 96L0 116'],
  ':': [0, 'M0 36h.01M0 100h.01'],
  "'": [0, 'M0 0V24'],
  '!': [0, 'M0 0V66M0 100h.01'],
  '?': [58, 'M2 20C4 7 14 0 28 0C46 0 58 10 58 24C58 38 48 44 38 50C32 54 29 58 29 66M29 100h.01'],
  '#': [66, 'M20 6L14 94M50 6L44 94M4 34H66M0 66H62'],
  _: [70, 'M0 114H70'],
};

// ---------- the dies ----------

// A die is its character's centre line, as straight pieces and quarter
// circles in its own units (letter height 100). The letter is everything
// within half a stroke of that line, so its walls are exact at any size.
// What it closes in is found once per character, on a grid in those units.
const U = CAP / 100; // millimetres per unit
const HW = STROKE / 2 / U; // half the stroke, in units
const ROOM = HW + 1.15 / U; // around a letter, as far as its halo and the pull on the strip reach
const dies = new Map();

function die(ch) {
  if (dies.has(ch)) return dies.get(ch);
  const lines = [], arcs = [];
  const tokens = LETTERS[ch][1].match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)/g);
  let i = 0, cmd = '', x = 0, y = 0, x0 = 0, y0 = 0;
  const num = () => Number(tokens[i++]);
  const line = (nx, ny) => {
    const dx = nx - x, dy = ny - y;
    lines.push(x, y, dx, dy, dx * dx + dy * dy || 1);
    x = nx;
    y = ny;
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === 'M') {
      x = x0 = num();
      y = y0 = num();
      cmd = 'L';
    } else if (cmd === 'L') line(num(), num());
    else if (cmd === 'H') line(num(), y);
    else if (cmd === 'V') line(x, num());
    else if (cmd === 'h') line(x + num(), y);
    else if (cmd === 'Z') {
      line(x0, y0);
      cmd = '';
    } else if (cmd === 'C') {
      const [ax, ay, bx, by, ex, ey] = [num(), num(), num(), num(), num(), num()];
      const sx = x, sy = y;
      for (let k = 1; k <= 24; k++) {
        const t = k / 24, r = 1 - t;
        line(r * r * r * sx + 3 * r * r * t * ax + 3 * r * t * t * bx + t * t * t * ex,
          r * r * r * sy + 3 * r * r * t * ay + 3 * r * t * t * by + t * t * t * ey);
      }
    } else if (cmd === 'A') {
      let r = num();
      i += 2; // the other radius and the turn: every arc here is part of a circle
      const large = num(), sweep = num(), ex = num(), ey = num();
      const hx = (x - ex) / 2, hy = (y - ey) / 2;
      r = Math.max(r, Math.hypot(hx, hy));
      const q = Math.sqrt(Math.max(0, (r * r - hx * hx - hy * hy) / (hx * hx + hy * hy))) * (large === sweep ? -1 : 1);
      const cx = q * hy + (x + ex) / 2, cy = -q * hx + (y + ey) / 2;
      const a0 = Math.atan2(y - cy, x - cx);
      let da = Math.atan2(ey - cy, ex - cx) - a0;
      if (sweep && da < 0) da += 2 * Math.PI;
      if (!sweep && da > 0) da -= 2 * Math.PI;
      const m = Math.max(1, Math.ceil(Math.abs(da) / (Math.PI / 2) - 1e-6)); // a quarter at most each
      for (let k = 0; k < m; k++) {
        const b0 = a0 + (da * k) / m, b1 = a0 + (da * (k + 1)) / m;
        arcs.push(cx, cy, r, Math.cos(b0), Math.sin(b0), Math.cos(b1), Math.sin(b1), Math.sign(da));
      }
      x = ex;
      y = ey;
    } else i++;
  }
  const d = {lines: Float64Array.from(lines), arcs: Float64Array.from(arcs)};

  // its extent, in units
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  const take = (px, py) => {
    minx = Math.min(minx, px);
    miny = Math.min(miny, py);
    maxx = Math.max(maxx, px);
    maxy = Math.max(maxy, py);
  };
  for (let o = 0; o < lines.length; o += 5) take(lines[o], lines[o + 1]), take(lines[o] + lines[o + 2], lines[o + 1] + lines[o + 3]);
  for (let o = 0; o < arcs.length; o += 8) take(arcs[o] - arcs[o + 2], arcs[o + 1] - arcs[o + 2]), take(arcs[o] + arcs[o + 2], arcs[o + 1] + arcs[o + 2]);
  d.box = [minx - ROOM, miny - ROOM, maxx + ROOM, maxy + ROOM];

  // What a letter closes in — the inside of an O, a D, an 8 — stays the
  // strip's own black: the vinyl there is hardly stretched, so the grey halo
  // around the letter barely reaches in. It is whatever the open strip
  // cannot reach, softened into the walls.
  const gx0 = Math.floor(minx - HW - 4), gy0 = Math.floor(miny - HW - 4);
  const gw = Math.ceil(maxx + HW + 4) - gx0 + 1, gh = Math.ceil(maxy + HW + 4) - gy0 + 1, n = gw * gh;
  const solid = new Uint8Array(n), open = new Uint8Array(n), todo = [];
  for (let j = 0; j < gh; j++) for (let k = 0; k < gw; k++) solid[j * gw + k] = reach(d, gx0 + k, gy0 + j) < HW ? 1 : 0;
  const walk = o => {
    if (!open[o] && !solid[o]) {
      open[o] = 1;
      todo.push(o);
    }
  };
  for (let k = 0; k < gw; k++) walk(k), walk(n - gw + k);
  for (let j = 0; j < gh; j++) walk(j * gw), walk(j * gw + gw - 1);
  while (todo.length) {
    const o = todo.pop(), k = o % gw;
    if (k > 0) walk(o - 1);
    if (k < gw - 1) walk(o + 1);
    if (o >= gw) walk(o - gw);
    if (o < n - gw) walk(o + gw);
  }
  let c = new Float32Array(n);
  for (let o = 0; o < n; o++) c[o] = solid[o] || open[o] ? 0 : 1;
  c = blur(blur(c, gw, gh, 2), gw, gh, 2);
  Object.assign(d, {c, gx0, gy0, gw, gh});
  dies.set(ch, d);
  return d;
}

// how far a point is from a die's centre line, in units
function reach(d, gx, gy) {
  const L = d.lines, A = d.arcs;
  let m = 1e18;
  for (let o = 0; o < L.length; o += 5) {
    const px = gx - L[o], py = gy - L[o + 1];
    let t = (px * L[o + 2] + py * L[o + 3]) / L[o + 4];
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = px - t * L[o + 2], ey = py - t * L[o + 3], e = ex * ex + ey * ey;
    if (e < m) m = e;
  }
  m = Math.sqrt(m);
  for (let o = 0; o < A.length; o += 8) {
    const px = gx - A[o], py = gy - A[o + 1], r = A[o + 2], s = A[o + 7];
    const ux = A[o + 3], uy = A[o + 4], vx = A[o + 5], vy = A[o + 6];
    const e = s * (ux * py - uy * px) >= 0 && s * (px * vy - py * vx) >= 0
      ? Math.abs(Math.hypot(px, py) - r)
      : Math.min(Math.hypot(px - r * ux, py - r * uy), Math.hypot(px - r * vx, py - r * vy));
    if (e < m) m = e;
  }
  return m;
}

// how much of what a die closes in a point is, 0…1
function closed(d, gx, gy) {
  const u = gx - d.gx0, v = gy - d.gy0, i = Math.floor(u), j = Math.floor(v);
  if (i < 0 || j < 0 || i >= d.gw - 1 || j >= d.gh - 1) return 0;
  const fu = u - i, fv = v - j, o = j * d.gw + i, c = d.c;
  return (c[o] * (1 - fu) + c[o + 1] * fu) * (1 - fv) + (c[o + d.gw] * (1 - fu) + c[o + d.gw + 1] * fu) * fv;
}

// ---------- chance, the same every time ----------

const hash = s => [...s].reduce((h, c) => Math.imul(h ^ c.codePointAt(0), 16777619), 2166136261);
const random = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// How long a word's strip is (mm): all the page needs to lay a label out
// before it has been drawn. The same first two chances plan() takes.
export function span(word) {
  const rnd = random(hash(word));
  const lead = LEAD + (rnd() - 0.5) * 0.6;
  const tail = TAIL + (rnd() - 0.5) * 0.5;
  return lead + [...word].length * PITCH + tail;
}

// Where every letter goes and how hard it was pressed; how the strip was
// cut, how it curls, where the dust is. Everything a label is, before light.
export function plan(word, tilt) {
  const rnd = random(hash(word));
  const chars = [...word];
  const n = chars.length;
  const lead = LEAD + (rnd() - 0.5) * 0.6;
  const tail = TAIL + (rnd() - 0.5) * 0.5;
  const length = lead + n * PITCH + tail;
  const press = new Float32Array(n);
  const puck = new Float32Array(n);
  const letters = [];
  chars.forEach((ch, i) => {
    const [a, b, c, d, e, f] = [rnd(), rnd(), rnd(), rnd(), rnd(), rnd()];
    press[i] = 0.86 + a * 0.18 - (b < 0.1 ? 0.12 : 0); // now and then one is pressed lightly
    puck[i] = 0.6 + c * 0.8;
    const g = LETTERS[ch];
    if (!g) return;
    const w = g[0], rot = ((f - 0.5) * 2.6 * Math.PI) / 180;
    const l = {
      die: die(ch),
      w,
      // its middle on the strip — the wheel never sits exactly on the line —
      // and its turn
      cx: lead + i * PITCH + PITCH / 2 + (d - 0.5) * 0.1,
      cy: TAPE / 2 + (e - 0.5) * 0.24,
      cos: Math.cos(rot),
      sin: Math.sin(rot),
      hw: (STROKE / 2) * (0.96 + a * 0.08), // and how bold it came out
    };
    // the part of the strip it can touch
    const [a0, b0, a1, b1] = l.die.box, box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [gx, gy] of [[a0, b0], [a1, b0], [a0, b1], [a1, b1]]) {
      const vx = (gx - w / 2) * U, vy = (gy - 50) * U;
      const px = l.cx + l.cos * vx - l.sin * vy, py = l.cy + l.sin * vx + l.cos * vy;
      box[0] = Math.min(box[0], px);
      box[1] = Math.min(box[1], py);
      box[2] = Math.max(box[2], px);
      box[3] = Math.max(box[3], py);
    }
    l.box = box;
    letters.push(l);
  });
  const cut = [rnd() * 0.3, rnd() * 0.3, rnd() * 0.3, rnd() * 0.3]; // never quite square
  // a long strip keeps more of the machine's curve than a short piece
  const springy = Math.min(1, (length / 28) ** 1.5);
  let liftL = (0.05 + rnd() * 0.3) * springy, liftR = (0.05 + rnd() * 0.3) * springy;
  if (rnd() < 0.5) liftL *= 1.5;
  else liftR *= 1.5; // one end always stands off a little more
  const dust = Array.from({length: 2 + Math.floor(rnd() * 4)}, () => ({
    x: 0.6 + rnd() * (length - 1.2),
    y: 0.6 + rnd() * (TAPE - 1.2),
    r: 0.02 + rnd() * 0.04,
    a: 0.25 + rnd() * 0.4,
  }));
  // the cut ends as outward edge normals, for the strip's outline
  const [ta, tb, tc, td] = cut;
  const ll = Math.hypot(tb - ta, TAPE), rl = Math.hypot(tc - td, TAPE);
  return {
    word, n, lead, length, press, puck, letters, cut, dust,
    tilt: tilt ?? (rnd() - 0.5) * 3,
    liftL, liftR,
    curlLen: Math.min(7, length * 0.3),
    seed: Math.floor(rnd() * 1e6),
    edgeL: [-TAPE / ll, (tb - ta) / ll, ta],
    edgeR: [TAPE / rl, -(tc - td) / rl, length - tc],
  };
}

// ---------- the model ----------

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// signed distance to the strip's outline, negative inside
function outline(p, x, y) {
  const [lx, ly, la] = p.edgeL, [rx, ry, ra] = p.edgeR;
  return Math.max(-y, y - TAPE, lx * (x - la) + ly * y, rx * (x - ra) + ry * y);
}

// how far the strip stands off the page along its length: it keeps the
// curve it came out of the machine with, so its ends lift
function curl(p, x) {
  const a = Math.max(0, 1 - x / p.curlLen), b = Math.max(0, 1 - (p.length - x) / p.curlLen);
  return p.liftL * a * a + p.liftR * b * b;
}

// value noise, for the vinyl's surface
const lattice = (x, y, s) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function noise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi;
  const a = lattice(xi, yi, s), b = lattice(xi + 1, yi, s), c = lattice(xi, yi + 1, s), d = lattice(xi + 1, yi + 1, s);
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return (a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv) * 2 - 1;
}

// box blur by running sums: the occlusion around the letters, and the
// softened insides of the dies
function blur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / (2 * r + 1);
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * r + 1);
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

// ---------- wear ----------

// The white strip has been about a while. Not one white but an uneven one,
// warmer where it was held; grime along its edges and in the seams, and a
// little at the letters' feet; hairline scratches and a scuff or two, now
// and then a fingertip's smudge, dust; its ends torn rather than cut, its
// edges and corners worn. All of it on the vinyl and none of it on the ink,
// so the letters stay as black as they were. Worked out once per strip, in
// millimetres: the same at every size.
//
// How much of it there is, in how dark it looks: white is where the eye (and
// the curve to the screen) sees least, so even a light film of grime takes a
// good fraction toward it.
const GRIME = [0.06, 0.052, 0.042]; // what collects on white vinyl (linear)
const WEAR = 8; // cells per millimetre for its slow part: blotches, age, patches
const BIN = 2; // mm: scratches and specks are looked up by where they are along the strip

function wear(p) {
  const rnd = random(p.seed ^ 0x5bd1e995), L = p.length, seed = p.seed + 101;
  // a short piece — a button's — has been handled all over, not only at its
  // ends, and carries only its share of the scratches and the dust
  const hand = Math.min(5, L * 0.3), short = Math.min(1, L / 20);
  const gw = Math.ceil(L * WEAR) + 3, gh = Math.ceil(TAPE * WEAR) + 3;
  const slow = new Float32Array(gw * gh * 3); // per cell: grime, age, patchiness
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const x = (i - 1) / WEAR, y = (j - 1) / WEAR, o = (j * gw + i) * 3;
      const a = 0.5 * noise(x / 4.5, y / 4.5, seed) + 0.32 * noise(x / 1.8, y / 1.8, seed + 1) + 0.18 * noise(x / 0.8, y / 0.8, seed + 2);
      const held = Math.max(0, 1 - Math.min(x, L - x) / hand); // the ends, where the fingers go
      const blot = Math.min(1, Math.max(0, 0.5 + 0.9 * a)); // stains, where the slow noise runs high
      const rub = Math.max(0, noise(x / 2.5, y / 0.35, seed + 9)); // and faint streaks where it was rubbed
      slow[o] = 0.4 * blot * blot + 0.1 * rub + 0.22 * held * held * (0.7 + 0.3 * noise(x / 1.1, y / 1.1, seed + 3));
      slow[o + 1] = Math.min(1, Math.max(0, 0.4 + 0.45 * a + 0.5 * held));
      slow[o + 2] = 0.5 + 0.5 * noise(x / 0.55, y / 0.55, seed + 4);
    }
  }
  const bounds = (xs, ys, m) => [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m];

  // hairline scratches, mostly along the strip, now and then a scuff: each
  // three straight pieces of a gentle curve
  const marks = [];
  const r0 = rnd();
  for (let n = Math.round(Math.min(5 + L * 0.25 + r0 * 5, L * 0.55 + r0 * 2)); n > 0; n--) {
    const scuff = rnd() < 0.3;
    const ang = rnd() < 0.8 ? (rnd() - 0.5) * 0.5 : rnd() * Math.PI;
    const len = 0.4 + rnd() ** 2 * 3.6, bend = (rnd() - 0.5) * 0.25 * len;
    const ux = Math.cos(ang), uy = Math.sin(ang), x0 = rnd() * L, y0 = 0.25 + rnd() * (TAPE - 0.5);
    const pts = new Float64Array(8);
    for (let q = 0; q < 4; q++) {
      const t = q / 3, b = bend * 4 * t * (1 - t);
      pts[q * 2] = x0 + ux * len * t - uy * b;
      pts[q * 2 + 1] = y0 + uy * len * t + ux * b;
    }
    const hw = scuff ? 0.012 + rnd() * 0.016 : 0.005 + rnd() * 0.006;
    marks.push({pts, hw, a: scuff ? 0.45 + rnd() * 0.25 : 0.25 + rnd() * 0.2, box: bounds([pts[0], pts[2], pts[4], pts[6]], [pts[1], pts[3], pts[5], pts[7]], hw + 0.12)});
  }
  // dust and grit: most of it tiny, some of it longish
  const r1 = rnd();
  for (let n = Math.round(Math.min(4 + L * 0.15 + r1 * 4, L * 0.38 + r1 * 1.5)); n > 0; n--) {
    const r = 0.018 + rnd() ** 2.2 * 0.085, rx = r * (1 + rnd() ** 2 * 1.8), ang = rnd() * Math.PI;
    const x = rnd() * L, y = 0.2 + rnd() * (TAPE - 0.4), m = Math.max(rx * 1.4, 0.12);
    marks.push({x, y, rx, ry: r, c: Math.cos(ang), s: Math.sin(ang), a: 0.55 + rnd() * 0.35, box: [x - m, y - m, x + m, y + m]});
  }
  // a fingertip's smudge, most often near an end: its ridges ~0.47 mm apart,
  // slow enough to go into the grid with the rest
  for (let n = rnd() < 0.35 ? 0 : rnd() < 0.7 ? 1 : 2; n > 0; n--) {
    const mx = rnd() < 0.65 ? (rnd() < 0.5 ? rnd() * hand : L - rnd() * hand) : rnd() * L;
    const ma = (2.4 + rnd() * 2.4) * short, mb = (1.6 + rnd() * 1.6) * short, ang = rnd() * Math.PI, my = rnd() * TAPE, mk = 0.1 + rnd() * 0.08;
    const c = Math.cos(ang), sn = Math.sin(ang);
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const x = (i - 1) / WEAR, y = (j - 1) / WEAR, ux = x - mx, uy = y - my;
        const a = c * ux + sn * uy, b = c * uy - sn * ux, r2 = (a / ma) ** 2 + (b / mb) ** 2;
        if (r2 > 2.6) continue;
        const ridge = 0.5 + 0.5 * Math.sin((Math.sqrt(a * a + ((b * ma) / mb) ** 2) / 0.47) * 2 * Math.PI + 3 * noise(x / 0.9, y / 0.9, seed + 7));
        slow[(j * gw + i) * 3] += mk * Math.exp(-2.2 * r2) * (0.45 + 0.55 * ridge);
      }
    }
  }
  const bins = Array.from({length: Math.ceil(L / BIN) + 1}, () => []);
  for (const f of marks) {
    for (let q = Math.max(0, Math.floor(f.box[0] / BIN)); q <= Math.min(bins.length - 1, Math.floor(f.box[2] / BIN)); q++) bins[q].push(f);
  }

  // Its outline. The ends torn rather than cut: across at a slant, ragged at
  // three scales, a tooth or two. The long edges worn: a slow wander, a fine
  // raggedness, a few chips out of them. The corners worn round, each its
  // own. All kept as offsets in from the clean strip — every 0.05 mm along
  // the edges, 0.03 mm across the ends — with their slopes.
  const top = new Float32Array(Math.ceil((L + 2) / 0.05) + 2), bottom = new Float32Array(top.length);
  const left = new Float32Array(Math.ceil((TAPE + 2) / 0.03) + 2), right = new Float32Array(left.length);
  for (const [edge, s0] of [[top, seed + 20], [bottom, seed + 30]]) {
    for (let q = 0; q < edge.length; q++) {
      const x = q * 0.05 - 1;
      edge[q] = 0.035 * noise(x / 2.2, 0.5, s0) + 0.015 * noise(x / 0.7, 0.5, s0 + 1) + 0.006 * noise(x / 0.08, 0.5, s0 + 2);
    }
    let n = 2 + Math.floor(rnd() * 5);
    if (L < 20) n = Math.min(n, 1 + Math.floor(L / 6)); // chips: a short piece has fewer
    for (; n > 0; n--) {
      const c = rnd() * L, half = 0.15 + rnd() * 0.3, depth = 0.04 + rnd() ** 2 * 0.12, sharp = rnd() < 0.4;
      for (let q = Math.max(0, Math.floor((c - half + 1) / 0.05)); q <= Math.min(edge.length - 1, Math.ceil((c + half + 1) / 0.05)); q++) {
        const u = Math.abs(q * 0.05 - 1 - c) / half;
        if (u < 1) edge[q] += depth * (sharp ? (1 - u) ** 1.2 : (1 - u * u) ** 1.5);
      }
    }
  }
  for (const [end, s0] of [[left, seed + 40], [right, seed + 50]]) {
    const a0 = 0.3 + (rnd() - 0.5) * 1.2, a1 = 0.3 + (rnd() - 0.5) * 1.2;
    for (let q = 0; q < end.length; q++) {
      const y = q * 0.03 - 1;
      end[q] = a0 + ((a1 - a0) * y) / TAPE + 0.15 * noise(y / 0.9, 0.5, s0) + 0.06 * noise(y / 0.3, 0.5, s0 + 1) + 0.025 * noise(y / 0.1, 0.5, s0 + 2);
    }
    for (let n = 1 + Math.floor(rnd() * 3); n > 0; n--) {
      const c = rnd() * TAPE, half = 0.1 + rnd() * 0.12, h = (0.04 + rnd() * 0.06) * (rnd() < 0.7 ? -1 : 1);
      for (let q = Math.max(0, Math.floor((c - half + 1) / 0.03)); q <= Math.min(end.length - 1, Math.ceil((c + half + 1) / 0.03)); q++) {
        const u = Math.abs(q * 0.03 - 1 - c) / half;
        if (u < 1) end[q] += h * (1 - u);
      }
    }
  }
  const slope = (a, step) => a.map((v, q) => (a[Math.min(a.length - 1, q + 1)] - a[Math.max(0, q - 1)]) / (2 * step));
  // the same outline without its raggedness, for the shadows: a shadow keeps
  // the shape of what casts it, not every tooth of it
  const soften = (a, n) => a.map((v, q) => {
    let sum = 0, c = 0;
    for (let z = Math.max(0, q - n); z <= Math.min(a.length - 1, q + n); z++, c++) sum += a[z];
    return sum / c;
  });
  const topSoft = soften(top, 5), bottomSoft = soften(bottom, 5), leftSoft = soften(left, 8), rightSoft = soften(right, 8);
  const round = [0, 1, 2, 3].map(() => 0.2 + rnd() * 0.5);
  const at = (end, y) => end[Math.round((y + 1) / 0.03)];
  const corners = [at(left, 0), 0, at(left, TAPE), TAPE, L - at(right, 0), 0, L - at(right, TAPE), TAPE];
  // and now and then a corner has come unstuck a little
  let peel = null;
  if (rnd() < 0.5) {
    const q = Math.floor(rnd() * 4);
    peel = {x: corners[q * 2], y: corners[q * 2 + 1], h: 0.15 + rnd() * 0.2, r: 2 + rnd() * 1.5};
  }
  return {
    seed, gw, gh, slow, bins, corners, round, peel,
    sharp: {top, bottom, left, right, topS: slope(top, 0.05), bottomS: slope(bottom, 0.05), leftS: slope(left, 0.03), rightS: slope(right, 0.03)},
    soft: {top: topSoft, bottom: bottomSoft, left: leftSoft, right: rightSoft, topS: slope(topSoft, 0.05), bottomS: slope(bottomSoft, 0.05), leftS: slope(leftSoft, 0.03), rightS: slope(rightSoft, 0.03)},
  };
}

// A worn strip's outline, torn and worn: the signed distance to it (mm,
// negative inside), and for its grime how far it is to the ends and to the
// long edges, and how far in the nearer long edge is worn here — deep at a
// chip. Across a wandering edge that is its offset times the cosine of its
// slope — true near it, and kept to slopes it stays true for.
function torn(p, wr, x, y, out, soft) {
  const L = p.length, O = soft ? wr.soft : wr.sharp;
  let u = (x + 1) / 0.05, q = Math.min(O.top.length - 2, Math.max(0, Math.floor(u))), f = Math.min(1, Math.max(0, u - q));
  const T = O.top, B = O.bottom, TS = O.topS, BS = O.bottomS;
  const t0 = T[q] + (T[q + 1] - T[q]) * f, ts = TS[q] + (TS[q + 1] - TS[q]) * f;
  const b0 = B[q] + (B[q + 1] - B[q]) * f, bs = BS[q] + (BS[q + 1] - BS[q]) * f;
  const ey = Math.max((t0 - y) / Math.sqrt(1 + Math.min(1.44, ts * ts)), (y - TAPE + b0) / Math.sqrt(1 + Math.min(1.44, bs * bs)));
  u = (y + 1) / 0.03;
  q = Math.min(O.left.length - 2, Math.max(0, Math.floor(u)));
  f = Math.min(1, Math.max(0, u - q));
  const E = O.left, R = O.right, ES = O.leftS, RS = O.rightS;
  const l0 = E[q] + (E[q + 1] - E[q]) * f, ls = ES[q] + (ES[q + 1] - ES[q]) * f;
  const r0 = R[q] + (R[q + 1] - R[q]) * f, rs = RS[q] + (RS[q + 1] - RS[q]) * f;
  const ex = Math.max((l0 - x) / Math.sqrt(1 + Math.min(1.44, ls * ls)), (x - L + r0) / Math.sqrt(1 + Math.min(1.44, rs * rs)));
  // worn round where an end meets an edge
  const r = wr.round[(x < L / 2 ? 0 : 1) + (y < TAPE / 2 ? 0 : 2)];
  const ax = Math.max(0, r + ex), ay = Math.max(0, r + ey);
  out[0] = Math.min(-r, Math.max(ex, ey)) + Math.sqrt(ax * ax + ay * ay);
  out[1] = ex;
  out[2] = ey;
  out[3] = y < TAPE / 2 ? t0 : b0;
}

// On the black strip a corner come unstuck is one of the lower two: its
// shadow falls clear of the strip, where it shows, and it tips toward the
// sky it catches rather than away from it into a dark patch.
function lower(wr) {
  if (!wr.peel) return null;
  const C = wr.corners, q = [0, 1, 2, 3].find(q => C[q * 2] === wr.peel.x && C[q * 2 + 1] === wr.peel.y) | 1;
  return {...wr.peel, x: C[q * 2], y: C[q * 2 + 1]};
}

// how far the corner that has come unstuck stands off the page, here
function peeled(P, x, y) {
  if (!P) return 0;
  const t = 1 - Math.min(1, Math.sqrt((x - P.x) ** 2 + (y - P.y) ** 2) / P.r);
  return P.h * t * t;
}

// how dirty a worn strip is at a point, 0…1, and how much it has aged; and,
// for the black strip, the dirt apart from the scratches and grit on it, and
// those apart
function grime(wr, x, y, ex, ey, s, shut, seam, k, out) {
  const gu = x * WEAR + 1, gv = y * WEAR + 1;
  const gi = Math.min(wr.gw - 2, Math.max(0, Math.floor(gu))), gj = Math.min(wr.gh - 2, Math.max(0, Math.floor(gv)));
  const fu = Math.min(1, Math.max(0, gu - gi)), fv = Math.min(1, Math.max(0, gv - gj));
  const S = wr.slow, o = (gj * wr.gw + gi) * 3, o2 = o + wr.gw * 3;
  const w00 = (1 - fu) * (1 - fv), w10 = fu * (1 - fv), w01 = (1 - fu) * fv, w11 = fu * fv;
  let d = S[o] * w00 + S[o + 3] * w10 + S[o2] * w01 + S[o2 + 3] * w11;
  out[1] = S[o + 1] * w00 + S[o + 4] * w10 + S[o2 + 1] * w01 + S[o2 + 4] * w11;
  const patch = S[o + 2] * w00 + S[o + 5] * w10 + S[o2 + 2] * w01 + S[o2 + 5] * w11;

  // grime along the worn long edges, most toward the corners; the torn ends
  // are whiter instead, where the vinyl stretched before it gave
  const rim = 1 - smooth(0.03, 0.38, -ey);
  if (rim > 0) {
    let near = 1e9;
    const C = wr.corners;
    for (let q = 0; q < 8; q += 2) near = Math.min(near, (x - C[q]) ** 2 + (y - C[q + 1]) ** 2);
    const corner = Math.exp(-near / 1.2);
    d += (0.22 + 0.3 * patch) * rim * rim * (1 + 0.6 * corner);
  }
  const fresh = 1 - smooth(0.02, 0.16, -ex);
  if (fresh > 0) {
    d *= 1 - 0.85 * fresh;
    out[1] *= 1 - fresh;
  }
  d += 0.1 * patch * Math.exp(-(seam * seam) / 0.0012); // in the seams between the cells
  if (s > -0.45 && s < 0) d += 0.12 * patch * smooth(-0.42, -0.16, s) * (1 - smooth(-0.14, -0.04, s)) * (1 - 0.8 * shut); // at the letters' feet
  d += 0.035 * noise(x / 0.05, y / 0.05, wr.seed + 8); // the vinyl's own grain
  const film = d;

  // scratches and dust; one smaller than a pixel is spread over one, just as dark in all
  const bin = wr.bins[Math.min(wr.bins.length - 1, Math.max(0, Math.floor(x / BIN)))];
  for (let q = 0; q < bin.length; q++) {
    const f = bin[q], b = f.box;
    if (x < b[0] || y < b[1] || x > b[2] || y > b[3]) continue;
    if (f.pts) {
      const P = f.pts;
      let best = 1e9, along = 0;
      for (let z = 0; z < 3; z++) {
        const ax = P[z * 2], ay = P[z * 2 + 1], ex = P[z * 2 + 2] - ax, ey = P[z * 2 + 3] - ay;
        let t = ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const e2 = (x - ax - t * ex) ** 2 + (y - ay - t * ey) ** 2;
        if (e2 < best) {
          best = e2;
          along = (z + t) / 3;
        }
      }
      const hwe = Math.max(f.hw, 0.6 / k), dist = Math.sqrt(best);
      if (dist < hwe * 1.5) d += f.a * (f.hw / hwe) * (1 - smooth(hwe * 0.5, hwe * 1.5, dist)) * Math.sin(Math.PI * along) ** 0.6;
    } else {
      const ux = x - f.x, uy = y - f.y, grow = Math.max(1, 0.6 / k / f.ry);
      const qa = (f.c * ux + f.s * uy) / (f.rx * grow), qb = (f.c * uy - f.s * ux) / (f.ry * grow), rho = Math.sqrt(qa * qa + qb * qb);
      if (rho < 1.25) d += (f.a / (grow * grow)) * (1 - smooth(0.55, 1.25, rho));
    }
  }
  out[0] = Math.min(0.9, Math.max(0, d));
  out[2] = Math.min(0.9, Math.max(0, film));
  out[3] = Math.min(0.9, d - film);
}

// linear light → the screen, through a filmic curve
const LUT = new Float32Array(4096);
for (let i = 0; i < 4096; i++) {
  const x = (i / 4095) ** 2 * 16;
  const t = Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
  LUT[i] = t <= 0.0031308 ? 12.92 * t : 1.055 * t ** (1 / 2.4) - 0.055;
}
const screen = x => LUT[Math.min(4095, (Math.sqrt(Math.max(0, x) / 16) * 4095) | 0)];

// ---------- light ----------

// A strip, lit: worked out a few rows at a time, so that a big one — the
// landing's name — can be drawn between other things (see work()); paint()
// is the same all at once.
export function* painting(p, cssH, dpr, vinyl) {
  // rendered at twice the screen's pixels, then averaged — unless the screen
  // is sharp or the strip big enough that its own pixels are plenty
  const ss = dpr >= 2.5 || (cssH / TAPE) * dpr >= 9 ? 1 : 2;
  const pxmm = cssH / TAPE, k = pxmm * dpr * ss; // buffer pixels per millimetre
  const L = p.length, th = (p.tilt * Math.PI) / 180, co = Math.cos(th), si = Math.sin(th);
  const bw = L * Math.abs(co) + TAPE * Math.abs(si) + 2 * MARGIN;
  const bh = L * Math.abs(si) + TAPE * Math.abs(co) + 2 * MARGIN;
  const cw = Math.ceil(bw * pxmm * dpr), ch = Math.ceil(bh * pxmm * dpr);
  const W = cw * ss, H = ch * ss, N = W * H, cx = W / 2, cy = H / 2;
  const letters = p.letters, nl = letters.length;
  // the white strip, the worn black one and the clear one have been about a
  // while; on the black and the clear, scratches and grit show light
  const inked = vinyl === 'white', black = vinyl === 'black', glass = vinyl === 'glass';
  const clear = black || glass, worn = inked || clear;

  const height = new Float32Array(N), white = new Float32Array(N), cover = new Float32Array(N), shade = new Float32Array(N);
  // a worn strip's wear: how dirty and how aged each point is, and on the
  // black and the clear strip how much of that is scratches and grit
  const wr = worn ? (p.worn ??= wear(p)) : null, got = [0, 0, 0, 0], cut = [0, 0, 0, 0], gap = [0, 0, 0, 0];
  const dirt = worn ? new Float32Array(N) : null, age = worn ? new Float32Array(N) : null;
  const grit = clear ? new Float32Array(N) : null;
  const peel = clear ? (p.low ??= lower(wr)) : wr?.peel;
  // the clear strip throws no shadow worth drawing: in its place, its glow;
  // and it needs to know, for its edge, how far in from it each point is
  const inset = glass ? new Float32Array(N) : null, alpha = glass ? new Float32Array(N) : null;
  const flat = Math.hypot(KEY[0], KEY[1]), tanE = KEY[2] / flat;
  // the way a shadow falls — away from the light — in the strip's coordinates
  const ax = -KEY[0] / flat, ay = -KEY[1] / flat;
  const sx = co * ax + si * ay, sy = -si * ax + co * ay;
  const half = TAPE / 2;

  // Each pass is worked a row at a time by a small function of its own: an
  // engine makes a function it keeps calling fast long before it gets to a
  // loop that runs once for a long time, so the first strip on a page — on a
  // phone's Safari above all — is drawn nearly as fast as the next.
  const model = j => {
    const dy = (j + 0.5 - cy) / k;
    for (let i = 0; i < W; i++) {
      const dx = (i + 0.5 - cx) / k;
      const x = co * dx + si * dy + L / 2, y = -si * dx + co * dy + half;
      const o = j * W + i;
      let edge, ex = -9, ey = -9, lifted = 0;
      if (worn) {
        torn(p, wr, x, y, cut, false);
        edge = cut[0];
        ex = cut[1];
        ey = cut[2];
        lifted = peeled(peel, x, y);
      } else edge = outline(p, x, y);

      if (glass) {
        if (edge > -0.3) shade[o] = GLOW * Math.exp(-Math.max(0, edge) / GLOW_R) * smooth(-0.3, 0, edge);
        inset[o] = -edge;
      } else if (edge > -0.3) {
        // the strip's shadow on the page: tight where it lies flat, wider and
        // softer where an end stands off — worked out only where the page can
        // show, not well inside the strip
        const lift = THICK + curl(p, Math.min(L, Math.max(0, x))) + lifted;
        const off = lift / tanE, r = 0.1 + lift * 0.7;
        let far, near = edge;
        if (worn) {
          torn(p, wr, x - sx * off, y - sy * off, gap, true);
          far = gap[0];
          if (edge > 0) {
            torn(p, wr, x, y, gap, true);
            near = gap[0]; // the outline its shadows keep to
          }
        } else far = outline(p, x - sx * off, y - sy * off);
        const cast = 0.6 * (1 - smooth(-r, r, far));
        const contact = edge > 0 ? 0.32 * (1 - smooth(0, 0.4, Math.max(0, near))) * (1 - Math.min(1, lifted / 0.12)) : 0; // none where it has come up
        shade[o] = 1 - (1 - cast) * (1 - contact);
      }
      if (edge > 0.25) continue;
      cover[o] = Math.min(1, Math.max(0, 0.5 - edge * k));

      // the letters: how far inside the nearest one's edge (mm, negative
      // outside), and how much of what one closes in this is
      let s = -9, shut = 0;
      for (let q = 0; q < nl; q++) {
        const l = letters[q], b = l.box;
        if (x < b[0] || y < b[1] || x > b[2] || y > b[3]) continue;
        const lx = x - l.cx, ly = y - l.cy;
        const gx = (l.cos * lx + l.sin * ly) / U + l.w / 2, gy = (l.cos * ly - l.sin * lx) / U + 50;
        const e = l.hw - reach(l.die, gx, gy) * U;
        if (e > s) s = e;
        const c = closed(l.die, gx, gy);
        if (c > shut) shut = c;
      }
      // no die edge is clean and no stroke quite even: its walls wander a
      // little, and the stroke swells and thins along its length
      if (s > -9) s += 0.008 * noise(x / 0.22, y / 0.22, p.seed + 3) + 0.016 * noise(x / 0.8, y / 0.8, p.seed + 5);
      const cell = Math.floor((x - p.lead) / PITCH);
      const inText = cell >= 0 && cell < p.n;
      const pr = inText ? p.press[cell] : 1;
      const fu = (x - p.lead) / PITCH - cell;
      const seam = Math.abs(x - p.lead - Math.min(p.n, Math.max(0, Math.round((x - p.lead) / PITCH))) * PITCH);
      const v = (y - half) / half;

      // the letter: a steep wall, then a rounded top that peaks along the
      // middle of the stroke
      const up = smooth(-0.14, 0.08, s);
      const ridge = s > 0 ? 1 - (1 - Math.min(1, s / (STROKE / 2))) ** 2 : 0;
      let h = THICK + curl(p, x) + lifted;
      h += RELIEF * pr * ((1 - DOME) * up + DOME * ridge);
      h += 0.02 * pr * (s < 0 ? Math.exp(s / 0.3) * smooth(-1, -0.75, s) : 1); // the vinyl pulled up around it
      if (inText) {
        const bulge = Math.sin(Math.PI * fu);
        h += 0.004 * p.puck[cell] * bulge * bulge * (1 - v * v); // each punch's cell
      }
      h -= 0.0008 * Math.exp(-(seam * seam) / 0.0025); // and the seams between cells
      h -= 0.018 * v * v; // the strip is a touch convex across
      h -= 0.07 * smooth(-0.14, 0, edge); // its edges round down onto the page
      h += 0.0005 * noise(x / 0.5, y / 0.5, p.seed) + 0.00015 * noise(x / 0.12, y / 0.12, p.seed + 7); // not quite a mirror
      height[o] = h;

      let w = 0;
      if (s > -1) {
        // the walls are stretched most and turn white; the top is greyer,
        // lighter again along the ridge where the die pressed it. Inside a
        // hole the vinyl is held on every side, so the white starts closer
        // to the wall there, and even a small hole stays dark.
        const wall = smooth(-0.17 + 0.05 * shut, -0.07 + 0.05 * shut, s) * (1 - smooth(0.03, 0.13, s));
        const top = smooth(0.03, 0.13, s);
        w += 0.9 * wall + top * (0.3 + 0.25 * smooth(0.12, 0.23, s));
        w += 0.12 * Math.exp(Math.min(0, s + 0.1) / 0.08) * (1 - wall) * (1 - top) * (1 - 0.7 * shut); // the grey halo around it, hardly inside it
        w *= pr;
      }
      if (!inked) w += 0.035 * smooth(-0.1, 0, edge); // the cut edge catches light
      if (clear) {
        // where it tore, the vinyl whitened as it stretched before it gave;
        // so it did where a chip came out of an edge
        const tear = 1 - smooth(0.015, 0.14, -ex), chip = smooth(0.05, 0.13, cut[3]) * (1 - smooth(0, 0.1, -ey));
        if (tear > 0 || chip > 0) w += (0.3 * tear * tear + 0.2 * chip) * (0.65 + 0.35 * noise(x / 0.05, y / 0.05, p.seed + 11));
      }
      white[o] = Math.min(1, w);
      if (worn && w < 0.27) {
        // (under solid ink, or the white of a letter, nothing of it shows, so
        // there is no need to know)
        grime(wr, x, y, ex, ey, s, shut, seam, k, got);
        dirt[o] = inked ? got[0] : got[2];
        age[o] = got[1];
        if (clear) grit[o] = got[3];
      }
    }
  };
  for (let j = 0; j < H; j++) {
    if ((j & 7) === 7) yield;
    model(j);
  }

  // dust
  for (const d of p.dust) {
    const X = co * (d.x - L / 2) - si * (d.y - half), Y = si * (d.x - L / 2) + co * (d.y - half);
    const px = cx + X * k, py = cy + Y * k, r = d.r * k;
    for (let j = Math.max(1, Math.floor(py - r - 1)); j <= Math.min(H - 2, Math.ceil(py + r + 1)); j++) {
      for (let i = Math.max(1, Math.floor(px - r - 1)); i <= Math.min(W - 2, Math.ceil(px + r + 1)); i++) {
        const o = j * W + i, f = d.a * smooth(r, r * 0.3, Math.hypot(i + 0.5 - px, j + 0.5 - py));
        if (cover[o] > 0.5) {
          if (inked) dirt[o] = Math.min(0.9, dirt[o] + 0.7 * f); // grit on the white strip, not whitening
          else if (clear) grit[o] = Math.min(0.9, grit[o] + 0.7 * f); // and on the black and the clear one, as the rest of their grit
          else white[o] = Math.min(1, white[o] + f);
          height[o] += 0.004 * f;
        }
      }
    }
  }

  const around = blur(height, W, H, Math.max(1, Math.round(0.3 * k)));
  yield;
  const step = 0.05 * k, stx = (KEY[0] / flat) * step, sty = (KEY[1] / flat) * step, rise = 0.05 * tanE;
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
  const base = inked ? PAPER : VINYL, mark = inked ? INK : WHITE;

  const light = j => {
    for (let i = 1; i < W - 1; i++) {
      const o = j * W + i;
      if (!cover[o]) continue;
      const h = height[o];
      let nx = -(height[o + 1] - height[o - 1]) * (k / 2);
      let ny = -(height[o + W] - height[o - W]) * (k / 2);
      let nz = 1;
      const nl = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nx *= nl;
      ny *= nl;
      nz *= nl;

      // the letters' own shadows on the strip, marched toward the light
      let occ = 0;
      for (let t = 1; t <= 8; t++) {
        const qi = Math.round(i + stx * t), qj = Math.round(j + sty * t);
        if (qi < 0 || qj < 0 || qi >= W || qj >= H) break;
        const dh = height[qj * W + qi] - h - rise * t;
        if (dh > occ) occ = dh;
      }
      const lit = 1 - smooth(0, 0.05, occ);
      const ao = 1 - Math.min(0.55, Math.max(0, (around[o] - h) * 2.4));

      const w = white[o];
      const ndl = Math.max(0, nx * KEY[0] + ny * KEY[1] + nz * KEY[2]);
      const room = AMBIENT * ao * (0.6 + 0.25 * nz - 0.15 * ny);
      const sun = KEY_I * ndl * lit;

      let b0 = base[0], b1 = base[1], b2 = base[2], m = w, sheen = 1;
      if (inked) {
        // the white vinyl, a little warmer where it has aged, and its grime;
        // the ink over it
        const a = age[o], d = dirt[o];
        b1 *= 1 - 0.03 * a;
        b2 *= 1 - 0.1 * a;
        b0 += (GRIME[0] - b0) * d;
        b1 += (GRIME[1] - b1) * d;
        b2 += (GRIME[2] - b2) * d;
        m = INKED[(w * 256) | 0];
      } else if (black) {
        // the black vinyl, greyed a little where dust and grime have
        // collected and light at its scratches and grit; duller where it was
        // handled and where it has aged
        const d = Math.min(1, FILM * dirt[o] + GRIT * grit[o]);
        b0 += (DUST[0] - b0) * d;
        b1 += (DUST[1] - b1) * d;
        b2 += (DUST[2] - b2) * d;
        sheen = 1 - 0.3 * Math.min(1, dirt[o] + 0.4 * age[o]);
      } else if (glass) sheen = 1 - 0.3 * Math.min(1, dirt[o] + 0.4 * age[o]); // the clear vinyl, just as dull there

      // the gloss: what the vinyl reflects toward the eye — the sky in the
      // window, the room, and the window's light itself as a small glint
      let vx = (cx - i - 0.5) / k, vy = (cy - j - 0.5) / k, vz = EYE;
      const vl = 1 / Math.sqrt(vx * vx + vy * vy + vz * vz);
      vx *= vl;
      vy *= vl;
      vz *= vl;
      const nv = Math.max(0, nx * vx + ny * vy + nz * vz);
      const f = F0 + (1 - F0) * (1 - nv) ** 5;
      const rx = 2 * nv * nx - vx, ry = 2 * nv * ny - vy, rz = 2 * nv * nz - vz;
      // (a dull patch does not reflect less, only less sharply: the sky in it
      // spreads into a haze)
      const sky = f * SKY_I * (smooth(SKY_EDGE[0], SKY_EDGE[1], rx * SKY[0] + ry * SKY[1] + rz * SKY[2]) * sheen + (1 - sheen) * HAZE);
      const walls = f * (0.035 + 0.06 * Math.max(0, -ry) + 0.02 * rz); // the room, reflected
      const hx = KEY[0] + vx, hy = KEY[1] + vy, hz = KEY[2] + vz;
      const nh = Math.max(0, (nx * hx + ny * hy + nz * hz) / Math.sqrt(hx * hx + hy * hy + hz * hz));
      const glint = f * KEY_I * 0.9 * nh ** 120 * lit * sheen;

      if (glass) {
        // clear vinyl, as light laid over what is under it: the little it
        // takes of it, and the darker line just inside its edge; the whitened
        // vinyl and the lit edge, as a frost; and on top what it reflects
        const d = inset[o], c = cover[o];
        const dark = TINT + EDGE_DARK * smooth(0.03, 0.07, d) * (1 - smooth(0.1, 0.18, d));
        const frost = Math.min(1, FROST * (w + 0.6 * grit[o]) + RIM * (1 - smooth(0, RIM_W, d)));
        const fr = screen(FROST_ALBEDO * (room * 0.92 + sun)), fg = screen(FROST_ALBEDO * (room * 0.96 + sun * 0.975)), fb = screen(FROST_ALBEDO * (room + sun * 0.94));
        const rr = screen(sky * SKY_TINT[0] + walls + glint), rg = screen(sky * SKY_TINT[1] + walls + glint * 0.975), rb = screen(sky * SKY_TINT[2] + walls + glint * 0.94);
        const top = Math.max(rr, rg, rb);
        R[o] = (rr + (1 - top) * fr * frost) * c;
        G[o] = (rg + (1 - top) * fg * frost) * c;
        B[o] = (rb + (1 - top) * fb * frost) * c;
        alpha[o] = (1 - (1 - dark) * (1 - frost) * (1 - top)) * c;
        continue;
      }

      const r = b0 + (mark[0] - b0) * m, g = b1 + (mark[1] - b1) * m, b = b2 + (mark[2] - b2) * m;
      R[o] = screen(r * (room * 0.92 + sun) + sky * SKY_TINT[0] + walls + glint);
      G[o] = screen(g * (room * 0.96 + sun * 0.975) + sky * SKY_TINT[1] + walls + glint * 0.975);
      B[o] = screen(b * (room + sun * 0.94) + sky * SKY_TINT[2] + walls + glint * 0.94);
    }
  };
  for (let j = 1; j < H - 1; j++) {
    if ((j & 7) === 7) yield;
    light(j);
  }

  // average down to the screen's pixels; the strip over its own shadow — the
  // clear one, as it is already, over its glow
  const image = new ImageData(cw, ch), px = image.data, n = ss * ss;
  const average = y => {
    for (let x = 0; x < cw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let v = 0; v < ss; v++) {
        for (let u = 0; u < ss; u++) {
          const o = (y * ss + v) * W + x * ss + u;
          if (glass) {
            const lo = (1 - alpha[o]) * shade[o];
            r += R[o] + lo;
            g += G[o] + lo;
            b += B[o] + lo;
            a += alpha[o] + lo;
            continue;
          }
          const c = cover[o];
          r += R[o] * c;
          g += G[o] * c;
          b += B[o] * c;
          a += c + (1 - c) * shade[o];
        }
      }
      const q = (y * cw + x) * 4;
      if (a > 0) {
        px[q] = (r / a) * 255;
        px[q + 1] = (g / a) * 255;
        px[q + 2] = (b / a) * 255;
      }
      px[q + 3] = (a / n) * 255;
    }
  };
  for (let y = 0; y < ch; y++) {
    if ((y & 31) === 31) yield;
    average(y);
  }
  return {image, width: cw, height: ch};
}

export const paint = (...args) => {
  const it = painting(...args);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
};
