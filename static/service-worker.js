/**
 * DiariCore PWA service worker — enables install + faster repeat visits.
 * API requests are always network-only (session cookies).
 */
const CACHE_NAME = 'diaricore-pwa-v1';

const PRECACHE_URLS = [
    '/login.html',
    '/dashboard.html',
    '/entries.html',
    '/write-entry.html',
    '/insights.html',
    '/diariclogo.png',
    '/theme.css',
    '/mobile-global.css',
    '/diari-shell-pending.css',
    '/theme.js',
    '/pwa.js',
    '/pwa.css',
];

function isApiRequest(url) {
    return url.pathname.startsWith('/api/');
}

function isStaticAsset(url) {
    const p = url.pathname;
    if (p.endsWith('.css') || p.endsWith('.js') || p.endsWith('.png') || p.endsWith('.jpg') ||
        p.endsWith('.webp') || p.endsWith('.svg') || p.endsWith('.ico') || p.endsWith('.woff2')) {
        return true;
    }
    return p.endsWith('.html');
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => undefined)
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (isApiRequest(url)) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((res) => {
                    if (res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then((c) => c.put(request, copy));
                    }
                    return res;
                })
                .catch(() =>
                    caches.match(request).then((cached) => cached || caches.match('/login.html'))
                )
        );
        return;
    }

    if (!isStaticAsset(url)) return;

    event.respondWith(
        caches.match(request).then((cached) => {
            const network = fetch(request)
                .then((res) => {
                    if (res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then((c) => c.put(request, copy));
                    }
                    return res;
                })
                .catch(() => cached);

            return cached || network;
        })
    );
});
