// FIM 採点パッド：オフライン起動用サービスワーカー
// 方針：キャッシュを即座に返し（圏外でも起動できる）、裏で最新版を取得して次回起動時に反映する。
// 検査データはページ側の localStorage にだけ保存され、ここでは一切扱わない。
const CACHE = "fim-v1.1";
const PRECACHE = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // 1ファイル欠けても他はキャッシュする
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then(async (res) => {
          if (res && res.ok) {
            // HTMLが更新されていたらページに知らせる
            if (cached && req.mode === "navigate") {
              const [a, b] = await Promise.all([cached.clone().text(), res.clone().text()]);
              if (a !== b) notifyUpdate();
            }
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      const res = await network;
      return res || new Response("オフラインのため読み込めません", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    })
  );
});

function notifyUpdate() {
  self.clients.matchAll({ type: "window" }).then((clients) => {
    clients.forEach((c) => c.postMessage({ type: "fim-update-available" }));
  });
}
