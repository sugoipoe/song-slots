# Song Slots Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a retro arcade slot machine web app that connects to Spotify, fetches liked songs, and randomly reveals 3 songs one at a time with spinning animations.

**Architecture:** Single static SPA (index.html + style.css + app.js) with no backend, no build step, no dependencies. Spotify auth via PKCE flow entirely client-side. Served on `http://127.0.0.1:8000`. Note: Spotify deprecated `localhost` redirect URIs in Nov 2025 — use `127.0.0.1` instead.

**Tech Stack:** Vanilla HTML/CSS/JS, Spotify Web API, CSS animations, Google Fonts (Press Start 2P)

---

## Prerequisites

Before starting, the developer must:

1. Go to https://developer.spotify.com/dashboard
2. Create a new app (name: "Song Slots", redirect URI: `http://127.0.0.1:8000/callback.html`)
3. Copy the **Client ID** (no client secret needed for PKCE)
4. Note: The redirect URI uses `127.0.0.1`, NOT `localhost`

---

## Task 1: Spotify Auth — PKCE Flow

**Files:**
- Create: `app.js`
- Create: `index.html`
- Create: `callback.html`

This task builds the OAuth login flow. After this task, clicking "Connect Spotify" will redirect to Spotify, and returning will store an access token in memory.

**Step 1: Create `index.html` with a Connect button**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Song Slots</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">
    <div id="connect-screen">
      <button id="connect-btn" onclick="loginWithSpotify()">CONNECT SPOTIFY</button>
    </div>
    <div id="slot-machine" style="display: none;">
      <!-- Slots go here in Task 3 -->
    </div>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

**Step 2: Create `callback.html`**

This page handles the OAuth redirect. Spotify returns the auth code here, and this page exchanges it for a token and redirects back to `index.html`.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Song Slots — Connecting...</title>
</head>
<body>
  <p>Connecting to Spotify...</p>
  <script>
    const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
    const REDIRECT_URI = 'http://127.0.0.1:8000/callback.html';

    async function handleCallback() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const error = params.get('error');

      if (error) {
        alert('Spotify authorization failed: ' + error);
        window.location.href = '/';
        return;
      }

      if (!code) {
        window.location.href = '/';
        return;
      }

      const codeVerifier = localStorage.getItem('code_verifier');
      if (!codeVerifier) {
        alert('Missing code verifier. Please try connecting again.');
        window.location.href = '/';
        return;
      }

      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: REDIRECT_URI,
          code_verifier: codeVerifier,
        }),
      });

      const data = await response.json();
      if (data.access_token) {
        sessionStorage.setItem('access_token', data.access_token);
        localStorage.removeItem('code_verifier');
        window.location.href = '/';
      } else {
        alert('Failed to get access token.');
        window.location.href = '/';
      }
    }

    handleCallback();
  </script>
</body>
</html>
```

**Step 3: Create `app.js` with PKCE auth functions**

```javascript
const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
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

// --- App Init ---

function init() {
  const token = getAccessToken();
  if (token) {
    document.getElementById('connect-screen').style.display = 'none';
    document.getElementById('slot-machine').style.display = 'flex';
    // Task 2 will call fetchLikedSongs() here
  }
}

document.addEventListener('DOMContentLoaded', init);
```

**Step 4: Create a minimal `style.css` placeholder**

```css
/* Styles will be built out in Task 4 */
body {
  margin: 0;
  background: #111;
  color: #fff;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  font-family: sans-serif;
}

#connect-btn {
  font-size: 1.2rem;
  padding: 1rem 2rem;
  cursor: pointer;
}
```

**Step 5: Test manually**

Run: `python3 -m http.server 8000` from the project root.

1. Open `http://127.0.0.1:8000`
2. Click "Connect Spotify"
3. Should redirect to Spotify login
4. After authorizing, should redirect back and the connect screen should disappear
5. Check browser console: `sessionStorage.getItem('access_token')` should return a token string

**Step 6: Commit**

