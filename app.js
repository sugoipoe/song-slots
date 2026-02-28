const CLIENT_ID = '3be30b5e47d543a3ad68fc02aea1c875';
const REDIRECT_URI = 'http://127.0.0.1:8000/callback.html';
const SCOPES = 'user-library-read playlist-read-private';

// --- PKCE Auth ---

function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

function base64encode(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function loginWithSpotify() {
  const codeVerifier = generateRandomString(64);
  localStorage.setItem('code_verifier', codeVerifier);

  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    redirect_uri: REDIRECT_URI,
  }).toString();

  window.location.href = authUrl.toString();
}

function getAccessToken() {
  return sessionStorage.getItem('access_token');
}

// --- LocalStorage Cache ---

const CACHE_KEY = 'songslots_cache';

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('Failed to load cache:', e);
    return null;
  }
}

function saveCache() {
  const cache = {
    playlists: allPlaylists,
    tracks: cachedTracks,
    lastSynced: new Date().toISOString(),
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  updateLastSyncedDisplay(cache.lastSynced);
}

function updateLastSyncedDisplay(isoString) {
  const el = document.getElementById('last-synced');
  if (!el) return;
  if (!isoString) {
    el.textContent = '';
    return;
  }
  const date = new Date(isoString);
  el.textContent = `synced ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// --- Rekordbox XML Import ---

function normalizeString(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function importRekordboxXML(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const tracks = doc.querySelectorAll('TRACK[Name][Artist]');

  // Build lookup map: "normalizedname|normalizedartist" -> metadata
  const rbMap = {};
  for (const track of tracks) {
    const name = track.getAttribute('Name') || '';
    const artist = track.getAttribute('Artist') || '';
    if (!name) continue;

    const key = normalizeString(name) + '|' + normalizeString(artist);
    rbMap[key] = {
      bpm: track.getAttribute('AverageBpm') || null,
      key: track.getAttribute('Tonality') || null,
      genre: track.getAttribute('Genre') || null,
    };
  }

  // Match against all cached songs
  let matched = 0;
  let total = 0;
  for (const playlistKey of Object.keys(cachedTracks)) {
    for (const song of cachedTracks[playlistKey]) {
      total++;
      // Try exact match
      const exactKey = normalizeString(song.name) + '|' + normalizeString(song.artist);
      let rb = rbMap[exactKey];

      // Try matching with just first artist
      if (!rb) {
        const firstArtist = song.artist.split(',')[0].trim();
        const partialKey = normalizeString(song.name) + '|' + normalizeString(firstArtist);
        rb = rbMap[partialKey];
      }

      if (rb) {
        if (rb.bpm) song.bpm = rb.bpm;
        if (rb.key) song.key = rb.key;
        if (rb.genre) song.genre = rb.genre;
        matched++;
      }
    }
  }

  saveCache();
  console.log(`Rekordbox import: matched ${matched}/${total} songs`);
  return { matched, total, rbTracks: tracks.length };
}

function importMetadataJSON(jsonText) {
  const tracks = JSON.parse(jsonText);

  // Build lookup map from OCR data: "normalizedtitle|normalizedartist" -> metadata
  const rbMap = {};
  for (const track of tracks) {
    const title = track.title || '';
    const artist = track.artist || '';
    if (!title) continue;

    const key = normalizeString(title) + '|' + normalizeString(artist);
    rbMap[key] = {
      bpm: track.bpm || null,
      key: track.key || null,
    };
    // Also index by title + first artist only
    const firstArtist = artist.split(',')[0].trim();
    const partialKey = normalizeString(title) + '|' + normalizeString(firstArtist);
    if (!rbMap[partialKey]) rbMap[partialKey] = rbMap[key];
    // Also index by title only (fallback)
    const titleKey = normalizeString(title) + '|';
    if (!rbMap[titleKey]) rbMap[titleKey] = rbMap[key];
  }

  // Match against all cached songs
  let matched = 0;
  let total = 0;
  for (const playlistKey of Object.keys(cachedTracks)) {
    for (const song of cachedTracks[playlistKey]) {
      total++;
      const exactKey = normalizeString(song.name) + '|' + normalizeString(song.artist);
      let rb = rbMap[exactKey];

      if (!rb) {
        const firstArtist = song.artist.split(',')[0].trim();
        const partialKey = normalizeString(song.name) + '|' + normalizeString(firstArtist);
        rb = rbMap[partialKey];
      }

      // Fallback: match by title only
      if (!rb) {
        const titleKey = normalizeString(song.name) + '|';
        rb = rbMap[titleKey];
      }

      if (rb) {
        if (rb.bpm) song.bpm = rb.bpm;
        if (rb.key) song.key = rb.key;
        matched++;
      }
    }
  }

  saveCache();
  console.log(`JSON import: matched ${matched}/${total} songs (${tracks.length} in file)`);
  return { matched, total, rbTracks: tracks.length };
}

function onImportRekordbox() {
  const input = document.getElementById('rekordbox-file');
  input.click();
}

function handleRekordboxFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    let result;
    if (file.name.endsWith('.json')) {
      result = importMetadataJSON(text);
    } else {
      result = importRekordboxXML(text);
    }
    const msg = `Matched ${result.matched} of ${result.total} songs (${result.rbTracks} tracks in file)`;
    document.getElementById('import-status').textContent = msg;
    // Refresh current view
    const select = document.getElementById('playlist-select');
    if (select && select.value && cachedTracks[select.value]) {
      allSongs = cachedTracks[select.value];
    }
  };
  reader.readAsText(file);
  // Reset so the same file can be re-imported
  event.target.value = '';
}

// --- Spotify API ---

let allSongs = [];
let allPlaylists = [];
let cachedTracks = {};

function parseTracks(items) {
  const songs = [];
  for (const item of items) {
    const track = item.track;
    if (!track) continue;
    songs.push({
      name: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      albumArt: track.album.images[0]?.url || '',
      albumArtSmall: track.album.images[track.album.images.length - 1]?.url || '',
    });
  }
  return songs;
}

async function fetchPaginatedTracks(url) {
  const token = getAccessToken();
  let offset = 0;
  const limit = 50;
  let total = Infinity;
  let songs = [];

  while (offset < total) {
    const response = await fetch(
      `${url}?limit=${limit}&offset=${offset}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (!response.ok) {
      console.error('Failed to fetch tracks:', response.status);
      break;
    }

    const data = await response.json();
    total = data.total;
    songs = songs.concat(parseTracks(data.items));
    offset += limit;
  }

  return songs;
}

