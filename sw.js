/* ============================================================
   sw.js — Service Worker
   作用：把 App 的骨架（HTML/CSS/JS）存在手機裡，出門沒網路也打得開。

   ⚠ 改版之後記得把下面的 CACHE_NAME 版本號 +1。

   v4 修正「一直看到舊版」的問題，原因有兩個：
   1. 以前是「先看快取」：只要手機裡有舊檔，就永遠先拿舊的出來，
      新版要開兩次以上才輪得到。
   2. 更新時抓檔案會經過瀏覽器自己的暫存（GitHub Pages 會叫瀏覽器暫存 10 分鐘），
      所以「新的快取」裡裝的可能還是舊檔。
   現在改成「先連網拿最新的，沒網路才用快取」，而且抓檔時明講不要用暫存。
   ============================================================ */

const CACHE_NAME = 'trip-app-v4';

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

// 安裝：把檔案抓下來存好。cache:'reload' = 直接問伺服器，不要拿瀏覽器暫存的舊檔
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))
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

/* 抓取策略：network-first（先連網，沒網路才用快取）
   有網路時永遠拿到最新版；在山上、地下室沒訊號時，照樣打得開。 */
self.addEventListener('fetch', event => {
  const req = event.request;
  // 只處理自己網站的 GET；Google Maps 之類的外部連結不要攔
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  event.respondWith(
    fetch(req, { cache: 'no-cache' })       // no-cache = 每次都跟伺服器確認有沒有新版
      .then(res => {
        // 拿到新的就順手更新快取，下次沒網路時用得到
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        // 沒網路：拿快取；連快取都沒有的頁面，至少回首頁
        caches.match(req).then(hit => hit || caches.match('./index.html'))
      )
  );
});
