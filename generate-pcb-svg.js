#!/usr/bin/env node
// Generates a static SVG that faithfully reproduces the canvas PCB aesthetic.
// Run: node generate-pcb-svg.js > src/assets/images/pcb-hero.svg

const W = 1400, H = 700;
const GRID = 68;
const PULSE_N = 26;
const CPAD = 10;
const COL = '7,122,110';

// Seeded LCG so the output is deterministic but looks organic
let seed = 0xc0ffee42;
function rand() {
  seed = Math.imul(seed ^ (seed >>> 13), 0x9e3779b9 + (seed << 6) + (seed >>> 2));
  seed = seed ^ (seed >>> 16);
  return (seed >>> 0) / 0x100000000;
}

// Button footprint boxes — approximate positions matching the real hero layout
// pcb-ctas centred at W/2, 3 buttons ~200px wide each, gap 28px, buttons at y≈470-550
const BTN_W = 200, BTN_H = 72;
const BTN_Y = 470;
const totalBtns = 3 * BTN_W + 2 * 28;
const BTN_X0 = (W - totalBtns) / 2;
const compBoxes = [0, 1, 2].map(i => ({
  x: BTN_X0 + i * (BTN_W + 28) - CPAD,
  y: BTN_Y - CPAD,
  w: BTN_W + 2 * CPAD,
  h: BTN_H + 2 * CPAD,
}));

function inZone(x, y, margin) {
  return compBoxes.some(b =>
    x > b.x - margin && x < b.x + b.w + margin &&
    y > b.y - margin && y < b.y + b.h + margin);
}

// ── Nodes ──────────────────────────────────────────────────
const map = {};
const nodes = [];
const cols = Math.ceil(W / GRID) + 2;
const rows = Math.ceil(H / GRID) + 2;
const ox = Math.round((W - (cols - 1) * GRID) / 2);
const oy = Math.round((H - (rows - 1) * GRID) / 2);

for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const x = ox + c * GRID, y = oy + r * GRID;
    if (rand() < 0.57 && !inZone(x, y, GRID * 0.8)) {
      const idx = nodes.length;
      nodes.push({ x, y, r, c, via: rand() < 0.18, tt: [] });
      map[`${c},${r}`] = idx;
    }
  }
}

// ── Traces ─────────────────────────────────────────────────
const traces = [];
nodes.forEach((n, i) => {
  [[n.c + 1, n.r], [n.c, n.r + 1]].forEach(([nc, nr]) => {
    const j = map[`${nc},${nr}`];
    if (j !== undefined) {
      const ti = traces.length;
      traces.push({ x1: n.x, y1: n.y, x2: nodes[j].x, y2: nodes[j].y, a: i, b: j });
      n.tt.push(ti); nodes[j].tt.push(ti);
    }
  });
});

// ── Connection traces (L-shaped, button pads → circuit) ────
const connTraces = [];
compBoxes.forEach(box => {
  const midY = box.y + box.h / 2;
  const pads = 3, sp = box.w / (pads + 1);
  for (let p = 0; p < pads; p++) {
    const padX = box.x + sp * (p + 1), padY = box.y;
    const tgt = nodes
      .filter(n => n.y < padY - 5 && Math.abs(n.x - padX) < GRID * 1.5 && padY - n.y < GRID * 3)
      .sort((a, b) => Math.hypot(a.x - padX, a.y - padY) - Math.hypot(b.x - padX, b.y - padY))[0];
    if (tgt) connTraces.push({ x1: padX, y1: padY, bx: padX, by: tgt.y, x2: tgt.x, y2: tgt.y });
  }
  const lTgt = nodes
    .filter(n => n.x < box.x && Math.abs(n.y - midY) < GRID * 1.5 && box.x - n.x < GRID * 2.5)
    .sort((a, b) => b.x - a.x)[0];
  if (lTgt) connTraces.push({ x1: box.x, y1: midY, bx: lTgt.x, by: midY, x2: lTgt.x, y2: lTgt.y });

  const rTgt = nodes
    .filter(n => n.x > box.x + box.w && Math.abs(n.y - midY) < GRID * 1.5 && n.x - (box.x + box.w) < GRID * 2.5)
    .sort((a, b) => a.x - b.x)[0];
  if (rTgt) connTraces.push({ x1: box.x + box.w, y1: midY, bx: rTgt.x, by: midY, x2: rTgt.x, y2: rTgt.y });
});