async function fetchLikedSongs() {
  allSongs = await fetchPaginatedTracks('https://api.spotify.com/v1/me/tracks');
  console.log(`Loaded ${allSongs.length} liked songs`);
}

async function fetchPlaylistTracks(playlistId) {
  allSongs = await fetchPaginatedTracks(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`);
  console.log(`Loaded ${allSongs.length} playlist songs`);
}

async function fetchPlaylists() {
  const token = getAccessToken();
  let offset = 0;
  const limit = 50;
  let total = Infinity;

  allPlaylists = [];

  while (offset < total) {
    const response = await fetch(
      `https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (!response.ok) {
      console.error('Failed to fetch playlists:', response.status);
      break;
    }

    const data = await response.json();
    total = data.total;

    for (const playlist of data.items) {
      allPlaylists.push({
        id: playlist.id,
        name: playlist.name,
      });
    }

    offset += limit;
  }

  console.log(`Loaded ${allPlaylists.length} playlists`);
}

function populatePlaylistDropdown() {
  const select = document.getElementById('playlist-select');
  select.innerHTML = '';

  const likedOption = document.createElement('option');
  likedOption.value = 'liked';
  likedOption.textContent = 'Liked Songs';
  select.appendChild(likedOption);

  for (const playlist of allPlaylists) {
    const option = document.createElement('option');
    option.value = playlist.id;
    option.textContent = playlist.name;
    select.appendChild(option);
  }
}

