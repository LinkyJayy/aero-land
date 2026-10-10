// Unified keyboard / mouse / touch input.
import { el, isTouch } from './util.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.touch = isTouch();
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.joy = { x: 0, y: 0 };
    this.look = { dx: 0, dy: 0 };
    this.held = { hit: false, place: false, jump: false, sprint: false, down: false };
    this.pressed = new Set();
    this.enabled = true;
    this.sensitivity = 1;
    this.locked = false;

    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (!this.keys.has(e.code)) this.onKey(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.held.hit = this.held.place = false; });

    canvas.addEventListener('mousedown', (e) => {
      if (this.touch || !this.enabled) return;
      if (!this.locked) { canvas.requestPointerLock?.(); return; }
      if (e.button === 0) { this.held.hit = true; this.pressed.add('hit'); }
      if (e.button === 2) { this.pressed.add('place'); }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.held.hit = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.look.dx += e.movementX * 0.0025 * this.sensitivity;
      this.look.dy += e.movementY * 0.0025 * this.sensitivity;
    });
    canvas.addEventListener('wheel', (e) => { this.pressed.add(e.deltaY > 0 ? 'next' : 'prev'); }, { passive: true });
  }

  onKey(code) {
    const map = {
      KeyE: 'use', KeyF: 'fly', KeyQ: 'eat', KeyI: 'inventory', KeyC: 'craft', KeyT: 'chat', Enter: 'chat',
      KeyG: 'games', KeyP: 'customize', Escape: 'menu', KeyZ: 'zoom', KeyR: 'place', KeyM: 'settings',
    };
    if (map[code]) this.pressed.add(map[code]);
    const d = /^Digit([1-9])$/.exec(code);
    if (d) this.pressed.add('slot' + (Number(d[1]) - 1));
  }

  // Build on-screen touch controls inside `root`.
  buildTouch(root) {
    const wrap = el('div', { id: 'touch' });
    const joy = el('div', { id: 'joy', class: 'pe' }, el('div', { class: 'knob' }));
    const lookpad = el('div', { id: 'lookpad', class: 'pe' });
    const btn = (label, cls, down, up) => {
      const b = el('button', { class: 'btn round ' + cls + ' pe' }, label);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); down(); });
      if (up) for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => up());
      return b;
    };
    const tb = el('div', { id: 'tbtns' },
      btn('Use', 'silver', () => this.pressed.add('use')),
      btn('Place', 'orange', () => this.pressed.add('place')),
      btn('Eat', 'silver', () => this.pressed.add('eat')),
      btn('Fly', 'silver', () => this.pressed.add('fly')),
      btn('Hit', 'red', () => { this.held.hit = true; this.pressed.add('hit'); }, () => { this.held.hit = false; }),
      btn('Jump', 'green', () => { this.held.jump = true; }, () => { this.held.jump = false; }),
    );
    this.flyBtn = tb.children[3];
    wrap.append(lookpad, joy, tb);
    root.append(wrap);
    this.touchRoot = wrap;

    // joystick
    const knob = joy.firstChild;
    let jid = null, cx = 0, cy = 0;
    const R = 50;
    joy.addEventListener('pointerdown', (e) => {
      e.preventDefault(); jid = e.pointerId; joy.setPointerCapture(e.pointerId);
      const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      moveJoy(e);
    });
    const moveJoy = (e) => {
      if (e.pointerId !== jid) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy.x = dx / R; this.joy.y = -dy / R;
      this.held.sprint = d > R * 0.95;
    };
    joy.addEventListener('pointermove', moveJoy);
    const endJoy = (e) => { if (e.pointerId !== jid) return; jid = null; knob.style.transform = ''; this.joy.x = this.joy.y = 0; this.held.sprint = false; };
    joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);

    // look pad (drag anywhere on the right side)
    const pts = new Map();
    let pinch = 0;
    lookpad.addEventListener('pointerdown', (e) => { lookpad.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
    lookpad.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p || !this.enabled) return;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const after = Math.hypot(a.x - b.x, a.y - b.y);
        pinch += before - after;
        if (Math.abs(pinch) > 40) { this.pressed.add(pinch > 0 ? 'zoomOut' : 'zoomIn'); pinch = 0; }
        return;
      }
      this.look.dx += (e.clientX - p.x) * 0.006 * this.sensitivity;
      this.look.dy += (e.clientY - p.y) * 0.006 * this.sensitivity;
      p.x = e.clientX; p.y = e.clientY;
    });
    const endLook = (e) => pts.delete(e.pointerId);
    lookpad.addEventListener('pointerup', endLook); lookpad.addEventListener('pointercancel', endLook);
  }

  setRaceMode(on) { this.touchRoot?.querySelector('#tbtns')?.classList.toggle('hidden', on); }

  setTouchVisible(v) { if (this.touchRoot) this.touchRoot.classList.toggle('hidden', !v); }

  update() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    x += this.joy.x; y += this.joy.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.move.x = x; this.move.y = y;
    this.jump = this.held.jump || k.has('Space');
    this.sprint = this.held.sprint || k.has('ShiftLeft') || k.has('ShiftRight');
    this.down = k.has('ControlLeft') || k.has('KeyX');
  }

  take(name) { if (this.pressed.has(name)) { this.pressed.delete(name); return true; } return false; }
  consumeLook() { const l = { ...this.look }; this.look.dx = this.look.dy = 0; return l; }
  clear() { this.pressed.clear(); this.look.dx = this.look.dy = 0; }
}
