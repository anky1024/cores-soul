/* xpui-routes-search chunk — search view: debounced input → dealer RPC searchV3,
   tabs (Top/Artists/Albums/Tracks/Playlists), result rendering. Named after the
   real lazy chunk observed in REA evidence: xpui-routes-search.*.js */
(() => {
  const A = window.Aurora;
  const TABS = [['top', 'Top'], ['artist', 'Artists'], ['album', 'Albums'], ['track', 'Tracks'], ['playlist', 'Playlists']];

  let currentTab = 'top';
  let lastResults = null;
  let debounceTimer = null;
  let inflight = 0;

  function sectionFor(tab) {
    if (!lastResults) return [];
    return { top: lastResults.all.top, artist: lastResults.all.artists.items, album: lastResults.all.albums.items, track: lastResults.all.tracks.items, playlist: lastResults.all.playlists.items }[tab] || [];
  }

  function renderTabs() {
    return `<div class="tabs">${TABS.map(([id, label]) =>
      `<button class="tab ${id === currentTab ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}</div>`;
  }

  function cardHTML(item, square, metaFn) {
    return `<div class="card ${square ? 'square' : ''}" data-uri="${item.uri}" data-id="${item.id}" data-type="${item.type}">
      <div class="cover" style="${A.coverStyle(item.id + item.name)}"></div>
      <div class="title">${A.esc(item.name)}</div>
      <div class="meta">${metaFn(item)}</div>
      <button class="playfab" title="Play">${A.ICONS.play}</button></div>`;
  }

  function trackRowHTML(t, i) {
    return `<div class="trow" data-id="${t.id}" data-idx="${i}">
      <div class="num"><span class="n">${i + 1}</span><span class="p">${A.ICONS.play}</span></div>
      <div class="tname"><div class="thumb" style="${A.coverStyle(t.id + t.name)}"></div>
        <div><div>${A.esc(t.name)}${t.explicit ? ' <span class="explicit-badge">E</span>' : ''}</div>
        <div style="color:var(--sub);font-size:12px">${A.esc((t.artists || []).join(', '))}</div></div></div>
      <div>${A.esc(t.album || '')}</div>
      <div>${t.popularity ?? ''}</div>
      <div class="dur">${A.fmtDur(t.duration_ms)}</div></div>`;
  }

  function render() {
    const view = document.getElementById('view');
    const q = lastResults?.query || '';
    if (!q) { view.innerHTML = browseEmpty(); wireBrowse(); return; }
    const items = sectionFor(currentTab);
    let body = '';
    if (!items.length) body = `<div class="empty">No results for “${A.esc(q)}”. Try different keywords.</div>`;
    else if (currentTab === 'top') {
      const best = items[0];
      body = `
        ${best && (best.type === 'artist' || best.type === 'track') ? `
        <h2 class="section">Top result</h2>
        <div class="grid cards" style="grid-template-columns:minmax(200px,240px)">${cardHTML(best, best.type !== 'artist', it => it.type === 'artist' ? 'Artist' : `Song · ${A.esc((it.artists || []).join(', '))}`)}</div>` : ''}
        <h2 class="section">Songs</h2>
        <div class="tracklist">${items.filter(i => i.type === 'track').slice(0, 4).map(trackRowHTML).join('')}</div>
        <h2 class="section">Artists</h2>
        <div class="grid artists">${items.filter(i => i.type === 'artist').map(a => cardHTML(a, false, () => 'Artist')).join('')}</div>`;
    } else if (currentTab === 'track') {
      body = `<div class="tracklist head-row trow" style="border-bottom:1px solid #282828">
        <div class="num">#</div><div>Title</div><div>Album</div><div>Pop</div><div class="dur">Time</div></div>
        <div class="tracklist">${items.map(trackRowHTML).join('')}</div>`;
    } else if (currentTab === 'artist') {
      body = `<div class="grid artists">${items.map(a => cardHTML(a, false, () => 'Artist')).join('')}</div>`;
    } else if (currentTab === 'album') {
      body = `<div class="grid cards">${items.map(a => cardHTML(a, true, it => `${A.esc(it.artists.join(', '))} · ${it.year}`)).join('')}</div>`;
    } else {
      body = `<div class="grid cards">${items.map(p => cardHTML(p, true, it => A.esc(it.description))).join('')}</div>`;
    }
    view.innerHTML = `<h1 class="page">Search</h1>${renderTabs()}${body}`;
    wireResults(items);
  }

  function wireResults(items) {
    view.querySelectorAll('.tab').forEach(b => b.onclick = () => {
      currentTab = b.dataset.tab; A.track('search.tab', { tab: currentTab, query: lastResults.query }); render();
    });
    view.querySelectorAll('.card').forEach(card => {
      card.onclick = async () => {
        const id = card.dataset.id, type = card.dataset.type;
        A.track('search.result.click', { uri: card.dataset.uri });
        openDetail(type, id);
      };
    });
    view.querySelectorAll('.trow[data-idx]').forEach(row => row.onclick = () => {
      const tracks = items.filter(i => i.type === 'track');
      NowPlaying.playList(tracks, +row.dataset.idx);
    });
  }

  // ---------- detail pages (artist / album / playlist), fetched over dealer RPC ----------
  async function openDetail(type, id) {
    view.innerHTML = '<div class="spinner"></div>';
    try {
      if (type === 'artist') {
        const artist = await A.rpc('artistGet', { id });
        const tracks = await A.rpc('artistTopTracks', { id });
        showArtist(artist, tracks);
      } else if (type === 'album') {
        const album = await A.rpc('albumGet', { id });
        const tracks = await A.rpc('albumTracks', { id });
        showAlbum(album, tracks);
      } else if (type === 'playlist') {
        const pl = await A.rpc('playlistGetMeta', { id });
        const tracks = await A.rpc('playlistGet', { id });
        showPlaylist(pl, tracks);
      } else {
        // track card: queue the surrounding search results and play it
        const res = await A.rpc('searchV3', { query: cardName(id), types: [] });
        const tracks = res.all.tracks.items;
        const idx = Math.max(0, tracks.findIndex(t => t.id === id));
        NowPlaying.playList(tracks, idx);
        render();
      }
    } catch (err) {
      view.innerHTML = `<div class="empty">Dealer error: ${A.esc(err.message)}</div>`;
    }
  }
  function cardName(id) {
    const c = document.querySelector(`.card[data-id="${id}"]`);
    return c ? c.querySelector('.title').textContent : '';
  }

  function headerHTML(seedStr, kicker, title, meta) {
    return `<div class="detail-header" style="${A.coverStyle(seedStr)}">
      <div class="detail-cover" style="${A.coverStyle(seedStr)}"></div>
      <div><div class="detail-kicker">${kicker}</div><h1 class="detail-title">${A.esc(title)}</h1><div class="detail-meta">${meta}</div></div></div>`;
  }
  function trackRows(tracks) {
    return `<div class="tracklist head-row trow" style="border-bottom:1px solid #282828">
      <div class="num">#</div><div>Title</div><div>Album</div><div>Pop</div><div class="dur">Time</div></div>
      <div class="tracklist">${tracks.map(trackRowHTML).join('')}</div>`;
  }
  function wireTrackRows(tracks) {
    view.querySelectorAll('.trow[data-idx]').forEach(row => row.onclick = () => NowPlaying.playList(tracks, +row.dataset.idx));
    const pb = view.querySelector('.big-play');
    if (pb) pb.onclick = () => { if (tracks.length) NowPlaying.playList(tracks, 0); };
  }

  function showArtist(a, tracks) {
    view.innerHTML = `${headerHTML(a.id, 'Artist', a.name, `${Number(a.listeners).toLocaleString()} monthly listeners`)}
      <div class="detail-actions"><button class="big-play">${A.ICONS.play}</button></div>
      <h2 class="section">Popular</h2>${trackRows(tracks)}`;
    wireTrackRows(tracks);
    history.replaceState(null, '', '/search/' + encodeURIComponent(lastResults?.query || ''));
  }
  function showAlbum(al, tracks) {
    view.innerHTML = `${headerHTML(al.id, al.kind === 'single' ? 'Single' : 'Album', al.name,
      `${A.esc(al.artist_name)} · ${al.year}`)}
      <div class="detail-actions"><button class="big-play">${A.ICONS.play}</button></div>
      <h2 class="section">Tracks</h2>${trackRows(tracks)}`;
    wireTrackRows(tracks);
  }
  function showPlaylist(p, tracks) {
    view.innerHTML = `${headerHTML(p.id, 'Playlist', p.name, `${A.esc(p.description)} · ${tracks.length} songs`)}
      <div class="detail-actions"><button class="big-play">${A.ICONS.play}</button></div>
      <h2 class="section">All tracks</h2>${trackRows(tracks)}`;
    wireTrackRows(tracks);
  }

  function browseEmpty() {
    const tiles = ['Pop', 'Hip-hop', 'Rock', 'Electronic', 'Dance', 'Indie', 'R&B', 'Disco'];
    return `<h1 class="page">Search</h1>
      <div class="searchhint" style="color:var(--sub);margin-bottom:16px">Start typing to search songs, artists, albums and playlists.</div>
      <h2 class="section">Browse all</h2>
      <div class="grid cards">${tiles.map(g => `<div class="card square browse" data-q="${g}" style="background:hsl(${(g.length * 57) % 360},55%,30%);min-height:92px">
        <div class="title" style="font-size:18px">${g}</div></div>`).join('')}</div>`;
  }
  function wireBrowse() {
    view.querySelectorAll('.browse').forEach(c => c.onclick = () => {
      const inp = document.getElementById('search-input');
      inp.value = c.dataset.q; doSearch(c.dataset.q);
    });
  }

  async function doSearch(q) {
    if (!q.trim()) { lastResults = null; render(); return; }
    const seq = ++inflight;
    view.innerHTML = '<div class="spinner"></div>';
    try {
      const res = await A.rpc('searchV3', { query: q, types: [], limit: 10, offset: 0 });
      if (seq !== inflight) return; // stale response guard (like Spotify's request cancellation)
      lastResults = res;
      A.track('search.requestSent', { query: q });
      A.track('search.showResults', { query: q, sections: Object.keys(res.all) });
      render();
      history.replaceState(null, '', '/search/' + encodeURIComponent(q));
    } catch (err) {
      if (seq === inflight) view.innerHTML = `<div class="empty">Dealer error: ${A.esc(err.message)}</div>`;
    }
  }

  window.SearchRoute = {
    mount(viewEl) {
      window.view = viewEl;
      const inp = document.getElementById('search-input');
      inp.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => doSearch(inp.value), 250); // debounced like web player
      });
      const initial = decodeURIComponent(location.pathname.split('/search/')[1] || '');
      if (initial) { inp.value = initial; doSearch(initial); } else render();
    },
    showPlaylistDetail(meta, tracks) {
      window.view = document.getElementById('view');
      showPlaylist(meta, tracks);
    },
    search: doSearch,
  };
})();