async function onPlaylistChange() {
  const select = document.getElementById('playlist-select');
  const value = select.value;

  // Check cache first
  if (cachedTracks[value]) {
    allSongs = cachedTracks[value];
    console.log(`Loaded ${allSongs.length} songs from cache`);
    initSlotMachine();
    return;
  }

  // Not cached — fetch from Spotify
  const token = getAccessToken();
  if (!token) {
    console.error('No access token — cannot fetch uncached playlist');
    return;
  }

  document.getElementById('loading-screen').style.display = 'block';
  document.querySelector('.machine-frame').style.display = 'none';
  document.getElementById('spin-btn').style.display = 'none';

  if (value === 'liked') {
    await fetchLikedSongs();
  } else {
    await fetchPlaylistTracks(value);
  }

  // Cache the fetched tracks
  cachedTracks[value] = allSongs;
  saveCache();

  document.getElementById('loading-screen').style.display = 'none';
  document.querySelector('.machine-frame').style.display = 'block';
  document.getElementById('spin-btn').style.display = 'inline-block';
  initSlotMachine();
}

async function syncWithSpotify() {
  const token = getAccessToken();
  if (!token) {
    loginWithSpotify();
    return;
  }

  const syncBtn = document.getElementById('sync-btn');
  syncBtn.disabled = true;
  syncBtn.textContent = 'SYNCING...';

  document.getElementById('loading-screen').style.display = 'block';
  document.querySelector('.machine-frame').style.display = 'none';
  document.getElementById('spin-btn').style.display = 'none';

  await Promise.all([fetchLikedSongs(), fetchPlaylists()]);

  // Cache liked songs and update playlist dropdown
  const select = document.getElementById('playlist-select');
  const currentValue = select.value || 'liked';

  cachedTracks['liked'] = allSongs;

  // If current selection is a playlist, re-fetch that too
  if (currentValue !== 'liked') {
    await fetchPlaylistTracks(currentValue);
    cachedTracks[currentValue] = allSongs;
  }

  saveCache();
  populatePlaylistDropdown();

  // Restore selection
  select.value = currentValue;

  document.getElementById('loading-screen').style.display = 'none';
  document.querySelector('.machine-frame').style.display = 'block';
  document.getElementById('spin-btn').style.display = 'inline-block';
  syncBtn.disabled = false;
  syncBtn.textContent = 'SYNC';
  initSlotMachine();
}

// --- Slot Machine ---

const NUM_SLOTS = 3;
const REEL_ITEMS = 20; // number of album arts that scroll through the reel
let selectedSongs = [];
let currentSlot = 0;
let isSpinning = false;

function pickRandomSongs(count) {
  const available = allSongs.filter(s => !selectedSongs.includes(s));
  const picks = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * available.length);
    picks.push(available.splice(idx, 1)[0]);
  }
  return picks;
}

function getRandomFillerSongs(count, exclude) {
  const available = allSongs.filter(s => !exclude.includes(s));
  const fillers = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * available.length);
    fillers.push(available[idx]);
  }
  return fillers;
}

function buildReel(slotIndex, targetSong) {
  const reel = document.getElementById(`reel-${slotIndex}`);
  reel.innerHTML = '';
  reel.style.transition = 'none';
  reel.style.transform = 'translateY(0)';

  const fillers = getRandomFillerSongs(REEL_ITEMS - 1, [targetSong]);
  const songs = [...fillers, targetSong]; // target is last

  for (const song of songs) {
    const item = document.createElement('div');
    item.className = 'reel-item';
    const img = document.createElement('img');
    img.src = song.albumArt;
    img.alt = song.name;
    item.appendChild(img);
    reel.appendChild(item);
  }

  return songs.length;
}

