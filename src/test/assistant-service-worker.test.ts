import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

const workerSource = readFileSync(resolve(process.cwd(), "public/assistant/sw.js"), "utf8");

type WorkerEvent = {
  request: { url: string; method: string; mode: string };
  respondWith: ReturnType<typeof vi.fn>;
};

function loadWorker({
  networkResponse = new Response("public static response"),
  cachedResponse,
  cacheKeys = [],
  fetchMock = vi.fn(async () => networkResponse),
}: {
  networkResponse?: Response;
  cachedResponse?: Response;
  cacheKeys?: string[];
  fetchMock?: ReturnType<typeof vi.fn>;
} = {}) {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const cache = {
    addAll: vi.fn(async () => undefined),
    match: vi.fn(async () => cachedResponse),
    put: vi.fn(async () => undefined),
  };
  const cachesApi = {
    open: vi.fn(async () => cache),
    match: vi.fn(async () => undefined),
    keys: vi.fn(async () => cacheKeys),
    delete: vi.fn(async () => true),
  };
  const selfMock = {
    addEventListener: (type: string, handler: (event: WorkerEvent) => void) => handlers.set(type, handler),
    location: new URL("https://maree.test/assistant/sw.js"),
    registration: { scope: "https://maree.test/assistant/" },
    clients: { claim: vi.fn(async () => undefined) },
  };

  runInNewContext(workerSource, { self: selfMock, caches: cachesApi, fetch: fetchMock, URL, Promise, Response });

  return { handlers, cache, cachesApi, fetchMock };
}

function dispatchFetch(handler: (event: WorkerEvent) => void, url: string, mode = "cors") {
  let response: Promise<Response> | undefined;
  const event: WorkerEvent = {
    request: { url, method: "GET", mode },
    respondWith: vi.fn((value: Promise<Response>) => { response = Promise.resolve(value); }),
  };
  handler(event);
  return { event, response };
}

it("leaves non-static same-origin GETs untouched instead of caching them", () => {
  const { handlers, cachesApi, fetchMock } = loadWorker();
  const { event } = dispatchFetch(handlers.get("fetch")!, "https://maree.test/assistant/api/account");

  expect(event.respondWith).not.toHaveBeenCalled();
  expect(cachesApi.open).not.toHaveBeenCalled();
  expect(cachesApi.match).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("looks up static assets only in its named cache", async () => {
  const { handlers, cache, cachesApi } = loadWorker();
  const { response } = dispatchFetch(handlers.get("fetch")!, "https://maree.test/assistant/style.css");

  await response;

  expect(cache.match).toHaveBeenCalled();
  expect(cachesApi.match).not.toHaveBeenCalled();
});

it("does not store private or no-store responses", async () => {
  const response = new Response("private static path response", {
    headers: { "Cache-Control": "private, no-store" },
  });
  const { handlers, cache } = loadWorker({ networkResponse: response });
  const { response: result } = dispatchFetch(handlers.get("fetch")!, "https://maree.test/assistant/style.css");

  await result;

  expect(cache.put).not.toHaveBeenCalled();
});

it("serves the cached app shell on a hard navigation when the network is offline", async () => {
  const cachedIndex = new Response("cached app shell");
  const offlineFetch = vi.fn(async () => { throw new TypeError("offline"); });
  const { handlers, cache, fetchMock } = loadWorker({ cachedResponse: cachedIndex, fetchMock: offlineFetch });
  const { event, response } = dispatchFetch(handlers.get("fetch")!, "https://maree.test/assistant/", "navigate");

  await expect(response).resolves.toBe(cachedIndex);
  expect(event.respondWith).toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledWith(event.request);
  expect(cache.match).toHaveBeenCalledWith("https://maree.test/assistant/index.html");
});

it("does not intercept static paths with query strings", () => {
  const { handlers, cache, fetchMock } = loadWorker();
  const { event } = dispatchFetch(handlers.get("fetch")!, "https://maree.test/assistant/?token=not-cacheable", "navigate");

  expect(event.respondWith).not.toHaveBeenCalled();
  expect(cache.match).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("removes only stale Marée app-shell caches during an update", async () => {
  const { handlers, cachesApi } = loadWorker({
    cacheKeys: ["maree-owner-console-v2", "unrelated-app-cache"],
  });
  let activation: Promise<unknown> | undefined;
  handlers.get("activate")!({
    request: { url: "", method: "GET", mode: "cors" },
    respondWith: vi.fn(),
    waitUntil: (promise: Promise<unknown>) => { activation = promise; },
  } as unknown as WorkerEvent);

  await activation;

  expect(cachesApi.delete).toHaveBeenCalledTimes(1);
  expect(cachesApi.delete).toHaveBeenCalledWith("maree-owner-console-v2");
  expect(cachesApi.delete).not.toHaveBeenCalledWith("unrelated-app-cache");
});

