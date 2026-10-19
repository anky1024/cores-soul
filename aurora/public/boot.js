/* boot.js — app shell: sidebar, topbar, router (home/search/library), bootstrap+dealer connect */
(async () => {
  const A = window.Aurora;

  document.body.insertAdjacentHTML('afterbegin', `
    <div id="app">
      <nav class="nav">
        <div class="logo">${A.ICONS.lib}<span>Aurora</span></div>
        <a class="nav-item" data-route="home" href="/">${A.ICONS.home}<span class="label">Home</span></a>
        <a class="nav-item active" data-route="search" href="/search">${A.ICONS.search}<span class="label">Search</span></a>
        <div class="nav-sep"></div>
        <a class="nav-item" data-route="library" href="/library">${A.ICONS.lib}<span class="label">Your Library</span></a>
        <div class="lib-title">Playlists</div>
        <div id="lib-list"></div>
      </nav>
      <main class="main">
        <div class="topbar">
          <button class="iconbtn" id="back">${A.ICONS.left}</button>
          <button class="iconbtn" id="fwd">${A.ICONS.right}</button>
          <div class="searchbox">${A.ICONS.search}<input id="search-input" placeholder="What do you want to listen to?" autocomplete="off"></div>
          <div class="avatar">A</div>
        </div>
        <div class="view" id="view"><div class="spinner"></div></div>
      </main>
    </div>`);

  NowPlaying.mount();

  // ---- bootstrap token + dealer connection (mirrors REA evidence flow) ----
  await A.bootstrap();
  try { await A.connectDealer(); } catch (e) { console.error('dealer connect failed', e); }

  const PLAYLISTS = [
    ['pl1', 'Today’s Top Hits'], ['pl4', 'All Out 2010s'], ['pl5', 'Rock Classics'],
    ['pl6', 'Chill Mix'], ['pl7', 'Electronic Rising'], ['pl8', 'Discover Weekly'],
    ['pl9', 'Daft Punk Deep Cuts'], ['pl10', 'Workout Beats'],
  ];
  document.getElementById('lib-list').innerHTML = PLAYLISTS.map(([id, n]) => `<div class="lib-item" data-pl="${id}">${n}</div>`).join('');
  document.querySelectorAll('.lib-item').forEach(el => el.onclick = async () => {
    const tracks = await A.rpc('playlistGet', { id: el.dataset.pl });
    NowPlaying.playList(tracks, 0);
    showLibrary(el.textContent, tracks);
  });

  function setActive(route) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.route === route));
  }

  async function showHome() {
    setActive('home');
    const recents = await A.rpc('recentsForUser', {});
    const view = document.getElementById('view');
    view.innerHTML = `<h1 class="page">Good evening</h1>
      <div class="grid cards">${recents.slice(0, 6).map((t, i) => `
        <div class="card square home-tile" data-idx="${i}" style="display:flex;gap:12px;align-items:center;background:#242424">
          <div class="cover" style="width:64px;height:64px;border-radius:4px;flex:0 0 auto;${A.coverStyle(t.id + t.name)}"></div>
          <div class="title" style="font-size:14px">${A.esc(t.name)}</div></div>`).join('')}</div>
      <h2 class="section">Popular tracks</h2>
      <div class="tracklist">${recents.map((t, i) => `
        <div class="trow" data-idx="${i}"><div class="num"><span class="n">${i + 1}</span><span class="p">${A.ICONS.play}</span></div>
        <div class="tname"><div class="thumb" style="${A.coverStyle(t.id + t.name)}"></div>
        <div><div>${A.esc(t.name)}</div><div style="color:var(--sub);font-size:12px">${A.esc(t.artist_name || '')}</div></div></div>
        <div></div><div>${t.popularity}</div><div class="dur">${A.fmtDur(t.duration_ms)}</div></div>`).join('')}</div>`;
    view.querySelectorAll('.home-tile, .trow[data-idx]').forEach(el => el.onclick = () => NowPlaying.playList(recents, +el.dataset.idx));
  }

  async function showLibrary(name, tracks) {
    setActive('library');
    const view = document.getElementById('view');
    view.innerHTML = `<h1 class="page">${A.esc(name)}</h1>
      <div class="tracklist">${tracks.map((t, i) => `
        <div class="trow" data-idx="${i}"><div class="num"><span class="n">${i + 1}</span><span class="p">${A.ICONS.play}</span></div>
        <div class="tname"><div class="thumb" style="${A.coverStyle(t.id + t.name)}"></div>
        <div><div>${A.esc(t.name)}</div><div style="color:var(--sub);font-size:12px">${A.esc(t.artist_name || '')}</div></div></div>
        <div></div><div>${t.popularity ?? ''}</div><div class="dur">${A.fmtDur(t.duration_ms)}</div></div>`).join('')}</div>`;
    view.querySelectorAll('.trow[data-idx]').forEach(el => el.onclick = () => NowPlaying.playList(tracks, +el.dataset.idx));
  }

  function showSearch() { setActive('search'); SearchRoute.mount(document.getElementById('view')); }

  // client-side routing over the SSR shells
  function route(path) {
    if (path.startsWith('/search')) showSearch();
    else if (path === '/library') showLibrary('Your Library', []);
    else showHome();
  }
  document.querySelectorAll('.nav-item').forEach(a => a.onclick = e => {
    e.preventDefault(); history.pushState(null, '', a.getAttribute('href')); route(location.pathname);
  });
  document.getElementById('back').onclick = () => history.back();
  window.onpopstate = () => route(location.pathname);

  route(location.pathname);
})();