function spinSlot(slotIndex) {
  return new Promise(resolve => {
    const reel = document.getElementById(`reel-${slotIndex}`);
    const label = document.getElementById(`label-${slotIndex}`);
    const itemCount = reel.children.length;
    const itemHeight = reel.children[0].offsetHeight;
    const totalScroll = (itemCount - 1) * itemHeight;

    // Force reflow so transition works after resetting transform
    void reel.offsetHeight;

    reel.style.transition = `transform 2s cubic-bezier(0.25, 0.1, 0.25, 1)`;
    reel.style.transform = `translateY(-${totalScroll}px)`;

    reel.addEventListener('transitionend', () => {
      const song = selectedSongs[slotIndex];
      label.innerHTML = `<span class="song-name">${song.name}</span><span class="song-artist">${song.artist}</span><span class="song-meta" id="meta-${slotIndex}"></span>`;
      updateMetaLabel(slotIndex, song);

      resolve();
    }, { once: true });
  });
}

async function onSpinClick() {
  if (isSpinning) return;

  const btn = document.getElementById('spin-btn');

  // Starting a fresh round
  if (currentSlot === 0) {
    selectedSongs = pickRandomSongs(NUM_SLOTS);
    // Clear labels
    for (let i = 0; i < NUM_SLOTS; i++) {
      document.getElementById(`label-${i}`).textContent = '';
      document.getElementById(`reel-${i}`).innerHTML = '';
    }
  }

  isSpinning = true;
  btn.disabled = true;

  buildReel(currentSlot, selectedSongs[currentSlot]);
  await spinSlot(currentSlot);

  currentSlot++;
  isSpinning = false;
  btn.disabled = false;

  if (currentSlot >= NUM_SLOTS) {
    btn.textContent = 'SPIN AGAIN';
    currentSlot = 0;
  } else {
    btn.textContent = 'NEXT';
  }
}

function updateMetaLabel(slotIndex, song) {
  const meta = document.getElementById(`meta-${slotIndex}`);
  if (!meta) return;
  const parts = [];
  if (song.bpm) parts.push(`${song.bpm} BPM`);
  if (song.key) parts.push(song.key);
  if (song.genre) parts.push(song.genre);
  meta.textContent = parts.length ? parts.join(' · ') : '';
}

function initSlotMachine() {
  const btn = document.getElementById('spin-btn');
  btn.textContent = 'SPIN';
  btn.disabled = false;
  currentSlot = 0;
  selectedSongs = [];
}

// --- App Init ---

function showSlotMachine() {
  document.getElementById('connect-screen').style.display = 'none';
  document.getElementById('slot-machine').style.display = 'flex';
  document.getElementById('loading-screen').style.display = 'none';
  document.querySelector('.machine-frame').style.display = 'block';
  document.getElementById('spin-btn').style.display = 'inline-block';
  document.getElementById('playlist-selector').style.display = 'block';
}

async function init() {
  const cache = loadCache();
  const token = getAccessToken();

  // Cache exists — load instantly without needing auth
  if (cache && cache.tracks && cache.tracks['liked']) {
    allPlaylists = cache.playlists || [];
    cachedTracks = cache.tracks;
    allSongs = cachedTracks['liked'];
    populatePlaylistDropdown();
    updateLastSyncedDisplay(cache.lastSynced);
    showSlotMachine();
    initSlotMachine();
    return;
  }

  // No cache — need auth + fetch
  if (token) {
    document.getElementById('connect-screen').style.display = 'none';
    document.getElementById('slot-machine').style.display = 'flex';
    document.getElementById('loading-screen').style.display = 'block';
    document.querySelector('.machine-frame').style.display = 'none';
    document.getElementById('spin-btn').style.display = 'none';

    await Promise.all([fetchLikedSongs(), fetchPlaylists()]);

    cachedTracks['liked'] = allSongs;
    saveCache();
    populatePlaylistDropdown();

    document.getElementById('loading-screen').style.display = 'none';
    document.querySelector('.machine-frame').style.display = 'block';
    document.getElementById('spin-btn').style.display = 'inline-block';
    document.getElementById('playlist-selector').style.display = 'block';
    initSlotMachine();
  }
}

document.addEventListener('DOMContentLoaded', init);
