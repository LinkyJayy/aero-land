// Shared Frutiger Aero overlay + canvas helpers for the 2D mini-games.
import { el } from '../util.js';

export function makeOverlay(title, ctx, { canvas = true, transparent = false } = {}) {
  const info = el('div', { class: 'glass' }, '');
  const close = el('button', { class: 'btn red small pe', onclick: () => ctx.close() }, '✕ Exit');
  const head = el('div', { id: 'mg-head', class: 'pe' }, el('div', { class: 'glass' }, title), info, close);
  const root = el('div', { id: 'mg', class: transparent ? 'overlay3d' : '' }, head);
  let cv = null, g = null;
  if (canvas) { cv = el('canvas', { id: 'mg-canvas' }); root.append(cv); g = cv.getContext('2d'); }
  ctx.root.append(root);

  const o = {
    root, cv, g, head, W: 0, H: 0, px: 1,
    setInfo(html) { info.innerHTML = html; },
    center(html, buttons = []) {
      o.hideCenter();
      const box = el('div', { class: 'mg-center glass pe' });
      box.innerHTML = html;
      const row = el('div', { class: 'menu-row', style: 'justify-content:center' });
      for (const [label, cls, fn] of buttons) row.append(el('button', { class: 'btn ' + cls, onclick: fn }, label));
      box.append(row);
      root.append(box);
      o.centerEl = box;
      return box;
    },
    hideCenter() { o.centerEl?.remove(); o.centerEl = null; },
    resize() {
      if (!cv) return;
      o.px = ctx.pixelSize();
      const r = cv.getBoundingClientRect();
      o.W = r.width; o.H = r.height;
      cv.width = Math.max(1, Math.round(r.width / o.px));
      cv.height = Math.max(1, Math.round(r.height / o.px));
      g.setTransform(1 / o.px, 0, 0, 1 / o.px, 0, 0);
      g.imageSmoothingEnabled = false;
      cv.style.imageRendering = 'pixelated';
    },
    // pointer position in CSS pixels relative to the canvas
    pos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; },
    destroy() { root.remove(); },
  };
  if (cv) { o.resize(); o.onResize = () => o.resize(); addEventListener('resize', o.onResize); }
  const destroy = o.destroy;
  o.destroy = () => { if (o.onResize) removeEventListener('resize', o.onResize); destroy(); };
  return o;
}

export function skyBackground(g, W, H, t = 0) {
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#1d8fff'); grd.addColorStop(0.55, '#9fe6ff'); grd.addColorStop(0.56, '#8ff06a'); grd.addColorStop(1, '#3fbf1f');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.85)';
  for (let i = 0; i < 5; i++) {
    const x = ((i * 260 + t * 12) % (W + 300)) - 150, y = 40 + (i % 3) * 50;
    cloud(g, x, y, 1 + (i % 2) * 0.4);
  }
}

export function cloud(g, x, y, s = 1) {
  g.beginPath();
  for (const [dx, dy, r] of [[0, 0, 26], [28, -12, 30], [58, 0, 24], [30, 8, 24]]) g.moveTo(x + dx * s + r * s, y + dy * s), g.arc(x + dx * s, y + dy * s, r * s, 0, 7);
  g.fill();
}

export function glossyBubble(g, x, y, r, tint = 'rgba(120,220,255,.35)', ring = 'rgba(255,255,255,.85)') {
  const grd = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
  grd.addColorStop(0, 'rgba(255,255,255,.95)');
  grd.addColorStop(0.25, 'rgba(255,255,255,.2)');
  grd.addColorStop(0.8, tint);
  grd.addColorStop(1, ring);
  g.fillStyle = grd;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = ring; g.lineWidth = Math.max(1, r * 0.06);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.beginPath(); g.ellipse(x - r * 0.35, y - r * 0.45, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2); g.fill();
}

export function glossyText(g, text, x, y, size, color = '#ffffff', stroke = '#0a79d1') {
  g.font = `900 ${size}px Segoe UI, Nunito, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = size * 0.16; g.strokeStyle = stroke; g.lineJoin = 'round';
  g.strokeText(text, x, y);
  g.fillStyle = color; g.fillText(text, x, y);
}
