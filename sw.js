/* ============================================================
   sw.js — Service Worker
   作用：把 App 的骨架（HTML/CSS/JS）存在手機裡，
        出門沒網路也打得開，開啟速度也快很多。

   ⚠ 改版之後記得把下面的 CACHE_NAME 版本號 +1，
     否則使用者的手機會一直用舊的快取，看不到新功能。
   ============================================================ */

const CACHE_NAME = 'trip-app-v1';

// 要預先存起來的檔案。路徑一律用相對路徑（'./'），
// 因為 GitHub Pages 是放在 /trip-app/ 子目錄下，寫成 '/' 開頭會找不到。
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/sample-data.js',
  './js/store.js',
  './js/parser.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// 安裝：把檔案抓下來存好
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())      // 不等舊版關掉，直接接手
  );
});

// 啟用：把舊版本的快取清掉，不然手機空間會愈積愈多
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 抓取策略：cache-first（先看快取，沒有才連網）
   行程 App 的內容幾乎不會變，這樣開啟最快、也最耐沒訊號。 */
self.addEventListener('fetch', event => {
  const req = event.request;
  // 只處理自己網站的 GET；Google Maps 之類的外部連結不要攔
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        // 順手把新抓到的存起來，下次就有快取了
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));   // 完全沒網路時，至少回首頁
    })
  );
});
