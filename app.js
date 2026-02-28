const CLIENT_ID = '3be30b5e47d543a3ad68fc02aea1c875';
const REDIRECT_URI = 'http://127.0.0.1:8000/callback.html';
const SCOPES = 'user-library-read';

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

// --- Spotify API ---

let allSongs = [];

async function fetchLikedSongs() {
  const token = getAccessToken();
  let offset = 0;
  const limit = 50;
  let total = Infinity;

  allSongs = [];

  while (offset < total) {
    const response = await fetch(
      `https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (!response.ok) {
      console.error('Failed to fetch liked songs:', response.status);
      break;
    }

    const data = await response.json();
    total = data.total;

    for (const item of data.items) {
      const track = item.track;
      allSongs.push({
        name: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        albumArt: track.album.images[0]?.url || '',
        albumArtSmall: track.album.images[track.album.images.length - 1]?.url || '',
      });
    }

    offset += limit;
  }

  console.log(`Loaded ${allSongs.length} liked songs`);
}

// --- Slot Machine ---

const NUM_SLOTS = 3;
const REEL_ITEMS = 12; // number of album arts that scroll through the reel
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
    // Each reel-item height is set by CSS (var --slot-height)
    const slotWindow = reel.closest('.slot-window');
    const itemHeight = slotWindow.clientHeight;
    const totalScroll = (itemCount - 1) * itemHeight;

    // Force reflow so transition works after resetting transform
    void reel.offsetHeight;

    reel.style.transition = `transform 2s cubic-bezier(0.25, 0.1, 0.25, 1)`;
    reel.style.transform = `translateY(-${totalScroll}px)`;

    reel.addEventListener('transitionend', () => {
      const song = selectedSongs[slotIndex];
      label.textContent = song.name;
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

function initSlotMachine() {
  const btn = document.getElementById('spin-btn');
  btn.textContent = 'SPIN';
  btn.disabled = false;
  currentSlot = 0;
  selectedSongs = [];
}

// --- App Init ---

async function init() {
  const token = getAccessToken();
  if (token) {
    document.getElementById('connect-screen').style.display = 'none';
    document.getElementById('slot-machine').style.display = 'flex';
    await fetchLikedSongs();
    initSlotMachine();
  }
}

document.addEventListener('DOMContentLoaded', init);
