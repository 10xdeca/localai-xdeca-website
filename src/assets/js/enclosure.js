(function () {
  const canvas = document.getElementById('enclosureCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, animId;
  let nodes = [], traces = [], connTraces = [], pulses = [], chips = [], compBoxes = [];

  const GRID = 68;
  const PULSE_N = 26;
  const CPAD = 10; // canvas overhang outside each CTA element

  function rgb() {
    return getComputedStyle(document.documentElement)
      .getPropertyValue('--color-pcb-rgb').trim() || '40,155,215';
  }

  function nodeScale() {
    return document.documentElement.getAttribute('data-bs-theme') === 'light' ? 0.45 : 1.0;
  }

  function measureComps() {
    const hr = canvas.parentElement.getBoundingClientRect();
    compBoxes = Array.from(document.querySelectorAll('.pcb-cta')).map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.left - hr.left - CPAD, y: r.top - hr.top - CPAD,
               w: r.width + CPAD * 2,      h: r.height + CPAD * 2 };
    });
  }

  function inZone(x, y, margin) {
    return compBoxes.some(b => b &&
      x > b.x - margin && x < b.x + b.w + margin &&
      y > b.y - margin && y < b.y + b.h + margin);
  }

  function build() {
    nodes = []; traces = []; connTraces = []; pulses = []; chips = [];
    measureComps();

    const map = {};
    const cols = Math.ceil(W / GRID) + 2;
    const rows = Math.ceil(H / GRID) + 2;
    const ox   = Math.round((W - (cols - 1) * GRID) / 2);
    const oy   = Math.round((H - (rows - 1) * GRID) / 2);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = ox + c * GRID, y = oy + r * GRID;
        if (Math.random() < 0.57 && !inZone(x, y, GRID * 0.8)) {
          const idx = nodes.length;
          nodes.push({ x, y, r, c, ph: Math.random() * Math.PI * 2, via: Math.random() < 0.18, tt: [] });
          map[`${c},${r}`] = idx;
        }
      }
    }

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

    // Route L-shaped traces from TOP pads of each CTA up into the circuit
    compBoxes.forEach(box => {
      if (!box) return;
      const midY = box.y + box.h / 2;

      // 3 top pads → vertical up then horizontal to nearest node
      const pads = 3, sp = box.w / (pads + 1);
      for (let p = 0; p < pads; p++) {
        const padX = box.x + sp * (p + 1);
        const padY = box.y; // TOP edge
        const tgt = nodes
          .filter(n => n.y < padY - 5 && Math.abs(n.x - padX) < GRID * 1.5 && padY - n.y < GRID * 3)
          .sort((a, b) => Math.hypot(a.x - padX, a.y - padY) - Math.hypot(b.x - padX, b.y - padY))[0];
        if (tgt) connTraces.push({ x1: padX, y1: padY, bx: padX, by: tgt.y, x2: tgt.x, y2: tgt.y });
      }

      // Left side → horizontal to nearest left node
      const lTgt = nodes
        .filter(n => n.x < box.x && Math.abs(n.y - midY) < GRID * 1.5 && box.x - n.x < GRID * 2.5)
        .sort((a, b) => b.x - a.x)[0];
      if (lTgt) connTraces.push({ x1: box.x, y1: midY, bx: lTgt.x, by: midY, x2: lTgt.x, y2: lTgt.y });

      // Right side → horizontal to nearest right node
      const rTgt = nodes
        .filter(n => n.x > box.x + box.w && Math.abs(n.y - midY) < GRID * 1.5 && n.x - (box.x + box.w) < GRID * 2.5)
        .sort((a, b) => a.x - b.x)[0];
      if (rTgt) connTraces.push({ x1: box.x + box.w, y1: midY, bx: rTgt.x, by: midY, x2: rTgt.x, y2: rTgt.y });
    });

    nodes.filter(n => n.tt.length >= 3 && Math.random() < 0.10)
         .slice(0, 6)
         .forEach(n => chips.push({ x: n.x, y: n.y }));

    for (let i = 0; i < PULSE_N; i++) spawnPulse();
  }

  function spawnPulse() {
    if (!traces.length) return;
    const ti = Math.floor(Math.random() * traces.length);
    pulses.push({ ti, t: Math.random(), d: Math.random() < 0.5 ? 1 : -1, s: 0.0024 + Math.random() * 0.0042 });
  }

  function setup() {
    W = canvas.parentElement.offsetWidth;
    H = canvas.parentElement.offsetHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    build();
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);
    const c = rgb();

    // ── Background dot-grid ──
    ctx.fillStyle = `rgba(${c},0.018)`;
    const ds = 22;
    for (let x = ds / 2; x < W; x += ds)
      for (let y = ds / 2; y < H; y += ds)
        ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);

    // ── Board edge ──
    ctx.strokeStyle = `rgba(${c},0.06)`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(14, 14, W - 28, H - 28);

    // ── Fiducial marks ──
    [[W * 0.05, H * 0.07], [W * 0.95, H * 0.07], [W * 0.05, H * 0.93], [W * 0.95, H * 0.93]]
      .forEach(([fx, fy]) => {
        ctx.strokeStyle = `rgba(${c},0.10)`; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.arc(fx, fy, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(fx, fy, 2.5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(fx - 12, fy); ctx.lineTo(fx + 12, fy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(fx, fy - 12); ctx.lineTo(fx, fy + 12); ctx.stroke();
      });

    // ── Circuit traces ──
    ctx.lineWidth = 1.2;
    traces.forEach(tr => {
      ctx.beginPath(); ctx.moveTo(tr.x1, tr.y1); ctx.lineTo(tr.x2, tr.y2);
      ctx.strokeStyle = `rgba(${c},0.13)`; ctx.stroke();
    });

    // ── Component connection traces (L-shaped) ──
    ctx.lineWidth = 1.2;
    connTraces.forEach(ct => {
      ctx.beginPath(); ctx.moveTo(ct.x1, ct.y1); ctx.lineTo(ct.bx, ct.by); ctx.lineTo(ct.x2, ct.y2);
      ctx.strokeStyle = `rgba(${c},0.22)`; ctx.stroke();
    });

    // ── CTA component footprints ──
    compBoxes.forEach(box => {
      if (!box) return;
      const { x, y, w, h } = box;

      // Silkscreen outline
      ctx.strokeStyle = `rgba(${c},0.30)`;
      ctx.lineWidth = 0.9;
      ctx.strokeRect(x, y, w, h);

      // Pin 1 marker (top-left corner)
      ctx.beginPath(); ctx.arc(x + 9, y + 9, 3, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${c},0.20)`; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 9, y + 9, 1.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${c},0.16)`; ctx.fill();

      // Tactile switch dome (center indicator — marks this as a button)
      const dcx = x + w / 2, dcy = y + h / 2;
      ctx.beginPath(); ctx.arc(dcx, dcy, 8, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${c},0.16)`; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.beginPath(); ctx.arc(dcx, dcy, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${c},0.10)`; ctx.fill();

      // Top pads (3, drawn ABOVE the component top edge)
      const pads = 3, sp = w / (pads + 1);
      for (let p = 0; p < pads; p++) {
        const px = x + sp * (p + 1), py = y;
        ctx.fillStyle = `rgba(${c},0.28)`;
        ctx.fillRect(px - 5, py - 6, 10, 6);
        ctx.beginPath(); ctx.arc(px, py - 3, 2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${c},0.14)`; ctx.lineWidth = 0.8; ctx.stroke();
      }
    });

    // ── Nodes ──
    const ns = nodeScale();
    nodes.forEach(n => {
      n.ph += 0.016;
      const p = 0.65 + 0.35 * Math.sin(n.ph);
      if (n.via) {
        ctx.beginPath(); ctx.arc(n.x, n.y, 5.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${c},${0.40 * p * ns})`; ctx.lineWidth = 1.3; ctx.stroke();
        ctx.beginPath(); ctx.arc(n.x, n.y, 2.2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${c},${0.22 * p * ns})`; ctx.lineWidth = 0.7; ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(n.x, n.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${c},${0.40 * p * ns})`; ctx.fill();
        ctx.beginPath(); ctx.arc(n.x, n.y, 5.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${c},${0.10 * ns})`; ctx.lineWidth = 0.7; ctx.stroke();
      }
    });

    // ── Small IC chip outlines ──
    chips.forEach(chip => {
      const cw = 44, ch = 22, pins = 3;
      const cx = chip.x - cw / 2, cy = chip.y - ch / 2;
      ctx.strokeStyle = `rgba(${c},0.22)`; ctx.lineWidth = 0.9;
      ctx.strokeRect(cx, cy, cw, ch);
      const ps = ch / (pins + 1);
      for (let p = 1; p <= pins; p++) {
        const py = cy + p * ps;
        ctx.beginPath(); ctx.moveTo(cx - 7, py); ctx.lineTo(cx, py); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + cw, py); ctx.lineTo(cx + cw + 7, py); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(cx + 6, cy + 6, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${c},0.30)`; ctx.fill();
    });

    // ── Pulses ──
    pulses = pulses.filter(pulse => {
      pulse.t += pulse.s * pulse.d;
      if (pulse.t > 1 || pulse.t < 0) {
        const ei = pulse.t > 1 ? traces[pulse.ti].b : traces[pulse.ti].a;
        const n  = nodes[ei];
        const av = n.tt.filter(ti => ti !== pulse.ti);
        if (av.length) {
          const nti = av[Math.floor(Math.random() * av.length)];
          pulse.ti  = nti;
          pulse.d   = traces[nti].a === ei ? 1 : -1;
          pulse.t   = pulse.d === 1 ? 0 : 1;
        } else {
          pulse.d *= -1;
          pulse.t  = pulse.t > 1 ? 1 : 0;
        }
      }
      const tr = traces[pulse.ti];
      if (!tr) return false;
      const px = tr.x1 + (tr.x2 - tr.x1) * pulse.t;
      const py = tr.y1 + (tr.y2 - tr.y1) * pulse.t;

      const g = ctx.createRadialGradient(px, py, 0, px, py, 22);
      g.addColorStop(0, `rgba(${c},0.38)`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.beginPath(); ctx.arc(px, py, 22, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();

      const tf = Math.max(0, Math.min(1, pulse.t - pulse.d * 0.10));
      const tx = tr.x1 + (tr.x2 - tr.x1) * tf;
      const ty = tr.y1 + (tr.y2 - tr.y1) * tf;
      const tg = ctx.createLinearGradient(tx, ty, px, py);
      tg.addColorStop(0, `rgba(${c},0)`); tg.addColorStop(1, `rgba(${c},0.88)`);
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(px, py);
      ctx.strokeStyle = tg; ctx.lineWidth = 2.5; ctx.stroke();

      ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${c},0.88)`; ctx.fill();
      return true;
    });

    if (pulses.length < PULSE_N && Math.random() < 0.03) spawnPulse();
    animId = requestAnimationFrame(frame);
  }

  function start() { cancelAnimationFrame(animId); setup(); frame(); }
  start();

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(start, 120); });
  new MutationObserver(start).observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });
})();
