// Aero Darts — 3 rounds of 3 darts on a glossy aqua/lime board. Drag to aim, release to throw.
import { makeOverlay, glossyText } from './common.js';

const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const TOTAL = 9;

export class Darts {
  constructor(ctx) { this.ctx = ctx; }

  start() {
    const o = this.o = makeOverlay('🎯 Aero Darts', this.ctx);
    this.darts = []; this.score = 0; this.thrown = 0; this.popups = [];
    this.aim = null; this.flying = null; this.t = 0; this.holdT = 0;
    this.best = this.ctx.best('darts');
    const cv = o.cv;
    cv.addEventListener('pointerdown', (e) => {
      if (this.flying || this.thrown >= TOTAL || o.centerEl) return;
      cv.setPointerCapture(e.pointerId);
      this.aim = this.aimPoint(o.pos(e), e.pointerType);
      this.holdT = 0;
    });
    cv.addEventListener('pointermove', (e) => { if (this.aim) this.aim = { ...this.aimPoint(o.pos(e), e.pointerType), base: true }; });
    cv.addEventListener('pointerup', () => { if (this.aim) this.throw(); });
    this.updateInfo();
    o.center('<h2>🎯 Aero Darts</h2><p>Press and drag to aim — your hand wobbles!<br>Release to throw. 9 darts, highest score wins.</p>', [['Play', 'green', () => o.hideCenter()]]);
  }

  aimPoint(p, type) { return { x: p.x, y: p.y - (type === 'touch' ? 70 : 0) }; }

  board() { const o = this.o; return { cx: o.W / 2, cy: o.H * 0.47, R: Math.min(o.W, o.H) * 0.36 }; }

  wobble() {
    const a = 6 + Math.min(this.holdT, 3) * 4;
    return { x: Math.sin(this.t * 2.3) * a + Math.sin(this.t * 5.1) * a * 0.4, y: Math.cos(this.t * 1.9) * a + Math.sin(this.t * 4.3) * a * 0.4 };
  }

  throw() {
    const w = this.wobble();
    const target = { x: this.aim.x + w.x + (Math.random() - 0.5) * 6, y: this.aim.y + w.y + (Math.random() - 0.5) * 6 };
    this.flying = { from: { x: this.o.W / 2, y: this.o.H + 40 }, to: target, t: 0 };
    this.aim = null;
  }

