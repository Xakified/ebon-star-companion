// Battle map engine, shared by the DM Suite's Battle Map tab, the player screen (the pop-out on the third
// monitor) and the Companion's Map tab on players' phones. It only draws and handles the mouse and fingers:
// the page that uses it loads and saves maps, tokens, fog and templates, and passes changes back in.
//
// Coordinates: "world" is the map picture's pixels. Tokens and templates are stored in grid cells, so they
// stay in place when the DM adjusts the grid. A cell (c, r) has its top-left corner at (ox + c*size, oy + r*size).
(function (g) {
"use strict";
const TAU = Math.PI * 2, CONE_HALF = Math.atan(0.5); // a 5e cone is as wide as it is far from its point
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FONT = "'Alegreya Sans', 'Segoe UI', system-ui, sans-serif";

const GRID_DEFAULT = { size: 70, ox: 0, oy: 0, show: true, color: "#000000", opacity: 0.35, ft: 5, diag: "5" };
const gridOf = m => Object.assign({}, GRID_DEFAULT, (m && m.grid) || {});
const SHAPES = { circle: "Sphere / circle", cone: "Cone", line: "Line", cube: "Cube" };
const PRESETS = [
  { name: "Fireball", shape: "circle", size: 20, color: "#e8572a" },
  { name: "Cone of Cold", shape: "cone", size: 60, color: "#5fb4e8" },
  { name: "Burning Hands", shape: "cone", size: 15, color: "#f08a24" },
  { name: "Lightning Bolt", shape: "line", size: 100, width: 5, color: "#a7b4ff" },
  { name: "Thunderwave", shape: "cube", size: 15, color: "#8a7cf0" },
  { name: "Spirit Guardians", shape: "circle", size: 15, color: "#f2d36b" },
  { name: "Shatter", shape: "circle", size: 10, color: "#c9a0f0" },
  { name: "Web", shape: "cube", size: 20, color: "#d8d8d8" },
  { name: "Fog Cloud", shape: "circle", size: 20, color: "#b9c4cf" },
  { name: "Hunger of Hadar", shape: "circle", size: 20, color: "#6b3fa0" },
  { name: "Breath weapon (cone)", shape: "cone", size: 30, color: "#6fcf5f" },
  { name: "Breath weapon (line)", shape: "line", size: 60, width: 5, color: "#6fcf5f" }
];
const KIND_RING = { pc: "#e2b85a", npc: "#a77be0", monster: "#d0453a" };
const initials = n => (String(n || "").trim().match(/[^\s'"()-]+/g) || ["?"]).slice(0, 2).map(w => w[0].toUpperCase()).join("");

// Distance in feet between two cell positions. "5": every square is 5 ft, diagonals too (2024 rules).
// "alt": diagonals alternate 5 and 10 ft. "euclid": straight-line distance.
function feet(a, b, grid) {
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y), ft = grid.ft || 5;
  if (grid.diag === "euclid") return Math.round(Math.hypot(dx, dy) * ft);
  const hi = Math.round(Math.max(dx, dy)), lo = Math.round(Math.min(dx, dy));
  return (grid.diag === "alt" ? hi + Math.floor(lo / 2) : hi) * ft;
}

// The outline of a template, in world pixels: { circle: [x, y, r] } or { poly: [[x, y]...] }.
function effectGeom(e, grid) {
  const cs = grid.size, o = [grid.ox + e.x * cs, grid.oy + e.y * cs], len = (e.size / (grid.ft || 5)) * cs, a = (e.angle || 0) * Math.PI / 180;
  const d = [Math.cos(a), Math.sin(a)], p = [-d[1], d[0]];
  const pt = (along, side) => [o[0] + d[0] * along + p[0] * side, o[1] + d[1] * along + p[1] * side];
  if (e.shape === "circle") return { o, circle: [o[0], o[1], len] };
  if (e.shape === "cone") return { o, poly: [o, pt(len, len / 2), pt(len, -len / 2)] };
  const w = e.shape === "line" ? ((e.width || 5) / (grid.ft || 5)) * cs : len;
  return { o, poly: [pt(0, w / 2), pt(len, w / 2), pt(len, -w / 2), pt(0, -w / 2)] };
}
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Cells a template covers: those whose centre is inside it.
function effectCells(e, grid) {
  const G = effectGeom(e, grid), cs = grid.size, out = [];
  const pts = G.circle ? [[G.circle[0] - G.circle[2], G.circle[1] - G.circle[2]], [G.circle[0] + G.circle[2], G.circle[1] + G.circle[2]]] : G.poly;
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  const c0 = Math.floor((Math.min(...xs) - grid.ox) / cs), c1 = Math.ceil((Math.max(...xs) - grid.ox) / cs);
  const r0 = Math.floor((Math.min(...ys) - grid.oy) / cs), r1 = Math.ceil((Math.max(...ys) - grid.oy) / cs);
  if ((c1 - c0) * (r1 - r0) > 40000) return out;
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
    const x = grid.ox + (c + 0.5) * cs, y = grid.oy + (r + 0.5) * cs;
    const inside = G.circle ? Math.hypot(x - G.circle[0], y - G.circle[1]) <= G.circle[2] + 0.01 * cs : inPoly(x, y, G.poly);
    if (inside) out.push([c, r]);
  }
  return out;
}

const imgCache = new Map();
function image(src, onload) {
  if (!src) return null;
  let e = imgCache.get(src);
  if (!e) {
    e = { img: new Image(), ok: false, bad: false, waiters: new Set() };
    e.img.decoding = "async";
    e.img.onload = () => { e.ok = true; e.waiters.forEach(f => f()); e.waiters.clear(); };
    e.img.onerror = () => { e.bad = true; e.waiters.forEach(f => f()); e.waiters.clear(); };
    e.img.src = src;
    imgCache.set(src, e);
    if (imgCache.size > 300) imgCache.delete(imgCache.keys().next().value);
  }
  if (!e.ok && !e.bad && onload) e.waiters.add(onload);
  return e;
}

/* ---------- the view ---------- */
// opts.mode: "dm" (everything, fog half see-through), "screen" (the players' big screen) or "player" (a phone).
// opts.canMove(token) -> may this device drag it; opts.on: callbacks, see emit() calls below.
function create(host, opts = {}) {
  const mode = opts.mode || "player", on = opts.on || {};
  const emit = (k, ...a) => { try { on[k] && on[k](...a); } catch (e) { console.error(e); } };
  const cv = document.createElement("canvas");
  cv.className = "vtt-canvas";
  cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;touch-action:none;user-select:none;-webkit-user-select:none;outline:none;display:block";
  cv.tabIndex = 0;
  host.appendChild(cv);
  const ctx = cv.getContext("2d");
  const st = {
    map: null, img: null, grid: gridOf(null), fog: { on: false, ops: [] }, tokens: [], effects: [],
    s: 1, tx: 0, ty: 0, fitted: false, W: 0, H: 0, dpr: 1,
    tool: "select", opt: {}, sel: null, drag: null, hover: null, poly: null,
    rulers: new Map(), ghosts: new Map(), pings: [], anim: new Map(), turn: null, prev: new Map(),
    fogCv: null, fogScale: 1, fogApplied: 0, fogLast: "", fogOn: false,
  };
  let raf = 0, dead = false;
  const draw = () => { if (!raf && !dead) raf = requestAnimationFrame(frame); };

  /* ----- geometry ----- */
  const cs = () => st.grid.size || 70;
  const toWorld = p => ({ x: (p.x - st.tx) / st.s, y: (p.y - st.ty) / st.s });
  const toCell = w => ({ x: (w.x - st.grid.ox) / cs(), y: (w.y - st.grid.oy) / cs() });
  const cellToWorld = c => ({ x: st.grid.ox + c.x * cs(), y: st.grid.oy + c.y * cs() });
  const snapCenter = c => ({ x: Math.floor(c.x) + 0.5, y: Math.floor(c.y) + 0.5 });
  const snapHalf = c => ({ x: Math.round(c.x * 2) / 2, y: Math.round(c.y * 2) / 2 });
  const mapW = () => (st.map && st.map.width) || (st.img && st.img.ok ? st.img.img.naturalWidth : 0) || 1000;
  const mapH = () => (st.map && st.map.height) || (st.img && st.img.ok ? st.img.img.naturalHeight : 0) || 1000;
  const tokPos = t => { const a = st.anim.get(t.id); if (!a) return { x: t.x, y: t.y }; const k = clamp((performance.now() - a.t0) / 220, 0, 1), e = 1 - Math.pow(1 - k, 3); return { x: a.fx + (t.x - a.fx) * e, y: a.fy + (t.y - a.fy) * e }; };
  const visibleTokens = () => st.tokens.filter(t => mode === "dm" || !t.hidden);

  function resize() {
    const r = host.getBoundingClientRect(), dpr = Math.min(g.devicePixelRatio || 1, 2.5);
    if (!r.width || !r.height) return;
    const ow = st.W, oh = st.H;
    st.W = r.width; st.H = r.height; st.dpr = dpr;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    if (!st.fitted && st.map) fit();
    else if (ow && oh) { st.tx += (st.W - ow) / 2; st.ty += (st.H - oh) / 2; }
    draw();
  }
  const ro = new ResizeObserver(resize); ro.observe(host);

  function fit(pad = 16) {
    if (!st.W) return;
    const w = mapW(), h = mapH();
    st.s = Math.min((st.W - pad * 2) / w, (st.H - pad * 2) / h);
    st.tx = (st.W - w * st.s) / 2; st.ty = (st.H - h * st.s) / 2; st.fitted = true; draw();
  }
  function zoomAt(p, k) {
    const s2 = clamp(st.s * k, 0.02, 12);
    st.tx = p.x - (p.x - st.tx) * (s2 / st.s); st.ty = p.y - (p.y - st.ty) * (s2 / st.s); st.s = s2; draw();
  }

  /* ----- fog ----- */
  // The fog is painted onto its own canvas (at most 2048 px across). New areas are added to it as they come in;
  // anything else (an undo, Cover all) repaints it from the list.
  const FOG = "#0a0912";
  function fogCanvas() {
    const w = mapW(), h = mapH(), sc = Math.min(1, 2048 / Math.max(w, h));
    if (!st.fogCv || st.fogCv.width !== Math.round(w * sc) || st.fogCv.height !== Math.round(h * sc)) {
      st.fogCv = document.createElement("canvas"); st.fogCv.width = Math.max(1, Math.round(w * sc)); st.fogCv.height = Math.max(1, Math.round(h * sc));
      st.fogScale = sc; st.fogApplied = -1;
    }
    return st.fogCv;
  }
  function applyFogOp(fc, op) {
    const c = fc.getContext("2d"), k = st.fogScale;
    c.save(); c.scale(k, k);
    c.globalCompositeOperation = op.m ? "destination-out" : "source-over";
    c.fillStyle = FOG; c.strokeStyle = FOG;
    if (op.k === "r") { const [x, y, w, h] = op.r; c.fillRect(x, y, w, h); }
    else if (op.k === "p" && op.p.length >= 6) { c.beginPath(); c.moveTo(op.p[0], op.p[1]); for (let i = 2; i < op.p.length; i += 2) c.lineTo(op.p[i], op.p[i + 1]); c.closePath(); c.fill(); }
    else if (op.k === "b" && op.p.length >= 2) {
      c.lineCap = "round"; c.lineJoin = "round"; c.lineWidth = op.w;
      if (op.p.length === 2) { c.beginPath(); c.arc(op.p[0], op.p[1], op.w / 2, 0, TAU); c.fill(); }
      else { c.beginPath(); c.moveTo(op.p[0], op.p[1]); for (let i = 2; i < op.p.length; i += 2) c.lineTo(op.p[i], op.p[i + 1]); c.stroke(); }
    }
    c.restore();
  }
  function syncFog() {
    const fog = st.fog, ops = fog.ops || [];
    if (!fog.on) { st.fogOn = false; return; }
    const fc = fogCanvas();
    const last = st.fogApplied > 0 ? JSON.stringify(ops[st.fogApplied - 1]) : "";
    if (!st.fogOn || st.fogApplied < 0 || ops.length < st.fogApplied || last !== st.fogLast) {
      const c = fc.getContext("2d"); c.globalCompositeOperation = "source-over"; c.clearRect(0, 0, fc.width, fc.height); c.fillStyle = FOG; c.fillRect(0, 0, fc.width, fc.height);
      st.fogApplied = 0;
    }
    for (let i = st.fogApplied; i < ops.length; i++) applyFogOp(fc, ops[i]);
    st.fogApplied = ops.length; st.fogLast = ops.length ? JSON.stringify(ops[ops.length - 1]) : ""; st.fogOn = true;
  }
  // Is this world point under fog (for players)?
  function fogged(x, y) {
    if (!st.fogOn || !st.fogCv) return false;
    const k = st.fogScale, px = Math.floor(x * k), py = Math.floor(y * k);
    if (px < 0 || py < 0 || px >= st.fogCv.width || py >= st.fogCv.height) return false;
    try { return st.fogCv.getContext("2d").getImageData(px, py, 1, 1).data[3] > 128; } catch (e) { return false; }
  }

  /* ----- drawing ----- */
  function frame(now) {
    raf = 0;
    if (dead) return;
    const { dpr } = st;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, st.W, st.H);
    ctx.fillStyle = mode === "dm" ? "#16131f" : "#0b0a10"; ctx.fillRect(0, 0, st.W, st.H);
    if (!st.map) {
      ctx.fillStyle = "#9d94b3"; ctx.font = `500 16px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(opts.emptyText || "No map", st.W / 2, st.H / 2); return;
    }
    let busy = false, glow = false;
    const W = mapW(), H = mapH(), s = st.s;
    ctx.save(); ctx.translate(st.tx, st.ty); ctx.scale(s, s);
    // map picture
    if (st.img && st.img.ok) { ctx.imageSmoothingQuality = "high"; ctx.drawImage(st.img.img, 0, 0, W, H); }
    else {
      ctx.fillStyle = "#2a2538"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#9d94b3"; ctx.font = `500 ${16 / s}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(st.img && st.img.bad ? "Couldn't load this map's picture" : "Loading map…", W / 2, H / 2);
    }
    // grid
    const G = st.grid, c = cs();
    if (G.show && c * s >= 5) {
      const x0 = Math.max(0, -st.tx / s), y0 = Math.max(0, -st.ty / s), x1 = Math.min(W, (st.W - st.tx) / s), y1 = Math.min(H, (st.H - st.ty) / s);
      ctx.beginPath();
      for (let k = Math.ceil((x0 - G.ox) / c), x; (x = G.ox + k * c) <= x1; k++) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let k = Math.ceil((y0 - G.oy) / c), y; (y = G.oy + k * c) <= y1; k++) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.globalAlpha = clamp(+G.opacity || 0.35, 0.05, 1); ctx.strokeStyle = G.color || "#000"; ctx.lineWidth = Math.max(1 / s, c * 0.012);
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    const toks = visibleTokens(), under = toks.filter(t => !t.character_id), over = toks.filter(t => t.character_id);
    under.forEach(t => { const r = drawToken(t, now); if (r === 1) busy = true; else if (r === 2) glow = true; });
    // fog: the DM sees through it, everyone else doesn't
    if (st.fogOn && st.fogCv) {
      ctx.globalAlpha = mode === "dm" ? 0.55 : 1;
      ctx.imageSmoothingEnabled = true; ctx.drawImage(st.fogCv, 0, 0, W, H); ctx.globalAlpha = 1;
    }
    st.effects.forEach(e => drawEffect(e));
    over.forEach(t => { const r = drawToken(t, now); if (r === 1) busy = true; else if (r === 2) glow = true; });
    // someone else dragging a token
    for (const [id, gh] of st.ghosts) {
      if (now > gh.until) { st.ghosts.delete(id); continue; }
      busy = true;
      const t = st.tokens.find(x => x.id === id); if (!t || (t.hidden && mode !== "dm")) continue;
      drawRuler(cellToWorld({ x: gh.from.x + t.size / 2, y: gh.from.y + t.size / 2 }), cellToWorld({ x: gh.x + t.size / 2, y: gh.y + t.size / 2 }), "", "#e2b85a", { x: gh.from.x, y: gh.from.y }, { x: gh.x, y: gh.y });
      drawToken(Object.assign({}, t, { x: gh.x, y: gh.y }), now, 0.7);
    }
    // a token being dragged here
    if (st.drag && st.drag.k === "token") {
      const d = st.drag, t = d.t;
      drawRuler(cellToWorld({ x: d.from.x + t.size / 2, y: d.from.y + t.size / 2 }), cellToWorld({ x: d.at.x + t.size / 2, y: d.at.y + t.size / 2 }), "", "#e2b85a", d.from, d.at);
      drawToken(Object.assign({}, t, { x: d.at.x, y: d.at.y }), now, 0.85);
    }
    // rulers
    for (const [k, r] of st.rulers) {
      if (r.until && now > r.until) { st.rulers.delete(k); continue; }
      if (r.until) busy = true;
      drawRuler(cellToWorld(r.a), cellToWorld(r.b), r.who || "", r.color || "#e2b85a", r.a, r.b);
    }
    // template being placed
    if (st.drag && st.drag.k === "template") drawEffect(st.drag.e, true);
    // fog tools
    if (st.drag && st.drag.k === "fogrect") drawBox(st.drag.r, st.opt.m ? "#7fd18b" : "#e2665a");
    if (st.drag && st.drag.k === "cell") drawBox(st.drag.r, "#e2b85a");
    if (st.poly && st.poly.length) {
      ctx.beginPath(); ctx.moveTo(st.poly[0], st.poly[1]);
      for (let i = 2; i < st.poly.length; i += 2) ctx.lineTo(st.poly[i], st.poly[i + 1]);
      if (st.hover) ctx.lineTo(st.hover.x, st.hover.y);
      ctx.strokeStyle = st.opt.m ? "#7fd18b" : "#e2665a"; ctx.lineWidth = 2 / s; ctx.setLineDash([6 / s, 4 / s]); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < st.poly.length; i += 2) { ctx.beginPath(); ctx.arc(st.poly[i], st.poly[i + 1], (i ? 3 : 6) / s, 0, TAU); ctx.fillStyle = ctx.strokeStyle; ctx.fill(); }
    }
    if (st.tool === "fog" && st.opt.k === "b" && st.hover) {
      ctx.beginPath(); ctx.arc(st.hover.x, st.hover.y, (st.opt.w || c) / 2, 0, TAU);
      ctx.strokeStyle = st.opt.m ? "#7fd18b" : "#e2665a"; ctx.lineWidth = 2 / s; ctx.stroke();
    }
    // pings
    st.pings = st.pings.filter(p => now - p.t0 < 1600);
    for (const p of st.pings) {
      busy = true;
      const k = (now - p.t0) / 1600;
      for (let i = 0; i < 2; i++) {
        const kk = clamp(k * 1.4 - i * 0.3, 0, 1); if (kk <= 0) continue;
        ctx.beginPath(); ctx.arc(p.x, p.y, (12 + 60 * kk) / s, 0, TAU);
        ctx.strokeStyle = p.color || "#e2b85a"; ctx.globalAlpha = 1 - kk; ctx.lineWidth = 4 / s; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (st.anim.size) { for (const [id, a] of st.anim) if (now - a.t0 > 240) st.anim.delete(id); busy = busy || st.anim.size > 0; }
    if (busy) draw();
    else if (glow && !st.glowT) st.glowT = setTimeout(() => { st.glowT = 0; draw(); }, 90); // the turn ring pulses at ~11 fps to spare phone batteries
  }

  function drawBox(r, color) {
    const s = st.s;
    ctx.fillStyle = color; ctx.globalAlpha = 0.18; ctx.fillRect(r[0], r[1], r[2], r[3]); ctx.globalAlpha = 1;
    ctx.strokeStyle = color; ctx.lineWidth = 2 / s; ctx.setLineDash([6 / s, 4 / s]); ctx.strokeRect(r[0], r[1], r[2], r[3]); ctx.setLineDash([]);
  }

  function drawToken(t, now, alpha = 1) {
    const p = tokPos(t), c = cs(), s = st.s;
    const x = st.grid.ox + (p.x + t.size / 2) * c, y = st.grid.oy + (p.y + t.size / 2) * c, r = (t.size * c) / 2 * 0.9;
    const ring = t.color || KIND_RING[t.kind] || KIND_RING.monster;
    const turn = st.turn && ((st.turn.cid && t.character_id === st.turn.cid) || (!st.turn.cid && st.turn.name && t.name === st.turn.name));
    ctx.save();
    ctx.globalAlpha = alpha * (t.hidden ? 0.45 : 1);
    // shadow
    ctx.beginPath(); ctx.arc(x, y + r * 0.06, r * 1.02, 0, TAU); ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fill();
    // face
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
    const im = image(t.image, draw);
    if (im && im.ok) {
      const iw = im.img.naturalWidth, ih = im.img.naturalHeight, k = Math.max((2 * r) / iw, (2 * r) / ih);
      ctx.drawImage(im.img, x - (iw * k) / 2, y - (ih * k) / 2, iw * k, ih * k);
    } else {
      ctx.fillStyle = t.kind === "pc" ? "#2a4f86" : t.kind === "npc" ? "#4b2f73" : "#6b2219"; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      ctx.fillStyle = "#fff"; ctx.font = `700 ${r * 0.8}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(initials(t.name), x, y + r * 0.04);
    }
    ctx.restore();
    // ring
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.lineWidth = Math.max(2 / s, r * 0.12); ctx.strokeStyle = ring;
    if (t.hidden) ctx.setLineDash([r * 0.25, r * 0.18]);
    ctx.stroke(); ctx.setLineDash([]);
    if (turn) {
      const k = (Math.sin(now / 260) + 1) / 2;
      ctx.beginPath(); ctx.arc(x, y, r * (1.12 + 0.06 * k), 0, TAU); ctx.lineWidth = Math.max(3 / s, r * 0.08); ctx.strokeStyle = "#ffd76a"; ctx.globalAlpha = alpha * (0.55 + 0.45 * k); ctx.stroke();
      ctx.globalAlpha = alpha;
    }
    if (st.sel === t.id) { ctx.beginPath(); ctx.arc(x, y, r * 1.18, 0, TAU); ctx.lineWidth = 2.5 / s; ctx.strokeStyle = "#ffffff"; ctx.setLineDash([5 / s, 4 / s]); ctx.stroke(); ctx.setLineDash([]); }
    // name
    if (c * s * t.size >= 30 && (opts.labels !== false)) {
      const fs = clamp(12, 9, 14) / s;
      ctx.font = `600 ${fs}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "top";
      const label = t.name || "", tw = ctx.measureText(label).width;
      if (label) {
        const ly = y + r + 3 / s;
        ctx.fillStyle = "rgba(10,9,18,.78)"; roundRect(x - tw / 2 - 5 / s, ly - 1 / s, tw + 10 / s, fs + 5 / s, 4 / s); ctx.fill();
        ctx.fillStyle = "#f3ead8"; ctx.fillText(label, x, ly + 1 / s);
      }
    }
    ctx.restore();
    return st.anim.has(t.id) ? 1 : turn ? 2 : 0;
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function drawEffect(e, preview) {
    const G = effectGeom(e, st.grid), c = cs(), s = st.s, col = e.color || "#e8572a";
    // the squares it hits
    ctx.fillStyle = col; ctx.globalAlpha = preview ? 0.3 : 0.24;
    for (const [cx, cy] of effectCells(e, st.grid)) ctx.fillRect(st.grid.ox + cx * c, st.grid.oy + cy * c, c, c);
    // the exact shape
    ctx.beginPath();
    if (G.circle) ctx.arc(G.circle[0], G.circle[1], G.circle[2], 0, TAU);
    else { ctx.moveTo(G.poly[0][0], G.poly[0][1]); for (const q of G.poly.slice(1)) ctx.lineTo(q[0], q[1]); ctx.closePath(); }
    ctx.globalAlpha = 0.12; ctx.fill(); ctx.globalAlpha = 1;
    ctx.lineWidth = 2.5 / s; ctx.strokeStyle = col; if (preview) ctx.setLineDash([8 / s, 5 / s]); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(G.o[0], G.o[1], 4 / s, 0, TAU); ctx.fillStyle = col; ctx.fill();
    // label
    const txt = `${e.label ? e.label + " · " : ""}${e.size} ft${e.shape === "line" ? ` × ${e.width || 5} ft` : ""}`;
    const fs = 12 / s; ctx.font = `700 ${fs}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const at = G.circle ? [G.o[0], G.o[1] - G.circle[2] - 10 / s] : [(G.poly.reduce((a, q) => a + q[0], 0)) / G.poly.length, (G.poly.reduce((a, q) => a + q[1], 0)) / G.poly.length];
    const tw = ctx.measureText(txt).width;
    ctx.fillStyle = "rgba(10,9,18,.8)"; roundRect(at[0] - tw / 2 - 6 / s, at[1] - fs / 2 - 4 / s, tw + 12 / s, fs + 8 / s, 5 / s); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillText(txt, at[0], at[1]);
  }

  function drawRuler(a, b, who, color, ca, cb) {
    const s = st.s, ft = feet(ca, cb, st.grid);
    ctx.strokeStyle = "rgba(10,9,18,.7)"; ctx.lineWidth = 6 / s; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 3 / s; ctx.setLineDash([10 / s, 6 / s]); ctx.stroke(); ctx.setLineDash([]);
    for (const q of [a, b]) { ctx.beginPath(); ctx.arc(q.x, q.y, 5 / s, 0, TAU); ctx.fillStyle = color; ctx.fill(); }
    const txt = `${ft} ft${who ? " · " + who : ""}`, fs = 14 / s;
    ctx.font = `700 ${fs}px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    const tw = ctx.measureText(txt).width, lx = b.x + 12 / s, ly = b.y - 16 / s;
    ctx.fillStyle = "rgba(10,9,18,.86)"; roundRect(lx - 6 / s, ly - fs / 2 - 5 / s, tw + 12 / s, fs + 10 / s, 6 / s); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5 / s; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.fillText(txt, lx, ly);
  }

  /* ----- hit tests ----- */
  function tokenAt(w) {
    const list = visibleTokens(), c = cs(), order = [...list.filter(t => !t.character_id), ...list.filter(t => t.character_id)].reverse();
    for (const t of order) {
      if (mode !== "dm" && !t.character_id && fogged(st.grid.ox + (t.x + t.size / 2) * c, st.grid.oy + (t.y + t.size / 2) * c)) continue;
      const x = st.grid.ox + (t.x + t.size / 2) * c, y = st.grid.oy + (t.y + t.size / 2) * c;
      if (Math.hypot(w.x - x, w.y - y) <= Math.max(t.size * c / 2, 10 / st.s)) return t;
    }
    return null;
  }
  // The top-left cell a token lands on when its centre is dropped at world point w. Small tokens snap to half cells.
  function snapToken(t, w) {
    const c = toCell(w), step = t.size < 1 ? t.size : 1;
    const x = Math.round((c.x - t.size / 2) / step) * step, y = Math.round((c.y - t.size / 2) / step) * step;
    const maxX = Math.ceil((mapW() - st.grid.ox) / cs()) - t.size, maxY = Math.ceil((mapH() - st.grid.oy) / cs()) - t.size;
    return { x: clamp(x, Math.floor(-st.grid.ox / cs()), Math.max(0, maxX)), y: clamp(y, Math.floor(-st.grid.oy / cs()), Math.max(0, maxY)) };
  }

  /* ----- pointer input ----- */
  const ptrs = new Map();
  let pinch = null, press = null, lastTap = 0;
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const freeSnap = e => e.altKey;
  function startPress(p) {
    clearTimeout(press && press.timer);
    press = { p, timer: setTimeout(() => { if (press && st.drag && st.drag.moved === false) { const w = toWorld(press.p); ping(w); st.drag = null; } press = null; }, 600) };
  }
  function cancelPress() { if (press) { clearTimeout(press.timer); press = null; } }
  function ping(w) { addPing(w.x, w.y, opts.pingColor); emit("ping", toCell(w)); }

  cv.addEventListener("contextmenu", e => e.preventDefault());
  cv.addEventListener("pointerdown", e => {
    if (!st.map) return;
    cv.focus({ preventScroll: true });
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    const p = pos(e);
    ptrs.set(e.pointerId, p);
    if (ptrs.size === 2) {
      // two fingers: pinch to zoom; whatever one finger was doing is dropped
      cancelPress();
      if (st.drag && st.drag.k === "token") emit("dragEnd", st.drag.t);
      st.drag = null;
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      draw(); return;
    }
    if (ptrs.size > 2) return;
    const w = toWorld(p);
    if (e.button === 1 || e.button === 2 || opts.panOnly || st.spaceHeld) { st.drag = { k: "pan", p, moved: true }; return; }
    const tool = st.tool;
    if (tool === "select") {
      const t = tokenAt(w);
      if (t && (opts.canMove ? opts.canMove(t) : mode === "dm")) {
        st.sel = mode === "dm" ? t.id : st.sel;
        st.drag = { k: "token", t, from: { x: t.x, y: t.y }, at: { x: t.x, y: t.y }, off: { x: w.x - (st.grid.ox + (t.x + t.size / 2) * cs()), y: w.y - (st.grid.oy + (t.y + t.size / 2) * cs()) }, moved: false, p };
        emit("select", t); draw(); return;
      }
      if (t) { emit("select", t); if (mode === "dm") st.sel = t.id; }
      st.drag = { k: "pan", p, moved: false, empty: !t }; startPress(p); draw(); return;
    }
    if (tool === "ruler") {
      const c = freeSnap(e) ? toCell(w) : snapCenter(toCell(w));
      st.drag = { k: "ruler", a: c, b: c, moved: false };
      st.rulers.set("me", { a: c, b: c, color: opts.rulerColor || "#e2b85a" }); emit("measure", { a: c, b: c }); draw(); return;
    }
    if (tool === "template") {
      const o = st.opt, c = freeSnap(e) ? toCell(w) : snapHalf(toCell(w));
      st.drag = { k: "template", e: { shape: o.shape || "circle", size: +o.size || 20, width: +o.width || 5, color: o.color || "#e8572a", label: o.label || "", x: c.x, y: c.y, angle: st.lastAngle || 0 }, p, moved: false, free: freeSnap(e) };
      draw(); return;
    }
    if (tool === "ping") { ping(w); return; }
    if (tool === "fog" && mode === "dm") {
      const o = st.opt;
      if (o.k === "b") {
        const op = { m: o.m ? 1 : 0, k: "b", w: Math.round(o.w || cs()), p: [Math.round(w.x), Math.round(w.y)] };
        st.drag = { k: "fogbrush", op };
        if (!st.fog.on) { st.fog = { on: true, ops: [] }; syncFog(); }
        applyFogOp(fogCanvas(), op); draw(); return;
      }
      if (o.k === "r") { const a = (o.snap !== false && !freeSnap(e)) ? snapLine(w) : w; st.drag = { k: "fogrect", a, r: [a.x, a.y, 0, 0], free: freeSnap(e) }; draw(); return; }
      if (o.k === "p") {
        const q = (o.snap !== false && !freeSnap(e)) ? snapLine(w) : w;
        if (st.poly && st.poly.length >= 6 && Math.hypot(q.x - st.poly[0], q.y - st.poly[1]) * st.s < 14) { finishPoly(); return; }
        st.poly = (st.poly || []).concat([Math.round(q.x), Math.round(q.y)]); draw(); return;
      }
    }
    if (tool === "cell" && mode === "dm") { st.drag = { k: "cell", a: w, r: [w.x, w.y, 0, 0] }; draw(); return; }
    st.drag = { k: "pan", p, moved: false };
  });
  // Grid line intersections, for rectangles and outlines that follow the walls of a room.
  function snapLine(w) { const c = toCell(w); return cellToWorld({ x: Math.round(c.x), y: Math.round(c.y) }); }
  function finishPoly() {
    if (st.poly && st.poly.length >= 6) commitFog({ m: st.opt.m ? 1 : 0, k: "p", p: st.poly });
    st.poly = null; draw();
  }
  function commitFog(op) {
    const fog = { on: true, ops: (st.fog.on ? st.fog.ops || [] : []).concat([op]) };
    if (!st.fog.on) { st.fog = { on: true, ops: [] }; syncFog(); }
    st.fog = fog; syncFog(); emit("fog", fog); draw();
  }

  cv.addEventListener("pointermove", e => {
    const p = pos(e);
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      st.tx += m.x - pinch.m.x; st.ty += m.y - pinch.m.y;
      if (pinch.d > 0) zoomAt(m, d / pinch.d);
      pinch.d = d; pinch.m = m; draw(); return;
    }
    const w = toWorld(p);
    if (e.pointerType === "mouse") { st.hover = w; if (st.tool === "fog" || st.poly) draw(); }
    const d = st.drag; if (!d) return;
    if (d.p && Math.hypot(p.x - d.p.x, p.y - d.p.y) > 6) { if (!d.moved) cancelPress(); d.moved = true; }
    if (d.k === "pan") { if (d.moved || d.last) { const l = d.last || d.p; st.tx += p.x - l.x; st.ty += p.y - l.y; d.last = p; draw(); } return; }
    if (d.k === "token") {
      if (!d.moved) return;
      const at = snapToken(d.t, { x: w.x - d.off.x, y: w.y - d.off.y });
      if (at.x !== d.at.x || at.y !== d.at.y) { d.at = at; emit("drag", d.t, at, d.from); }
      draw(); return;
    }
    if (d.k === "ruler") {
      const c = freeSnap(e) ? toCell(w) : snapCenter(toCell(w));
      if (c.x !== d.b.x || c.y !== d.b.y) { d.b = c; d.moved = true; st.rulers.set("me", { a: d.a, b: c, color: opts.rulerColor || "#e2b85a" }); emit("measure", { a: d.a, b: c }); draw(); }
      return;
    }
    if (d.k === "template") {
      const ef = d.e, c = toCell(w);
      if (ef.shape === "circle") { const q = freeSnap(e) ? c : snapHalf(c); ef.x = q.x; ef.y = q.y; }
      else if (Math.hypot(c.x - ef.x, c.y - ef.y) > 0.3) {
        let a = Math.atan2(c.y - ef.y, c.x - ef.x) * 180 / Math.PI;
        const step = freeSnap(e) ? 1 : ef.shape === "cube" ? 45 : 15;
        ef.angle = (Math.round(a / step) * step + 360) % 360; st.lastAngle = ef.angle;
      }
      draw(); return;
    }
    if (d.k === "fogbrush") {
      const op = d.op, n = op.p.length, lx = op.p[n - 2], ly = op.p[n - 1];
      if (Math.hypot(w.x - lx, w.y - ly) < Math.max(2, op.w / 6)) return;
      op.p.push(Math.round(w.x), Math.round(w.y));
      applyFogOp(fogCanvas(), { m: op.m, k: "b", w: op.w, p: [lx, ly, Math.round(w.x), Math.round(w.y)] }); draw(); return;
    }
    if (d.k === "fogrect" || d.k === "cell") {
      const b = d.k === "fogrect" && st.opt.snap !== false && !freeSnap(e) ? snapLine(w) : w;
      d.r = [Math.min(d.a.x, b.x), Math.min(d.a.y, b.y), Math.abs(b.x - d.a.x), Math.abs(b.y - d.a.y)]; draw(); return;
    }
  });

  function endPointer(e) {
    ptrs.delete(e.pointerId);
    if (pinch) { if (ptrs.size < 2) pinch = null; return; }
    cancelPress();
    const d = st.drag; st.drag = null;
    if (!d) return;
    const p = pos(e), w = toWorld(p);
    if (d.k === "pan") {
      if (!d.moved && e.type === "pointerup") {
        if (d.empty && mode === "dm" && st.tool === "select") { st.sel = null; emit("select", null); }
        const now = performance.now();
        if (now - lastTap < 320 && d.empty) ping(w);
        lastTap = now;
      }
      draw(); return;
    }
    if (d.k === "token") {
      if (d.moved && e.type === "pointerup" && (d.at.x !== d.from.x || d.at.y !== d.from.y)) {
        d.t.x = d.at.x; d.t.y = d.at.y; st.prev.set(d.t.id, { x: d.at.x, y: d.at.y });
        emit("move", d.t, d.at, d.from);
      } else emit("dragEnd", d.t);
      draw(); return;
    }
    if (d.k === "ruler") {
      const r = st.rulers.get("me"); if (r) r.until = performance.now() + 2500;
      emit("measure", null); draw(); return;
    }
    if (d.k === "template") { if (e.type === "pointerup") emit("template", Object.assign({}, d.e)); draw(); return; }
    if (d.k === "fogbrush") { commitFog(d.op); return; }
    if (d.k === "fogrect") { const r = d.r.map(Math.round); if (r[2] > 2 && r[3] > 2) commitFog({ m: st.opt.m ? 1 : 0, k: "r", r }); else draw(); return; }
    if (d.k === "cell") { if (d.r[2] > 4 && d.r[3] > 4) emit("cell", d.r.slice()); draw(); return; }
  }
  cv.addEventListener("pointerup", endPointer);
  cv.addEventListener("pointercancel", endPointer);
  cv.addEventListener("pointerleave", () => { if (st.hover) { st.hover = null; if (st.tool === "fog") draw(); } });
  cv.addEventListener("dblclick", e => { if (st.poly) { e.preventDefault(); finishPoly(); } });
  cv.addEventListener("wheel", e => {
    if (!st.map) return;
    e.preventDefault();
    const k = e.ctrlKey ? Math.exp(-e.deltaY / 100) : Math.exp(-e.deltaY / 500);
    zoomAt(pos(e), k);
  }, { passive: false });
  cv.addEventListener("keydown", e => {
    if (e.key === " ") { st.spaceHeld = true; e.preventDefault(); }
    if (e.key === "Escape") { if (st.poly) { st.poly = null; draw(); } else if (st.drag) { st.drag = null; draw(); } }
    if (e.key === "Enter" && st.poly) finishPoly();
  });
  cv.addEventListener("keyup", e => { if (e.key === " ") st.spaceHeld = false; });

  function addPing(x, y, color) { st.pings.push({ x, y, color, t0: performance.now() }); draw(); }

  /* ----- what the page calls ----- */
  const api = {
    canvas: cv,
    setMap(map, url) {
      const same = st.map && map && st.map.id === map.id;
      st.map = map || null;
      st.grid = gridOf(map);
      if (!same) { st.fitted = false; st.sel = null; st.rulers.clear(); st.ghosts.clear(); st.poly = null; st.fogApplied = -1; st.fogCv = null; }
      if (map) {
        const want = url || "";
        if (!st.img || st.img.src !== want) { st.img = want ? image(want, () => { if (!st.fitted) fit(); else draw(); }) : null; if (st.img) st.img.src = want; }
        st.fog = map.fog && map.fog.on ? { on: true, ops: map.fog.ops || [] } : { on: false, ops: [] };
        syncFog();
        if (!st.fitted && st.W) fit();
      }
      draw();
    },
    setGrid(grid) { st.grid = Object.assign({}, GRID_DEFAULT, grid || {}); draw(); },
    setFog(fog) { st.fog = fog && fog.on ? { on: true, ops: fog.ops || [] } : { on: false, ops: [] }; syncFog(); draw(); },
    setTokens(list) {
      const now = performance.now(), old = new Map(st.tokens.map(t => [t.id, t]));
      st.tokens = (list || []).map(t => Object.assign({}, t, { size: +t.size || 1, x: +t.x || 0, y: +t.y || 0 }));
      for (const t of st.tokens) {
        const o = old.get(t.id), mine = st.prev.get(t.id);
        if (o && (o.x !== t.x || o.y !== t.y) && !(mine && mine.x === t.x && mine.y === t.y)) {
          const pp = tokPos(o); st.anim.set(t.id, { fx: pp.x, fy: pp.y, t0: now });
        }
        st.prev.delete(t.id);
        if (st.ghosts.has(t.id) && o && (o.x !== t.x || o.y !== t.y)) st.ghosts.delete(t.id);
      }
      if (st.drag && st.drag.k === "token") { const t = st.tokens.find(x => x.id === st.drag.t.id); if (t) st.drag.t = t; else st.drag = null; }
      draw();
    },
    setEffects(list) { st.effects = list || []; draw(); },
    setTool(tool, opt) { if (st.poly && tool !== "fog") st.poly = null; st.tool = tool || "select"; st.opt = Object.assign({}, opt || {}); cv.style.cursor = { select: "default", ruler: "crosshair", template: "crosshair", ping: "pointer", fog: "crosshair", cell: "crosshair" }[st.tool] || "default"; draw(); },
    setTurn(t) { st.turn = t && (t.cid || t.name) ? t : null; draw(); },
    select(id) { st.sel = id || null; draw(); },
    // Live things from other devices.
    remote(m) {
      if (!m || !st.map) return;
      const now = performance.now();
      if (m.t === "ruler") { if (m.a && m.b) st.rulers.set("r:" + (m.from || "?"), { a: m.a, b: m.b, who: m.who || "", color: m.color || "#7fc3ff", until: m.done ? now + 2500 : now + 8000 }); else { const r = st.rulers.get("r:" + (m.from || "?")); if (r) r.until = now + 2500; } }
      else if (m.t === "drag" && m.id) { if (m.end) st.ghosts.delete(m.id); else st.ghosts.set(m.id, { x: m.x, y: m.y, from: m.fromCell || { x: m.x, y: m.y }, until: now + 6000 }); }
      else if (m.t === "ping") { const w = cellToWorld(m); addPing(w.x, w.y, m.color); return; }
      draw();
    },
    fit, draw,
    resize,
    cancel() { st.poly = null; st.drag = null; draw(); },
    finishPoly,
    // The visible area, in cells, to hand to another screen. setView() shows the same area there.
    getView() { const c = toCell(toWorld({ x: st.W / 2, y: st.H / 2 })); return { x: c.x, y: c.y, w: st.W / st.s / cs(), h: st.H / st.s / cs() }; },
    setView(v) {
      if (!v || !st.W) return;
      const k = Math.min(st.W / (v.w * cs()), st.H / (v.h * cs()));
      st.s = clamp(k, 0.02, 12); const w = cellToWorld(v);
      st.tx = st.W / 2 - w.x * st.s; st.ty = st.H / 2 - w.y * st.s; st.fitted = true; draw();
    },
    centerOn(t, minCellPx = 56) {
      if (!t) return;
      if (cs() * st.s < minCellPx) st.s = minCellPx / cs();
      const w = cellToWorld({ x: t.x + t.size / 2, y: t.y + t.size / 2 });
      st.tx = st.W / 2 - w.x * st.s; st.ty = st.H / 2 - w.y * st.s; st.fitted = true; draw();
    },
    // A free spot near the middle of the view for a new token (no other token on it).
    freeCell(size = 1, taken = []) {
      const mid = toCell(toWorld({ x: st.W / 2, y: st.H / 2 })), used = new Set();
      for (const t of st.tokens.concat(taken)) for (let i = 0; i < Math.max(1, t.size); i++) for (let j = 0; j < Math.max(1, t.size); j++) used.add(`${Math.floor(t.x) + i},${Math.floor(t.y) + j}`);
      const cols = Math.max(1, Math.floor((mapW() - st.grid.ox) / cs())), rows = Math.max(1, Math.floor((mapH() - st.grid.oy) / cs()));
      const cx = clamp(Math.floor(mid.x), 0, cols - 1), cy = clamp(Math.floor(mid.y), 0, rows - 1);
      const free = (x, y) => { for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) if (used.has(`${x + i},${y + j}`) || x + i >= cols || y + j >= rows || x < 0 || y < 0) return false; return true; };
      for (let r = 0; r < 40; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (free(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
      }
      return { x: cx, y: cy };
    },
    get busy() { return !!st.drag || ptrs.size > 0; },
    get scale() { return st.s; },
    destroy() { dead = true; ro.disconnect(); cancelAnimationFrame(raf); cv.remove(); },
  };
  resize();
  return api;
}


/* ---------- keeping a view in step with the campaign ---------- */
// Loads the map (the shown one, or o.pickMap's choice), its tokens and templates, follows changes, and passes
// rulers, dragging and pings between devices. o: { be, cid, view, mode, user, who, color, pickMap(maps), patch(map),
// onChange(state), onView(msg), onError(err) }.
function session(o) {
  const S = { maps: [], map: null, tokens: [], effects: [], url: "", err: "", turn: null, loaded: false };
  const dm = o.mode === "dm", me = (o.user || "anon") + ":" + Math.random().toString(36).slice(2, 7);
  let live = null, closed = false, want = new Set(), timer = null, busy = false, poll = null;
  const changed = () => { try { o.onChange && o.onChange(S); } catch (e) { console.error(e); } };
  const setupMsg = e => /battle_maps|map_tokens|map_effects|move_token|schema cache|does not exist|bucket not found/i.test((e && e.message) || "")
    ? "The battle map needs one more setup step: run fix-09-battle-maps.sql from the Companion repo in the Supabase SQL Editor." : (e && e.message) || String(e);
  function send(m) { if (live && !closed) try { live.send(Object.assign({ map: S.map ? S.map.id : null, from: me }, m)); } catch (e) {} }
  const poke = what => send({ t: "poke", what });
  const showMap = () => o.view.setMap(S.map ? (o.patch ? o.patch(S.map) : S.map) : null, S.url);

  async function loadMaps() {
    S.maps = await o.be.listMaps(o.cid);
    const m = (o.pickMap ? o.pickMap(S.maps) : S.maps.find(x => x.shown)) || null;
    const switched = (m && m.id) !== (S.map && S.map.id);
    S.map = m;
    if (m && m.image_path) S.url = await o.be.mapImageUrl(m.image_path).catch(e => { console.warn(e); return ""; });
    else S.url = "";
    if (switched) { S.tokens = []; S.effects = []; o.view.setTokens([]); o.view.setEffects([]); }
    showMap();
    return switched;
  }
  async function loadTokens() {
    if (!S.map) { S.tokens = []; o.view.setTokens([]); return; }
    const id = S.map.id, list = await o.be.listTokens(o.cid, id);
    if (!S.map || S.map.id !== id) return;
    S.tokens = (list || []).filter(t => dm || !t.hidden); o.view.setTokens(S.tokens);
  }
  async function loadEffects() {
    if (!S.map) { S.effects = []; o.view.setEffects([]); return; }
    const id = S.map.id, list = await o.be.listEffects(o.cid, id);
    if (!S.map || S.map.id !== id) return;
    S.effects = list || []; o.view.setEffects(S.effects);
  }
  async function run() {
    if (busy || closed) return;
    busy = true;
    const w = want; want = new Set();
    try {
      let all = w.has("all") || !S.loaded;
      if (all || w.has("maps")) { if (await loadMaps()) all = true; }
      await Promise.all([all || w.has("tokens") ? loadTokens() : null, all || w.has("effects") ? loadEffects() : null]);
      S.err = ""; S.loaded = true;
    } catch (e) { console.warn(e); S.err = setupMsg(e); }
    busy = false;
    changed();
    if (want.size) soon();
  }
  function soon(what, ms = 120) { if (what) want.add(what); clearTimeout(timer); timer = setTimeout(run, ms); }
  function onEvent(ev) {
    if (closed || !ev) return;
    if (ev.live) {
      const m = ev.live;
      if (m.from === me) return;
      if (m.t === "poke") { soon(m.what || "all"); return; }
      if (m.t === "turn") { S.turn = m.cid || m.name ? { cid: m.cid || null, name: m.name || "" } : null; o.view.setTurn(S.turn); changed(); return; }
      if (m.t === "view") { o.onView && o.onView(m); return; }
      if (m.map && S.map && m.map !== S.map.id) return;
      o.view.remote(m);
      return;
    }
    if (ev.table === "battle_maps") soon("maps");
    else if (ev.table === "map_tokens") soon("tokens");
    else if (ev.table === "map_effects") soon("effects");
    else if (ev.table === "resync") soon("all");
  }
  try { live = o.be.mapLive ? o.be.mapLive(o.cid, onEvent) : null; } catch (e) { console.warn(e); }
  poll = setInterval(() => soon("all"), 45000);
  const vis = () => { if (document.visibilityState === "visible") soon("all"); };
  document.addEventListener("visibilitychange", vis);
  soon("all", 0);

  let dragAt = 0, rulerAt = 0, rulerQ = null;
  const api = {
    state: S, send, poke, reload: what => soon(what || "all"), showMap,
    async moveToken(t, at, from) {
      const local = S.tokens.find(x => x.id === t.id);
      if (!t.hidden) send({ t: "drag", id: t.id, end: true });
      try {
        if (dm) await o.be.saveToken(o.cid, { x: at.x, y: at.y }, t.id); else await o.be.moveToken(t.id, at.x, at.y);
        if (local) { local.x = at.x; local.y = at.y; }
        poke("tokens");
      } catch (e) {
        o.onError && o.onError(new Error(setupMsg(e)));
        if (local) { local.x = from.x; local.y = from.y; }
        o.view.setTokens(S.tokens); soon("tokens");
      }
    },
    drag(t, at, from) {
      if (t.hidden) return;
      const now = Date.now(); if (now - dragAt < 70) return; dragAt = now;
      send({ t: "drag", id: t.id, x: at.x, y: at.y, fromCell: from });
    },
    dragEnd(t) { if (!t.hidden) send({ t: "drag", id: t.id, end: true }); },
    measure(r) {
      if (!r) { clearTimeout(rulerQ); send({ t: "ruler", done: true }); return; }
      const now = Date.now(), go = () => { rulerAt = Date.now(); send({ t: "ruler", a: r.a, b: r.b, who: o.who || "", color: o.color || "" }); };
      clearTimeout(rulerQ);
      if (now - rulerAt > 60) go(); else rulerQ = setTimeout(go, 60);
    },
    ping(c) { send({ t: "ping", x: c.x, y: c.y, color: o.color || "" }); },
    async addTemplate(e) {
      if (!S.map) return;
      const row = { map_id: S.map.id, shape: e.shape, x: +e.x.toFixed(3), y: +e.y.toFixed(3), angle: Math.round(e.angle || 0), size: +e.size || 20, width: +e.width || 5, color: e.color || "#e8572a", label: String(e.label || "").slice(0, 60) };
      const tmp = Object.assign({ id: "tmp-" + Date.now(), owner: o.user }, row);
      S.effects = S.effects.concat([tmp]); o.view.setEffects(S.effects); changed();
      try { const r = await o.be.addEffect(o.cid, row); S.effects = S.effects.map(x => x === tmp ? r || tmp : x); poke("effects"); }
      catch (err) { S.effects = S.effects.filter(x => x !== tmp); o.onError && o.onError(new Error(setupMsg(err))); }
      o.view.setEffects(S.effects); changed();
    },
    async removeTemplate(id) {
      const was = S.effects; S.effects = S.effects.filter(x => x.id !== id); o.view.setEffects(S.effects); changed();
      try { await o.be.deleteEffect(id); poke("effects"); } catch (e) { S.effects = was; o.view.setEffects(S.effects); changed(); o.onError && o.onError(e); }
    },
    async clearTemplates(mineOnly) {
      if (!S.map) return;
      const was = S.effects; S.effects = mineOnly ? S.effects.filter(x => x.owner !== o.user) : []; o.view.setEffects(S.effects); changed();
      try { await o.be.clearEffects(o.cid, S.map.id, mineOnly); poke("effects"); } catch (e) { S.effects = was; o.view.setEffects(S.effects); changed(); o.onError && o.onError(e); }
    },
    close() { closed = true; clearTimeout(timer); clearInterval(poll); document.removeEventListener("visibilitychange", vis); try { live && live.close(); } catch (e) {} },
    setupMsg,
  };
  return api;
}

g.VTT = { create, session, PRESETS, SHAPES, GRID_DEFAULT, gridOf, feet, effectCells, initials };
})(typeof window !== "undefined" ? window : globalThis);
