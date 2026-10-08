// Njësia 5 service worker. It caches nothing and never stands between the app and fresh data:
// its only job is a friendly page when the phone has no connection, instead of the browser's error.
const OFFLINE = `<!doctype html><html lang="sq"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pa lidhje · Njësia 5</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-content:center;gap:1rem;padding:24px;font-family:system-ui,sans-serif;background:#f3f3f0;color:#1c1d1f;text-align:center}
.z{display:flex;gap:10px;justify-content:center}.z i{width:18px;height:64px;background:#f3c12a}h1{font-size:2rem;margin:0;text-transform:uppercase}p{margin:0;max-width:30ch}
button{font:inherit;font-weight:700;min-height:48px;padding:0 20px;border:0;background:#1c1d1f;color:#f3c12a;cursor:pointer}</style></head>
<body><div class="z"><i></i><i></i><i></i><i></i></div><h1>Pa lidhje</h1><p>Duket se telefoni nuk ka internet. Provo përsëri kur të kthehet lidhja.</p><p lang="en">You are offline. Try again when the connection is back.</p><button onclick="location.reload()">Provo përsëri</button></body></html>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(
    fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'content-type': 'text/html; charset=utf-8' } })),
  );
});