  scoreAt(x, y) {
    const { cx, cy, R } = this.board();
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) / R;
    if (d > 1) return [0, 'Miss'];
    if (d < 0.037) return [50, 'BULLSEYE!'];
    if (d < 0.094) return [25, 'Bull 25'];
    let ang = Math.atan2(dx, -dy); if (ang < 0) ang += Math.PI * 2;
    const n = ORDER[Math.floor(((ang + Math.PI / 20) % (Math.PI * 2)) / (Math.PI / 10))];
    if (d > 0.953) return [n * 2, `Double ${n}!`];
    if (d > 0.582 && d < 0.629) return [n * 3, `Triple ${n}!`];
    return [n, String(n)];
  }

  updateInfo() {
    const round = Math.min(3, Math.floor(this.thrown / 3) + 1);
    this.o.setInfo(`Round ${round}/3 · Darts ${TOTAL - this.thrown} · Score <b>${this.score}</b>${this.best ? ` · Best ${this.best}` : ''}`);
  }

  update(dt) {
    this.t += dt;
    if (this.aim) this.holdT += dt;
    const { o } = this, g = o.g, W = o.W, H = o.H;
    if (this.flying) {
      const f = this.flying;
      f.t += dt / 0.32;
      if (f.t >= 1) {
        const [pts, label] = this.scoreAt(f.to.x, f.to.y);
        this.darts.push({ ...f.to });
        this.score += pts; this.thrown++;
        this.popups.push({ x: f.to.x, y: f.to.y - 20, text: pts ? `+${pts} ${label.length > 3 ? label : ''}` : 'Miss', t: 0 });
        this.flying = null;
        this.updateInfo();
        if (this.thrown % 3 === 0 && this.thrown < TOTAL) setTimeout(() => { this.darts = []; }, 900);
        if (this.thrown >= TOTAL) setTimeout(() => this.finish(), 900);
      }
    }
    // background: aero wall
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#0d6fd6'); grd.addColorStop(0.6, '#4fc3ff'); grd.addColorStop(1, '#bff3ff');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 12; i++) {
      g.fillStyle = 'rgba(255,255,255,.08)';
      g.beginPath(); g.arc((i * 137 + this.t * 10) % W, H - ((i * 71 + this.t * 20) % H), 10 + (i % 4) * 8, 0, 7); g.fill();
    }
    this.drawBoard(g);
    for (const d of this.darts) this.drawDart(g, d.x, d.y, 1);
    if (this.flying) {
      const f = this.flying, k = f.t, e = 1 - (1 - k) * (1 - k);
      const x = f.from.x + (f.to.x - f.from.x) * e, y = f.from.y + (f.to.y - f.from.y) * e - Math.sin(k * Math.PI) * 60;
      this.drawDart(g, x, y, 2.4 - 1.4 * k);
    }
    if (this.aim) {
      const w = this.wobble(), x = this.aim.x + w.x, y = this.aim.y + w.y;
      g.strokeStyle = '#ffffff'; g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, 14, 0, 7); g.moveTo(x - 22, y); g.lineTo(x + 22, y); g.moveTo(x, y - 22); g.lineTo(x, y + 22); g.stroke();
      g.strokeStyle = '#ff3355'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 14, 0, 7); g.stroke();
    }
    for (const p of this.popups) {
      p.t += dt; p.y -= dt * 40;
      g.globalAlpha = Math.max(0, 1 - p.t / 1.3);
      glossyText(g, p.text, p.x, p.y, 26);
      g.globalAlpha = 1;
    }
    this.popups = this.popups.filter((p) => p.t < 1.3);
  }

  drawBoard(g) {
    const { cx, cy, R } = this.board();
    g.save();
    g.shadowColor = 'rgba(0,40,100,.5)'; g.shadowBlur = 30; g.shadowOffsetY = 10;
    g.fillStyle = '#0b2e55'; g.beginPath(); g.arc(cx, cy, R * 1.2, 0, 7); g.fill();
    g.restore();
    const seg = Math.PI / 10;
    for (let i = 0; i < 20; i++) {
      const a0 = -Math.PI / 2 - seg / 2 + i * seg, a1 = a0 + seg;
      const even = i % 2 === 0;
      const ring = (r0, r1, col) => { g.fillStyle = col; g.beginPath(); g.arc(cx, cy, r1 * R, a0, a1); g.arc(cx, cy, r0 * R, a1, a0, true); g.closePath(); g.fill(); };
      ring(0.094, 0.953, even ? '#e9fbff' : '#1f9cff');
      ring(0.953, 1, even ? '#7be33c' : '#0a5fc0');
      ring(0.582, 0.629, even ? '#7be33c' : '#0a5fc0');
    }
    g.fillStyle = '#7be33c'; g.beginPath(); g.arc(cx, cy, 0.094 * R, 0, 7); g.fill();
    g.fillStyle = '#ff3355'; g.beginPath(); g.arc(cx, cy, 0.037 * R, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1;
    for (let i = 0; i < 20; i++) { const a = -Math.PI / 2 - seg / 2 + i * seg; g.beginPath(); g.moveTo(cx + Math.cos(a) * 0.094 * R, cy + Math.sin(a) * 0.094 * R); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke(); }
    g.font = `800 ${Math.max(10, R * 0.09)}px Segoe UI, sans-serif`; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ORDER.forEach((n, i) => { const a = -Math.PI / 2 + i * seg; g.fillText(n, cx + Math.cos(a) * R * 1.1, cy + Math.sin(a) * R * 1.1); });
    // glossy highlight
    const hl = g.createLinearGradient(0, cy - R, 0, cy);
    hl.addColorStop(0, 'rgba(255,255,255,.55)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.beginPath(); g.ellipse(cx, cy - R * 0.5, R * 0.85, R * 0.5, 0, 0, 7); g.fill();
  }

  drawDart(g, x, y, s) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = '#c0c8d0'; g.fillRect(-1, 0, 2, 4);
    g.fillStyle = '#2fb8ff'; g.fillRect(-2.5, 4, 5, 16);
    g.fillStyle = '#7dff5a';
    g.beginPath(); g.moveTo(0, 18); g.lineTo(-8, 30); g.lineTo(0, 26); g.lineTo(8, 30); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(-1.5, 5, 1, 12);
    g.restore();
  }

  finish() {
    this.ctx.submit('darts', this.score);
    this.best = Math.max(this.best || 0, this.score);
    this.o.center(`<h2>Final Score</h2><div class="big-num">${this.score}</div><p>${this.score >= 180 ? 'Incredible arm! 🏆' : this.score >= 100 ? 'Great throwing! ✨' : 'Nice try — practice makes perfect!'}</p>`,
      [['Play Again', 'green', () => { this.o.destroy(); this.start(); }], ['Exit', 'silver', () => this.ctx.close()]]);
  }

  stop() { this.o?.destroy(); }
}
