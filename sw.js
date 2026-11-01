// Offline shell: serve the app from cache, refresh it in the background.
const CACHE = "esc-v9";
const SHELL = ["./", "index.html", "srd.js", "engine.js", "backend.js", "config.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.hostname.endsWith("supabase.co")) return; // live data always goes to the network
  // The app's own files: try the network first so updates show up on the next open; fall back to the cache offline.
  if (u.origin === location.origin) {
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cl = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cl)); } return r; }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => {
    const net = fetch(e.request).then(r => { if (r.ok && (u.origin === location.origin || u.hostname === "cdn.jsdelivr.net" || u.hostname.includes("fonts."))) { const cl = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cl)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
