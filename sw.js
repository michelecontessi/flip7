// Service worker minimale: network-first, cache solo come rete di sicurezza.
// Cosi' gli aggiornamenti arrivano sempre e l'app si apre anche senza rete.
const CACHE = "flip7-v70";
const SHELL = [
  "./", "./index.html", "./css/styles.css", "./icon.svg", "./manifest.webmanifest",
  "./js/app.js", "./js/store.js", "./js/stats.js", "./js/scoring.js", "./js/ui.js",
  "./js/prefs.js", "./js/config.js", "./js/icons.js", "./js/theme.js", "./js/avatar.js",
  "./js/views/live.js", "./js/views/leaderboard.js", "./js/views/history.js", "./js/views/setup.js",
  "./js/views/table.js", "./js/views/rooms.js", "./js/game.js", "./js/vengeance.js", "./js/morph.js",
  "./js/notify.js", "./js/share.js", "./icon-192.png", "./icon-512.png"
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

// Tocco sulla notifica ("tocca a te"): si torna sull'app, al tavolo.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "#tavolo";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const client of list) {
      if ("focus" in client) {
        client.focus();
        if ("navigate" in client && !client.url.endsWith(url)) client.navigate(client.url.split("#")[0] + url).catch(() => {});
        return;
      }
    }
    return self.clients.openWindow(url);
  }));
});
