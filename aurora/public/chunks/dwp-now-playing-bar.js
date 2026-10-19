/* dwp-now-playing-bar chunk — playback engine (WebAudio synth demo since no audio assets),
   queue management, progress simulation. */
(() => {
  const A = window.Aurora;
  const player = {
    queue: [], index: -1, playing: false, posMs: 0, durMs: 0, track: null,
    ctx: null, gain: null, osc: null, lfo: null, raf: null, lastTick: 0, volume: 0.7,
  };

  function ensureCtx() {
    if (!player.ctx) {
      player.ctx = new (window.AudioContext || window.webkitAudioContext)();
      player.gain = player.ctx.createGain();
      player.gain.gain.value = 0;
      // gentle lowpass so the demo synth is not harsh
      const lp = player.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      player.gain.connect(lp); lp.connect(player.ctx.destination);
    }
    return player.ctx;
  }

  function stopTone() {
    if (player.osc) { try { player.osc.stop(); } catch {} player.osc.disconnect(); player.osc = null; }
    if (player.lfo) { try { player.lfo.stop(); } catch {} player.lfo = null; }
  }

  // Deterministic "song" from track id: a little arpeggio loop via oscillator + LFO.
  function startTone(seedStr) {
    const ctx = ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    stopTone();
    let h = 0; for (const c of seedStr) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const root = 196 + (h % 12) * 16; // around G3..A#3
    const scale = [0, 3, 5, 7, 10, 12, 15, 19];
    const osc = ctx.createOscillator(); osc.type = h % 2 ? 'triangle' : 'sawtooth';
    const step = () => {
      if (!player.playing) return;
      const i = Math.floor((Date.now() / 260) + h) % scale.length;
      osc.frequency.setTargetAtTime(root * Math.pow(2, scale[i] / 12), ctx.currentTime, 0.02);
    };
    player.lfo = setInterval(step, 260); step();
    const g = ctx.createGain(); g.gain.value = 0.25;
    osc.connect(g); g.connect(player.gain);
    osc.start(); player.osc = osc;
    player.gain.gain.setTargetAtTime(player.volume * 0.35, ctx.currentTime, 0.1);
  }

  function tickProgress(ts) {
    if (player.playing && player.track) {
      if (player.lastTick) player.posMs += ts - player.lastTick;
      player.lastTick = ts;
      if (player.posMs >= player.durMs) { next(true); }
      else renderProgress();
    } else {
      player.lastTick = ts;
    }
    player.raf = requestAnimationFrame(tickProgress);
  }

  function renderProgress() {
    const fill = document.getElementById('pfill'), cur = document.getElementById('ptime');
    if (fill) fill.style.width = `${Math.min(100, (player.posMs / player.durMs) * 100)}%`;
    if (cur) cur.textContent = A.fmtDur(player.posMs);
  }

  function loadBarUI() {
    const t = player.track;
    document.getElementById('np-cover').setAttribute('style', A.coverStyle(t.id));
    document.getElementById('np-title').textContent = t.name;
    document.getElementById('np-artist').textContent = (t.artists || [t.artist_name]).join(', ');
    document.getElementById('ttot').textContent = A.fmtDur(t.duration_ms || t.dur || 0);
  }

  function playAt(i) {
    if (i < 0 || i >= player.queue.length) return;
    player.index = i;
    const raw = player.queue[i];
    player.track = raw.artists ? raw : { ...raw, artists: [raw.artist_name], duration_ms: raw.duration_ms };
    player.durMs = raw.duration_ms || 180000;
    player.posMs = 0;
    player.playing = true;
    loadBarUI();
    startTone(raw.id || raw.name);
    setPlayIcon();
    A.track('playback.start', { uri: raw.uri || `aurora:track:${raw.id}`, position: 0 });
    markRow();
  }

  function pause() {
    player.playing = false;
    if (player.gain && player.ctx) player.gain.gain.setTargetAtTime(0, player.ctx.currentTime, 0.05);
    stopTone();
    setPlayIcon();
    A.track('playability.state', { state: 'paused' });
  }
  function resume() {
    if (!player.track) return;
    player.playing = true;
    startTone(player.track.id);
    setPlayIcon();
  }
  function toggle() { player.playing ? pause() : resume(); }
  function next(auto) {
    if (auto) A.track('playback.end', { uri: player.track?.uri, position: player.posMs });
    playAt((player.index + 1) % player.queue.length);
  }
  function prev() {
    if (player.posMs > 3000) { player.posMs = 0; renderProgress(); return; }
    playAt((player.index - 1 + player.queue.length) % player.queue.length);
  }
  function seek(ratio) {
    player.posMs = Math.max(0, Math.min(1, ratio)) * player.durMs;
    renderProgress();
    A.track('playback.seek', { to: player.posMs });
  }

  function setPlayIcon() {
    const b = document.getElementById('btn-play');
    if (b) b.innerHTML = player.playing ? A.ICONS.pause : A.ICONS.play;
  }

  function markRow() {
    document.querySelectorAll('.trow.playing').forEach(r => r.classList.remove('playing'));
    if (player.track) {
      const row = document.querySelector(`.trow[data-id="${player.track.id}"]`);
      if (row) row.classList.add('playing');
    }
  }

  function playList(tracks, startIndex = 0) {
    player.queue = tracks;
    playAt(startIndex);
  }

  function mount() {
    const bar = document.createElement('div');
    bar.className = 'nowbar';
    bar.innerHTML = `
      <div class="np-left"><div class="cover" id="np-cover"></div>
        <div><div class="t" id="np-title">Not playing</div><div class="a" id="np-artist">—</div></div></div>
      <div class="np-center">
        <div class="np-controls">
          <button id="btn-shuffle" title="Shuffle">${A.ICONS.shuffle}</button>
          <button id="btn-prev" title="Previous">${A.ICONS.prev}</button>
          <button class="playpause" id="btn-play" title="Play/Pause">${A.ICONS.play}</button>
          <button id="btn-next" title="Next">${A.ICONS.next}</button>
          <button id="btn-repeat" title="Repeat">${A.ICONS.repeat}</button>
        </div>
        <div class="progress"><span id="ptime">0:00</span>
          <div class="pbar" id="pbar"><div class="pfill" id="pfill"></div></div>
          <span id="ttot">0:00</span></div>
      </div>
      <div class="np-right">${A.ICONS.vol}<div class="vol"><div class="pfill"></div></div></div>`;
    document.getElementById('app').appendChild(bar);

    document.getElementById('btn-play').onclick = () => player.track ? toggle() : (player.queue.length && playAt(0));
    document.getElementById('btn-next').onclick = () => next(false);
    document.getElementById('btn-prev').onclick = prev;
    document.getElementById('pbar').onclick = e => {
      const r = e.currentTarget.getBoundingClientRect();
      seek((e.clientX - r.left) / r.width);
    };
    requestAnimationFrame(tickProgress);
  }

  window.NowPlaying = { mount, playList, playAt, pause, resume, toggle, next, prev, seek, player };
})();
