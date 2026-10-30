'use strict';
const SHELL_CACHE = 'oim-shell-v3';
const VOICE_CACHE = 'oim-voice-v1';
const SHELL_FILES = ['./', './index.html', './profile.css', './profile.js', './linux.js', './icon.svg', './manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.addAll(SHELL_FILES)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== SHELL_CACHE && k !== VOICE_CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

async function serveVoiceWithRange(req) {
  const cache = await caches.open(VOICE_CACHE);
  const cleanUrl = req.url;
  let full = await cache.match(cleanUrl);
  if (!full) {
    // If browser sent a Range header and we don't have the full MP3 cached yet, let network handle Range directly
    // and warm the full MP3 in the background for offline replay.
    if (req.headers.has('range')) {
      fetch(cleanUrl).then(r => { if (r && r.status === 200) cache.put(cleanUrl, r); }).catch(() => {});
      return fetch(req);
    }
    const net = await fetch(req);
    if (net && net.status === 200) cache.put(cleanUrl, net.clone());
    return net;
  }
  const range = req.headers.get('range');
  if (!range) return full;
  const buf = await full.arrayBuffer();
  const m = /bytes=(\d+)-(\d*)/.exec(range);
  if (!m) return full;
  const start = Math.min(Number(m[1]), Math.max(0, buf.byteLength - 1));
  const end = m[2] ? Math.min(Number(m[2]), buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': full.headers.get('Content-Type') || 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`
    }
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/voice/') && url.pathname.endsWith('.mp3')) {
    event.respondWith(serveVoiceWithRange(req));
    return;
  }

  // Network-first for HTML/CSS/JS shell so updates appear immediately, falling back to cache offline
  event.respondWith(
    fetch(req).then(res => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});

