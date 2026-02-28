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
