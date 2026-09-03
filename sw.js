// Service worker minimale: network-first, cache solo come rete di sicurezza.
// Cosi' gli aggiornamenti arrivano sempre e l'app si apre anche senza rete.
const CACHE = "flip7-v43";
const SHELL = [
  "./", "./index.html", "./css/styles.css", "./icon.svg", "./manifest.webmanifest",
  "./js/app.js", "./js/store.js", "./js/stats.js", "./js/scoring.js", "./js/ui.js",
  "./js/prefs.js", "./js/config.js", "./js/icons.js", "./js/theme.js", "./js/avatar.js",
  "./js/views/live.js", "./js/views/leaderboard.js", "./js/views/history.js", "./js/views/setup.js",
  "./js/views/table.js", "./js/game.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== location.origin) return; // Firebase e CDN passano diretti

  e.respondWith(
    // "no-cache" = chiedi sempre al server se il file e' cambiato (ETag):
    // se non lo e' risponde 304 in un attimo, se lo e' arriva subito il nuovo.
    // Cosi' gli aggiornamenti non restano bloccati nella cache del browser.
    fetch(new Request(e.request, { cache: "no-cache" }))
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
