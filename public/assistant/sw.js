const CACHE_NAME = "maree-owner-console-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];
const APP_SHELL_PATHS = new Set(
  APP_SHELL.map(asset => new URL(asset, self.registration.scope).pathname)
);
const INDEX_URL = new URL("./index.html", self.registration.scope).href;

function isCacheable(response) {
  const directives = (response.headers.get("Cache-Control") || "")
    .split(",")
    .map(directive => directive.trim().split("=", 1)[0].trim().toLowerCase());
  return response.ok && !directives.includes("private") && !directives.includes("no-store");
}

function isAppShellRequest(request, url) {
  return request.method === "GET" &&
    url.origin === self.location.origin &&
    url.search === "" &&
    url.hash === "" &&
    APP_SHELL_PATHS.has(url.pathname);
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        for (const asset of APP_SHELL) {
          const url = new URL(asset, self.registration.scope).href;
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Failed to cache app-shell asset: ${asset}`);
          if (isCacheable(response)) await cache.put(url, response.clone());
        }
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith("maree-owner-console-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (!isAppShellRequest(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        try {
          const response = await fetch(request);
          if (isCacheable(response)) await cache.put(INDEX_URL, response.clone());
          return response;
        } catch {
          return await cache.match(INDEX_URL) || Response.error();
        }
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (isCacheable(response)) await cache.put(request, response.clone());
      return response;
    })
  );
});
