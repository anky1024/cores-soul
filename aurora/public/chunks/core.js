/* core chunk — dealer client (WS RPC + token bootstrap), telemetry, helpers.
   Mirrors REA evidence: apresolve-style bootstrap → dealer WS → gabo events. */
window.Aurora = (() => {
  const state = { token: null, ws: null, reqSeq: 0, pending: new Map(), queue: [], timer: null };

  async function bootstrap() {
    const r = await fetch('/bootstrap-token', { method: 'POST' });
    const j = await r.json();
    state.token = j.access_token;
    return j;
  }

  function connectDealer() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/dealer`);
      state.ws = ws;
      ws.onopen = () => resolve(ws);
      ws.onerror = (e) => reject(e);
      ws.onmessage = (ev) => {
        const buf = ev.data;
        if (!(buf instanceof ArrayBuffer)) return;
        const u8 = new Uint8Array(buf);
        const type = u8[0];
        const payload = JSON.parse(new TextDecoder().decode(u8.subarray(3)));
        if (type === 0x02 && payload.requestId && state.pending.has(payload.requestId)) {
          const { resolve } = state.pending.get(payload.requestId);
          state.pending.delete(payload.requestId);
          resolve(payload.result);
        } else if (type === 0x01) {
          // pubsub event (product.state etc.)
          document.dispatchEvent(new CustomEvent('dealer:event', { detail: payload }));
        } else if (type === 0xff) {
          console.warn('dealer error', payload);
        }
      };
    });
  }

  function rpc(method, args = {}) {
    return new Promise((resolve, reject) => {
      const requestId = `req-${++state.reqSeq}`;
      state.pending.set(requestId, { resolve, reject });
      const body = JSON.stringify({ method, args, requestId });
      const head = new Uint8Array(3);
      head[0] = 0x00; // request
      new DataView(head.buffer).setUint16(1, state.reqSeq & 0xffff);
      const payload = new TextEncoder().encode(body);
      const frame = new Uint8Array(head.length + payload.length);
      frame.set(head); frame.set(payload, head.length);
      state.ws.send(frame);
      setTimeout(() => { if (state.pending.has(requestId)) { state.pending.delete(requestId); reject(new Error('rpc_timeout')); } }, 8000);
    });
  }

  // batched telemetry like gabo-receiver-service
  function track(type, payload = {}) {
    state.queue.push({ type, payload, ts: Date.now(), token: state.token });
    if (!state.timer) state.timer = setTimeout(flush, 2000);
    if (state.queue.length >= 15) flush();
  }
  async function flush() {
    clearTimeout(state.timer); state.timer = null;
    if (!state.queue.length) return;
    const batch = state.queue.splice(0);
    try { await fetch('/gabo-receiver-service/public/v3/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch) }); } catch {}
  }

  // deterministic gradient covers per entity (no external assets needed)
  function hashHue(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; }
  function coverStyle(seed) {
    const hue = hashHue(seed), hue2 = (hue + 60) % 360;
    return `background: linear-gradient(135deg, hsl(${hue},70%,45%), hsl(${hue2},65%,25%))`;
  }

  const fmtDur = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ICONS = {
    home: '<svg viewBox="0 0 24 24"><path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><path d="M10 2a8 8 0 105.3 14l4.9 4.9 1.4-1.4-4.9-4.9A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z"/></svg>',
    lib: '<svg viewBox="0 0 24 24"><path d="M4 3h2v18H4zM9 3h2v18H9zM15 4l4.5 16.5-1.9.5L13.1 4.5z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4l14 8-14 8z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM20 5l-12 7 12 7z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM4 5l12 7-12 7z"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24"><path d="M3 6h5l8 12h5v-4l3 3-3 3v-4h-6L7 4H3zm11 0 3 3-3 3V9H7L5.6 7.6 7.3 6zM3 18h5l2-2H3z"/></svg>',
    repeat: '<svg viewBox="0 0 24 24"><path d="M7 7h10V4l4 4-4 4V8H9v3H7zm10 10H7v3l-4-4 4-4v3h8v-3h2z"/></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-5v16l-5-5H4zM16 9a4 4 0 010 6v-2a2 2 0 000-2z"/></svg>',
    left: '<svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8 1.4-1.4L9.8 12l6.6-6.6z"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M9 4l8 8-8 8-1.4-1.4L14.2 12 7.6 5.4z"/></svg>',
  };

  return { state, bootstrap, connectDealer, rpc, track, coverStyle, fmtDur, esc, ICONS };
})();
