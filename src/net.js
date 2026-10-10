// WebSocket multiplayer client. Falls back to solo play when no server is reachable.
export class Net {
  constructor() {
    this.ws = null;
    this.id = null;
    this.online = false;
    this.handlers = {};
    this.lastState = 0;
    this.retry = 0;
  }

  on(type, fn) { this.handlers[type] = fn; return this; }
  emit(type, msg) { this.handlers[type]?.(msg); }

  connect(name, look) {
    this.name = name; this.look = look;
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    let ws;
    try { ws = new WebSocket(url); } catch { this.emit('status', 'offline'); return; }
    this.ws = ws;
    const timeout = setTimeout(() => { if (!this.online) ws.close(); }, 5000);
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', name, look })); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'welcome') { clearTimeout(timeout); this.online = true; this.id = m.id; this.retry = 0; this.emit('status', 'online'); }
      this.emit(m.t, m);
    };
    ws.onclose = () => {
      clearTimeout(timeout);
      const was = this.online;
      this.online = false;
      this.emit('status', 'offline');
      if (was) this.emit('disconnect');
      // keep trying in the background (server restarts, flaky mobile networks)
      this.retry = Math.min(this.retry + 1, 6);
      setTimeout(() => this.connect(this.name, this.look), 1500 * this.retry);
    };
    ws.onerror = () => {};
  }

  send(msg) { if (this.online && this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg)); }

  sendState(s, now) {
    if (now - this.lastState < 100) return;
    this.lastState = now;
    this.send({ t: 'state', s });
  }
}