```bash
git add index.html callback.html app.js style.css
git commit -m "feat: add Spotify PKCE auth flow"
```

---

## Task 2: Fetch Liked Songs from Spotify

**Files:**
- Modify: `app.js`

This task fetches all of the user's liked songs from Spotify after authentication. The Spotify API paginates at 50 items per request, so we fetch all pages and store them in an array.

**Step 1: Add the fetch function to `app.js`**

Add after the auth functions, before `init()`:

```javascript
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
```

**Step 2: Call fetchLikedSongs from init()**

Update the `init()` function:

```javascript
async function init() {
  const token = getAccessToken();
  if (token) {
    document.getElementById('connect-screen').style.display = 'none';
    document.getElementById('slot-machine').style.display = 'flex';
    await fetchLikedSongs();
    // Task 3 will set up the slot machine here
  }
}
```

Note: change `function init()` to `async function init()`.

**Step 3: Test manually**

1. Run `python3 -m http.server 8000`
2. Open `http://127.0.0.1:8000`, connect to Spotify
3. Open browser console — should see `Loaded N liked songs`
4. Type `allSongs[0]` in console — should show an object with `name`, `artist`, `albumArt`, `albumArtSmall`

**Step 4: Commit**

```bash
git add app.js
git commit -m "feat: fetch all liked songs from Spotify API"
```

---

## Task 3: Slot Machine Core Logic & HTML Structure

**Files:**
- Modify: `index.html`
- Modify: `app.js`

This task builds the slot machine DOM structure and the core logic: selecting random songs, managing state (which slot is active), and handling the spin button.

**Step 1: Update `index.html` slot machine markup**

Replace the `<!-- Slots go here in Task 3 -->` comment inside `#slot-machine`:

```html
<div id="slot-machine" style="display: none;">
  <div class="slots-container">
    <div class="slot" id="slot-0">
      <div class="slot-window">
        <div class="slot-reel" id="reel-0"></div>
      </div>
      <div class="slot-label" id="label-0"></div>
    </div>
    <div class="slot" id="slot-1">
      <div class="slot-window">
        <div class="slot-reel" id="reel-1"></div>
      </div>
      <div class="slot-label" id="label-1"></div>
    </div>
    <div class="slot" id="slot-2">
      <div class="slot-window">
        <div class="slot-reel" id="reel-2"></div>
      </div>
      <div class="slot-label" id="label-2"></div>
    </div>
  </div>
  <button id="spin-btn" onclick="onSpinClick()">SPIN</button>
</div>
```

**Step 2: Add slot machine logic to `app.js`**

Add after the Spotify API section, before `init()`:

```javascript
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
```

**Step 3: Update init() to call initSlotMachine()**

```javascript
async function init() {
  const token = getAccessToken();
  if (token) {
    document.getElementById('connect-screen').style.display = 'none';
    document.getElementById('slot-machine').style.display = 'flex';
    await fetchLikedSongs();
    initSlotMachine();
  }
}
```

**Step 4: Add basic slot CSS to `style.css`**

Replace the placeholder content:

```css
:root {
  --slot-height: 200px;
  --slot-width: 200px;
}

body {
  margin: 0;
  background: #111;
  color: #fff;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  font-family: sans-serif;
}

#app {
  text-align: center;
}

#connect-btn {
  font-size: 1.2rem;
  padding: 1rem 2rem;
  cursor: pointer;
  background: #1db954;
  color: #fff;
  border: none;
  border-radius: 8px;
}

#slot-machine {
  flex-direction: column;
  align-items: center;
  gap: 2rem;
}

.slots-container {
  display: flex;
  gap: 1.5rem;
}

.slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.slot-window {
  width: var(--slot-width);
  height: var(--slot-height);
  overflow: hidden;
  border: 3px solid #555;
  border-radius: 4px;
  background: #222;
}

.slot-reel {
  display: flex;
  flex-direction: column;
}

.reel-item {
  width: var(--slot-width);
  height: var(--slot-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.reel-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.slot-label {
  font-size: 0.75rem;
  max-width: var(--slot-width);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-height: 1.2em;
}

#spin-btn {
  font-size: 1.2rem;
  padding: 1rem 3rem;
  cursor: pointer;
  background: #1db954;
  color: #fff;
  border: none;
  border-radius: 8px;
}

#spin-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

**Step 5: Test manually**

1. Run `python3 -m http.server 8000`
2. Open `http://127.0.0.1:8000`, connect to Spotify
3. Click SPIN — first slot should animate album arts scrolling down and land on a song
4. Click NEXT — second slot spins
5. Click NEXT — third slot spins
6. Button should now say "SPIN AGAIN"
7. All 3 songs should be different

