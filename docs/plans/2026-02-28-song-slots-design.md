# 2026-02-28 — Song Slots: Randomized Music Selector

## Overview

A retro arcade-style slot machine web app that connects to Spotify, pulls from the user's Liked Songs, and randomly selects 3 songs — revealed one at a time with a spinning slot machine animation.

Localhost-only for now. Single user. No backend.

## Architecture

- **Single static SPA** — `index.html`, `style.css`, `app.js`. No build step, no dependencies.
- **Served locally** via `python -m http.server` or similar.
- **Spotify Auth:** Authorization Code with PKCE flow, entirely client-side. Redirect URI: `http://localhost:8000/callback`.
- **No backend, no secrets.** PKCE replaces the client secret. Access token stored in memory only.

### Flow

1. User opens `localhost:8000` → clicks "Connect Spotify"
2. Redirects to Spotify login → returns with auth code
3. App exchanges code for access token (PKCE)
4. App fetches all liked songs (paginated at 50/request)
5. User taps SPIN → slot machine reveals songs one by one

## Slot Machine UX

### Layout

Three vertical slots side by side. Each slot displays album art + song name.

### Interaction

1. After Spotify auth → 3 empty slots + SPIN button
2. Tap SPIN → Slot 1 spins (album arts scroll vertically), lands on random song
3. Tap NEXT → Slot 2 spins and stops
4. Tap NEXT → Slot 3 spins and stops
5. All revealed → button becomes SPIN AGAIN (resets all 3)

### Constraints

- No duplicate songs across the 3 slots
- Songs drawn from Liked Songs library only (v1)

## Visual Style

- **Retro arcade aesthetic** — dark background, scanline/CRT texture
- **Slot machine frame** — chrome/metallic border via CSS gradients + box shadows
- **Neon glow accents** — green and pink/magenta
- **Retro font** — "Press Start 2P" or similar pixel font from Google Fonts
- **Album art** in slot windows with rounded-pixel borders
- **Song names** below each slot in a retro-compatible font
- **No title** — just the slot machine, front and center
- **SPIN button** — large, arcade-style, pulsing glow. Label changes: SPIN → NEXT → NEXT → SPIN AGAIN

## Technical Details

### Spotify API

- **Auth:** PKCE flow via `/authorize` and `/api/token`
- **Liked songs:** `GET /v1/me/tracks`, paginated (50/request), fetched on connect
- **Read-only** — no playback or write operations
- **Scopes:** `user-library-read`

### Song Selection

- Random selection via `Math.random()` from the liked songs array
- Exclude already-selected songs to prevent duplicates

### Spinning Animation

- CSS-driven vertical scroll via `transform: translateY()` with easing
- Each slot contains ~10-15 random album arts scrolling through
- Pre-selected winner placed at the end of the strip so deceleration lands on it

### File Structure

```
random_mix/
  index.html
  style.css
  app.js
```

## Future Considerations (not in v1)

- Additional song sources (playlists, top tracks)
- Timer-based auto-spin
- Full song cards (artist, preview/play button)
- TikTok filter/effect version
- Deployment to a public URL
