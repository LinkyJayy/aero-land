// Bubble Pop — tap rising bubbles. Small = more points, golden = bonus, smog = penalty.
import { makeOverlay, skyBackground, glossyBubble, glossyText } from './common.js';

const DURATION = 45;

export class BubblePop {
  constructor(ctx) { this.ctx = ctx; }

  start() {
    const o = this.o = makeOverlay('🫧 Bubble Pop', this.ctx);
    this.reset();
    o.cv.addEventListener('pointerdown', (e) => this.tap(o.pos(e)));
    o.center('<h2>🫧 Bubble Pop</h2><p>Pop bubbles before they float away!<br>Tiny bubbles = more points · ⭐ golden = bonus · avoid dark smog bubbles.</p>', [['Go!', 'green', () => { o.hideCenter(); this.running = true; }]]);
  }

  reset() {
    this.bubbles = []; this.parts = []; this.popups = [];
    this.score = 0; this.combo = 0; this.comboT = 0; this.time = DURATION; this.spawnT = 0; this.t = 0; this.running = false;
  }

  tap(p) {
    if (!this.running) return;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 8) {
        this.bubbles.splice(i, 1);
        let pts;
        if (b.kind === 'smog') { pts = -30; this.combo = 0; }
        else {
          this.combo = this.comboT > 0 ? this.combo + 1 : 1;
          this.comboT = 1.2;
          pts = Math.round((b.kind === 'gold' ? 50 : Math.max(5, 60 - b.r)) * (1 + Math.min(this.combo - 1, 9) * 0.1));
          if (b.kind === 'gold') this.time = Math.min(DURATION, this.time + 3);
        }
        this.score = Math.max(0, this.score + pts);
        this.popups.push({ x: b.x, y: b.y, text: (pts > 0 ? '+' : '') + pts + (this.combo > 2 && pts > 0 ? ` x${this.combo}` : ''), t: 0, bad: pts < 0 });
        for (let k = 0; k < 10; k++) {
          const a = Math.random() * 6.28, s = 60 + Math.random() * 140;
          this.parts.push({ x: b.x, y: b.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, c: b.kind === 'smog' ? '#5a4a7a' : b.kind === 'gold' ? '#ffd93b' : '#ffffff' });
        }
        return;
      }
    }
    this.combo = 0;
  }

  update(dt) {
    const { o } = this, g = o.g, W = o.W, H = o.H;
    this.t += dt;
    if (this.running) {
      this.time -= dt; this.comboT -= dt;
      this.spawnT -= dt;
      const rate = 0.55 - Math.min(0.35, (DURATION - this.time) * 0.008);
      if (this.spawnT <= 0) {
        this.spawnT = rate;
        const roll = Math.random();
        const kind = roll < 0.06 ? 'gold' : roll < 0.2 ? 'smog' : 'aqua';
        const r = kind === 'gold' ? 26 : 16 + Math.random() * 38;
        this.bubbles.push({ x: r + Math.random() * (W - 2 * r), y: H + r, r, kind, vy: 50 + Math.random() * 70 + (DURATION - this.time) * 2.2, ph: Math.random() * 6, hue: Math.random() });
      }
      if (this.time <= 0) this.finish();
    }
    for (const b of this.bubbles) { b.y -= b.vy * dt; b.x += Math.sin(this.t * 2 + b.ph) * 30 * dt; }
    this.bubbles = this.bubbles.filter((b) => b.y > -b.r);

    skyBackground(g, W, H, this.t);
    for (const b of this.bubbles) {
      if (b.kind === 'smog') glossyBubble(g, b.x, b.y, b.r, 'rgba(60,40,90,.75)', 'rgba(120,100,160,.9)');
      else if (b.kind === 'gold') { glossyBubble(g, b.x, b.y, b.r, 'rgba(255,210,40,.6)', 'rgba(255,240,150,.95)'); glossyText(g, '★', b.x, b.y + 2, b.r, '#fff7b0', '#c08000'); }
      else glossyBubble(g, b.x, b.y, b.r, b.hue > 0.5 ? 'rgba(120,220,255,.35)' : 'rgba(150,255,120,.35)');
    }
    for (const p of this.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; g.globalAlpha = Math.max(0, 1 - p.t * 2); g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, 3, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    this.parts = this.parts.filter((p) => p.t < 0.5);
    for (const p of this.popups) { p.t += dt; p.y -= 50 * dt; g.globalAlpha = Math.max(0, 1 - p.t); glossyText(g, p.text, p.x, p.y, 22, p.bad ? '#ffb0b8' : '#ffffff', p.bad ? '#900020' : '#0a79d1'); }
    g.globalAlpha = 1;
    this.popups = this.popups.filter((p) => p.t < 1);
    o.setInfo(`⏱ ${Math.max(0, Math.ceil(this.time))}s · Score <b>${this.score}</b>${this.combo > 1 ? ` · Combo x${this.combo}` : ''}`);
  }

  finish() {
    this.running = false;
    this.ctx.submit('bubbles', this.score);
    this.o.center(`<h2>Time's up!</h2><div class="big-num">${this.score}</div><p>bubbles popped with style 🫧</p>`,
      [['Again', 'green', () => { this.o.hideCenter(); this.reset(); this.running = true; }], ['Exit', 'silver', () => this.ctx.close()]]);
  }

  stop() { this.o?.destroy(); }
}