**Step 6: Commit**

```bash
git add index.html app.js style.css
git commit -m "feat: add slot machine core logic and spinning animation"
```

---

## Task 4: Retro Arcade Visual Style

**Files:**
- Modify: `style.css`
- Modify: `index.html` (add Google Font link)

This task applies the retro arcade aesthetic: CRT/scanline effects, neon glows, pixel font, metallic slot machine frame.

**Step 1: Add Google Font to `index.html`**

Add inside `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
```

**Step 2: Replace `style.css` with the full retro style**

```css
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 10px #1db954, 0 0 20px #1db954; }
  50% { box-shadow: 0 0 20px #1db954, 0 0 40px #1db954, 0 0 60px #1db95488; }
}

@keyframes scanline {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(100%); }
}

:root {
  --slot-height: 200px;
  --slot-width: 200px;
  --neon-green: #39ff14;
  --neon-pink: #ff6ec7;
  --chrome-light: #d0d0d0;
  --chrome-dark: #3a3a3a;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #0a0a0a;
  color: #fff;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  font-family: 'Press Start 2P', monospace;
  overflow: hidden;
}

/* CRT scanline overlay */
body::after {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.15) 0px,
    rgba(0, 0, 0, 0.15) 1px,
    transparent 1px,
    transparent 3px
  );
  pointer-events: none;
  z-index: 1000;
}

#app {
  text-align: center;
  position: relative;
  z-index: 1;
}

/* --- Connect Screen --- */

#connect-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
}

#connect-btn {
  font-family: 'Press Start 2P', monospace;
  font-size: 1rem;
  padding: 1.2rem 2.5rem;
  cursor: pointer;
  background: #111;
  color: var(--neon-green);
  border: 3px solid var(--neon-green);
  text-transform: uppercase;
  letter-spacing: 2px;
  animation: pulse-glow 2s ease-in-out infinite;
  transition: all 0.2s;
}

#connect-btn:hover {
  background: var(--neon-green);
  color: #000;
}

/* --- Slot Machine --- */

#slot-machine {
  flex-direction: column;
  align-items: center;
  gap: 2rem;
}

.machine-frame {
  background: linear-gradient(145deg, #4a4a4a, #2a2a2a);
  border: 4px solid;
  border-image: linear-gradient(180deg, var(--chrome-light), var(--chrome-dark)) 1;
  border-radius: 12px;
  padding: 2rem 2.5rem;
  box-shadow:
    0 0 15px rgba(0, 0, 0, 0.8),
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    inset 0 -1px 0 rgba(0, 0, 0, 0.3);
}

.slots-container {
  display: flex;
  gap: 1.5rem;
}

.slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.slot-window {
  width: var(--slot-width);
  height: var(--slot-height);
  overflow: hidden;
  border: 3px solid var(--neon-pink);
  border-radius: 4px;
  background: #111;
  box-shadow:
    0 0 8px rgba(255, 110, 199, 0.4),
    inset 0 0 20px rgba(0, 0, 0, 0.5);
}

.slot-reel {
  display: flex;
  flex-direction: column;
}

.reel-item {
  width: var(--slot-width);
  height: var(--slot-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
}

.reel-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 2px;
  image-rendering: auto;
}

.slot-label {
  font-family: 'Press Start 2P', monospace;
  font-size: 0.5rem;
  max-width: var(--slot-width);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-height: 1.2em;
  color: var(--neon-green);
  text-shadow: 0 0 6px var(--neon-green);
}

/* --- Spin Button --- */

#spin-btn {
  font-family: 'Press Start 2P', monospace;
  font-size: 1rem;
  padding: 1rem 3rem;
  cursor: pointer;
  background: #111;
  color: var(--neon-pink);
  border: 3px solid var(--neon-pink);
  text-transform: uppercase;
  letter-spacing: 2px;
  transition: all 0.2s;
  box-shadow: 0 0 10px rgba(255, 110, 199, 0.3);
}

#spin-btn:hover:not(:disabled) {
  background: var(--neon-pink);
  color: #000;
  box-shadow: 0 0 20px rgba(255, 110, 199, 0.6);
}

#spin-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
```