// ── Chips ──────────────────────────────────────────────────
const chips = nodes
  .filter(n => n.tt.length >= 3 && rand() < 0.10)
  .slice(0, 6)
  .map(n => ({ x: n.x, y: n.y }));

// ── Pulses (static snapshot mid-travel) ───────────────────
const pulses = [];
for (let i = 0; i < PULSE_N; i++) {
  if (!traces.length) break;
  const ti = Math.floor(rand() * traces.length);
  const t  = 0.05 + rand() * 0.90; // keep away from exact endpoints
  const tr = traces[ti];
  const px = tr.x1 + (tr.x2 - tr.x1) * t;
  const py = tr.y1 + (tr.y2 - tr.y1) * t;
  const tf = Math.max(0, t - 0.12);
  const tx = tr.x1 + (tr.x2 - tr.x1) * tf;
  const ty = tr.y1 + (tr.y2 - tr.y1) * tf;
  pulses.push({ px, py, tx, ty, id: i });
}

// ── Helpers ────────────────────────────────────────────────
const f = n => +n.toFixed(2);

// ── Build SVG ─────────────────────────────────────────────
const lines = [];
const p = (...s) => lines.push(...s);

p(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);

// ── defs ──
p(`  <defs>`);

// dot grid pattern (much more compact than individual rects)
p(`    <pattern id="dots" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">`);
p(`      <rect x="10.4" y="10.4" width="1.2" height="1.2" fill="rgb(${COL})"/>`);
p(`    </pattern>`);

// pulse glows
pulses.forEach(({ px, py, tx, ty, id }) => {
  p(`    <radialGradient id="pg${id}" cx="${f(px)}" cy="${f(py)}" r="22" gradientUnits="userSpaceOnUse">`);
  p(`      <stop offset="0%" stop-color="rgb(${COL})" stop-opacity="0.38"/>`);
  p(`      <stop offset="100%" stop-color="rgb(${COL})" stop-opacity="0"/>`);
  p(`    </radialGradient>`);
  p(`    <linearGradient id="tg${id}" x1="${f(tx)}" y1="${f(ty)}" x2="${f(px)}" y2="${f(py)}" gradientUnits="userSpaceOnUse">`);
  p(`      <stop offset="0%" stop-color="rgb(${COL})" stop-opacity="0"/>`);
  p(`      <stop offset="100%" stop-color="rgb(${COL})" stop-opacity="0.88"/>`);
  p(`    </linearGradient>`);
});
p(`  </defs>`);

// ── background ──
p(`  <rect width="${W}" height="${H}" fill="#f0faf8"/>`);
p(`  <rect width="${W}" height="${H}" fill="url(#dots)" opacity="0.018"/>`);

// ── board edge ──
p(`  <rect x="14" y="14" width="${W - 28}" height="${H - 28}" stroke="rgb(${COL})" stroke-opacity="0.06" stroke-width="1.5" fill="none"/>`);

// ── fiducials ──
[[W * 0.05, H * 0.07], [W * 0.95, H * 0.07], [W * 0.05, H * 0.93], [W * 0.95, H * 0.93]]
  .forEach(([fx, fy]) => {
    p(`  <g stroke="rgb(${COL})" stroke-opacity="0.10" stroke-width="0.7" fill="none">`);
    p(`    <circle cx="${f(fx)}" cy="${f(fy)}" r="7"/><circle cx="${f(fx)}" cy="${f(fy)}" r="2.5"/>`);
    p(`    <line x1="${f(fx-12)}" y1="${f(fy)}" x2="${f(fx+12)}" y2="${f(fy)}"/>`);
    p(`    <line x1="${f(fx)}" y1="${f(fy-12)}" x2="${f(fx)}" y2="${f(fy+12)}"/>`);
    p(`  </g>`);
  });

// ── circuit traces ──
p(`  <g stroke="rgb(${COL})" stroke-opacity="0.13" stroke-width="1.2" fill="none">`);
traces.forEach(t => p(`    <line x1="${t.x1}" y1="${t.y1}" x2="${t.x2}" y2="${t.y2}"/>`));
p(`  </g>`);