**Step 3: Wrap slots in a machine frame**

In `index.html`, wrap `.slots-container` with a frame div:

```html
<div id="slot-machine" style="display: none;">
  <div class="machine-frame">
    <div class="slots-container">
      <!-- ...slots remain the same... -->
    </div>
  </div>
  <button id="spin-btn" onclick="onSpinClick()">SPIN</button>
</div>
```

**Step 4: Test manually**

1. Run `python3 -m http.server 8000`
2. Verify: Dark background with scanline overlay
3. Verify: "CONNECT SPOTIFY" button has neon green glow
4. After connecting: Slot machine has metallic frame, pink neon borders
5. Spin button has pink neon style
6. Song labels glow green
7. Everything uses pixel font

**Step 5: Commit**

```bash
git add index.html style.css
git commit -m "feat: apply retro arcade visual style with CRT effects and neon glows"
```

---

## Task 5: Polish & Loading State

**Files:**
- Modify: `app.js`
- Modify: `index.html`
- Modify: `style.css`

This task adds a loading indicator while songs are being fetched and smooths out rough edges.

**Step 1: Add loading state to `index.html`**

Add a loading message inside `#slot-machine`, before the machine frame:

```html
<div id="loading-screen" style="display: none;">
  <p class="loading-text">LOADING SONGS...</p>
</div>
```

**Step 2: Add loading CSS to `style.css`**

```css
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.loading-text {
  font-family: 'Press Start 2P', monospace;
  font-size: 0.8rem;
  color: var(--neon-green);
  text-shadow: 0 0 10px var(--neon-green);
  animation: blink 1.5s ease-in-out infinite;
}
```

**Step 3: Update `init()` in `app.js` to show loading state**

```javascript
async function init() {
  const token = getAccessToken();
  if (token) {
    document.getElementById('connect-screen').style.display = 'none';
    document.getElementById('slot-machine').style.display = 'flex';
    document.getElementById('loading-screen').style.display = 'block';
    document.querySelector('.machine-frame').style.display = 'none';
    document.getElementById('spin-btn').style.display = 'none';

    await fetchLikedSongs();

    document.getElementById('loading-screen').style.display = 'none';
    document.querySelector('.machine-frame').style.display = 'block';
    document.getElementById('spin-btn').style.display = 'inline-block';
    initSlotMachine();
  }
}
```

**Step 4: Test manually**

1. Connect to Spotify
2. Should see "LOADING SONGS..." with a blinking animation
3. Once loaded, machine frame and SPIN button appear
4. Full flow works: SPIN → NEXT → NEXT → SPIN AGAIN

**Step 5: Commit**

```bash
git add index.html style.css app.js
git commit -m "feat: add loading state while fetching liked songs"
```

---

## Summary

| Task | What it does |
|------|-------------|
| 1 | Spotify PKCE auth flow (login, callback, token) |
| 2 | Fetch all liked songs from Spotify API |
| 3 | Slot machine HTML, core logic, spinning animation |
| 4 | Retro arcade visual styling (CRT, neon, pixel font) |
| 5 | Loading state and polish |

After all 5 tasks, you'll have a working retro slot machine at `http://127.0.0.1:8000` that connects to Spotify and randomly picks 3 songs from your liked library.