// ── connection traces ──
p(`  <g stroke="rgb(${COL})" stroke-opacity="0.22" stroke-width="1.2" fill="none">`);
connTraces.forEach(ct => p(`    <polyline points="${f(ct.x1)},${f(ct.y1)} ${f(ct.bx)},${f(ct.by)} ${f(ct.x2)},${f(ct.y2)}" fill="none"/>`));
p(`  </g>`);

// ── button footprints ──
compBoxes.forEach(box => {
  const { x, y, w, h } = box;
  p(`  <rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" stroke="rgb(${COL})" stroke-opacity="0.30" stroke-width="0.9" fill="none"/>`);
  p(`  <circle cx="${f(x+9)}" cy="${f(y+9)}" r="3" stroke="rgb(${COL})" stroke-opacity="0.20" stroke-width="0.8" fill="none"/>`);
  p(`  <circle cx="${f(x+9)}" cy="${f(y+9)}" r="1.4" fill="rgb(${COL})" fill-opacity="0.16"/>`);
  const dcx = x + w/2, dcy = y + h/2;
  p(`  <circle cx="${f(dcx)}" cy="${f(dcy)}" r="8" stroke="rgb(${COL})" stroke-opacity="0.16" stroke-width="0.8" fill="none"/>`);
  p(`  <circle cx="${f(dcx)}" cy="${f(dcy)}" r="3" fill="rgb(${COL})" fill-opacity="0.10"/>`);
  const sp = w / 4;
  for (let pad = 0; pad < 3; pad++) {
    const px = x + sp * (pad + 1), py = y;
    p(`  <rect x="${f(px-5)}" y="${f(py-6)}" width="10" height="6" fill="rgb(${COL})" fill-opacity="0.28"/>`);
    p(`  <circle cx="${f(px)}" cy="${f(py-3)}" r="2" stroke="rgb(${COL})" stroke-opacity="0.14" stroke-width="0.8" fill="none"/>`);
  }
});

// ── nodes ──
nodes.forEach(n => {
  if (n.via) {
    p(`  <circle cx="${n.x}" cy="${n.y}" r="5.5" stroke="rgb(${COL})" stroke-opacity="0.40" stroke-width="1.3" fill="none"/>`);
    p(`  <circle cx="${n.x}" cy="${n.y}" r="2.2" stroke="rgb(${COL})" stroke-opacity="0.22" stroke-width="0.7" fill="none"/>`);
  } else {
    p(`  <circle cx="${n.x}" cy="${n.y}" r="3" fill="rgb(${COL})" fill-opacity="0.40"/>`);
    p(`  <circle cx="${n.x}" cy="${n.y}" r="5.5" stroke="rgb(${COL})" stroke-opacity="0.10" stroke-width="0.7" fill="none"/>`);
  }
});

// ── IC chips ──
chips.forEach(chip => {
  const cw = 44, ch = 22, pins = 3;
  const cx = chip.x - cw/2, cy = chip.y - ch/2;
  p(`  <rect x="${f(cx)}" y="${f(cy)}" width="${cw}" height="${ch}" stroke="rgb(${COL})" stroke-opacity="0.22" stroke-width="0.9" fill="none"/>`);
  for (let pin = 1; pin <= pins; pin++) {
    const py = f(cy + pin * ch / (pins + 1));
    p(`  <line x1="${f(cx-7)}" y1="${py}" x2="${f(cx)}" y2="${py}" stroke="rgb(${COL})" stroke-opacity="0.22" stroke-width="0.9"/>`);
    p(`  <line x1="${f(cx+cw)}" y1="${py}" x2="${f(cx+cw+7)}" y2="${py}" stroke="rgb(${COL})" stroke-opacity="0.22" stroke-width="0.9"/>`);
  }
  p(`  <circle cx="${f(cx+6)}" cy="${f(cy+6)}" r="1.8" fill="rgb(${COL})" fill-opacity="0.30"/>`);
});

// ── pulses ──
pulses.forEach(({ px, py, tx, ty, id }) => {
  p(`  <circle cx="${f(px)}" cy="${f(py)}" r="22" fill="url(#pg${id})"/>`);
  p(`  <line x1="${f(tx)}" y1="${f(ty)}" x2="${f(px)}" y2="${f(py)}" stroke="url(#tg${id})" stroke-width="2.5"/>`);
  p(`  <circle cx="${f(px)}" cy="${f(py)}" r="3" fill="rgb(${COL})" fill-opacity="0.88"/>`);
});

p(`</svg>`);

process.stdout.write(lines.join('\n') + '\n');
