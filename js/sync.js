/* ============================================================
   sync.js — 跨裝置同步

   原本資料只存在「這一台瀏覽器」裡，手機改的電腦看不到。
   這一層把每一趟旅程同時存一份到雲端（Firebase Firestore），
   另一台裝置打同一組「同步代碼」，就會即時看到同一份資料。

   幾個刻意的設計：

   1. **localStorage 還是主角**。雲端只是鏡子，沒網路、沒設代碼時，
      App 的行為跟以前一模一樣，不會因為連不上就打不開。

   2. **一趟旅程存成一份文件**（不是整包存成一份）。
      兩台裝置改不同旅程時才不會互相蓋掉。
      同一趟同時改，則是「後存的贏」—— 一個人用兩台裝置，這樣就夠了。

   3. **代碼就是鑰匙**，放在網址的 ?c=　裡。
      不只存 localStorage 的原因：無痕視窗、清除資料都會讓它消失，
      放在網址裡，「加入主畫面」時會一起被記住。
   ============================================================ */

const SYNC_KEY = 'trip_app_sync_code';
const SYNC_MIN = 8;                    // 代碼至少 8 碼：短了會被亂猜到
const SDK = 'https://www.gstatic.com/firebasejs/11.0.2/';

const sync = {
  code: null,
  state: 'off',        // off｜connecting｜on｜error
  message: '',
  api: null,
  unsub: null,
  firstDone: false,    // 第一次收到雲端資料了嗎（之前不准刪遠端東西）
  lastSent: {},        // 每趟旅程「最後一次送出／收到」的內容，用來避免來回打轉
  applying: false,     // 正在把雲端資料套進來，這段期間不要往回送
  timer: null,
  onState: null,       // 狀態變了要通知畫面
  onRemote: null       // 雲端資料變了要重畫
};

/** 代碼一律轉小寫、只留英數和 - _ ：否則 Trip-A 和 trip-a 會變成兩份資料 */
function syncNormalize(c) {
  return String(c || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

/** 幫你產一組好打又猜不到的代碼 */
function syncMakeCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';   // 去掉看起來像的 i1lo0
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'trip-' + s;
}

function syncEmit() { if (sync.onState) sync.onState(sync); }

/** 網址或上次存的代碼 */
function syncSavedCode() {
  const m = location.search.match(/[?&]c=([^&]+)/);
  if (m) {
    const fromUrl = syncNormalize(decodeURIComponent(m[1]));
    if (fromUrl.length >= SYNC_MIN) return fromUrl;
  }
  return syncNormalize(safeStorage.get(SYNC_KEY) || '');
}

/** 可以傳給同行的人的連結：點開就加入同一份資料 */
function syncShareUrl() {
  if (!sync.code) return '';
  return location.origin + location.pathname + '?c=' + encodeURIComponent(sync.code);
}

/* ---------- 連線 ---------- */

async function syncConnect(rawCode) {
  const code = syncNormalize(rawCode);
  if (code.length < SYNC_MIN) {
    sync.state = 'error';
    sync.message = `代碼至少要 ${SYNC_MIN} 個字（英文、數字、- 、_）`;
    syncEmit();
    return false;
  }
  syncDisconnect(false);

  sync.code = code;
  sync.state = 'connecting';
  sync.message = '連線中…';
  syncEmit();
  safeStorage.set(SYNC_KEY, code);

  try {
    const { initializeApp } = await import(SDK + 'firebase-app.js');
    const fs = await import(SDK + 'firebase-firestore.js');
    const app = initializeApp(window.FIREBASE_CONFIG);
    const db = fs.getFirestore(app);
    // 路徑 trips/<代碼>/items/<旅程id>，跟行事曆的 families/ 完全分開
    sync.api = { fs, col: fs.collection(db, 'trips', code, 'items') };

    sync.unsub = fs.onSnapshot(
      sync.api.col,
      snap => syncApply(snap),
      err => {
        sync.state = 'error';
        const code = (err && err.code) || '';
        // 最常見的錯：Firestore 規則還沒開放 trips/ 這一段
        sync.message = /permission/i.test(code)
          ? '雲端拒絕存取 —— Firebase 的 Firestore 規則還沒加上 trips/ 那一段（見 README）'
          : ('連不上雲端：' + (code || '未知錯誤'));
        syncEmit();
      }
    );
    return true;
  } catch (e) {
    // 沒網路、或瀏覽器擋了外部程式庫 —— App 照常用，只是沒有同步
    sync.state = 'error';
    sync.message = '載入同步功能失敗（沒網路時會這樣，資料還是存在這台）';
    syncEmit();
    return false;
  }
}

function syncDisconnect(forget = true) {
  if (sync.unsub) { try { sync.unsub(); } catch (e) {} }
  clearTimeout(sync.timer);
  sync.unsub = null; sync.api = null; sync.firstDone = false;
  sync.lastSent = {}; sync.timer = null;
  if (forget) {
    sync.code = null; sync.state = 'off'; sync.message = '';
    safeStorage.remove(SYNC_KEY);
    syncEmit();
  }
}

/* ---------- 雲端 → 本機 ---------- */

function syncApply(snap) {
  sync.applying = true;
  let changed = false;

  snap.docChanges().forEach(ch => {
    const id = ch.doc.id;

    if (ch.type === 'removed') {
      if (DB.trips.some(t => t.id === id)) {
        DB.trips = DB.trips.filter(t => t.id !== id);
        changed = true;
      }
      delete sync.lastSent[id];
      return;
    }

    let trip = null;
    try { trip = JSON.parse(ch.doc.data().data); } catch (e) { return; }
    if (!trip || !Array.isArray(trip.days)) return;   // 壞資料不要套進來
    trip.id = id;

    const json = JSON.stringify(trip);
    if (sync.lastSent[id] === json) return;           // 這就是我們自己剛送出去的
    const i = DB.trips.findIndex(t => t.id === id);
    if (i < 0) DB.trips.push(trip); else DB.trips[i] = trip;
    sync.lastSent[id] = json;
    changed = true;
  });

  if (changed) saveDB();
  sync.applying = false;

  if (!sync.firstDone) {
    sync.firstDone = true;
    sync.state = 'on';
    sync.message = '';
    syncEmit();
    syncPush();            // 這台有、雲端還沒有的，補上去
  }
  if (changed && sync.onRemote) sync.onRemote();
}

/* ---------- 本機 → 雲端 ---------- */

/** 存檔後呼叫。短時間連續改好幾次只送一次，省流量也省額度 */
function syncQueuePush() {
  if (!sync.api || sync.applying) return;
  clearTimeout(sync.timer);
  sync.timer = setTimeout(syncPush, 500);
}

async function syncPush() {
  if (!sync.api) return;
  const { fs, col } = sync.api;
  const alive = new Set();

  for (const trip of DB.trips) {
    alive.add(trip.id);
    const json = JSON.stringify(trip);
    if (sync.lastSent[trip.id] === json) continue;    // 沒變就不送
    sync.lastSent[trip.id] = json;
    try {
      await fs.setDoc(fs.doc(col, trip.id), { data: json, updatedAt: Date.now() });
    } catch (e) {
      delete sync.lastSent[trip.id];                  // 送失敗，下次再試
      sync.state = 'error';
      sync.message = '存到雲端失敗，資料還在這台。檢查網路或 Firestore 規則。';
      syncEmit();
      return;
    }
  }

  // 本機刪掉的，雲端也要刪。但一定要等第一次收完雲端資料之後才敢做，
  // 否則剛加入時「本機還沒拿到的旅程」會被誤判成已刪除。
  if (!sync.firstDone) return;
  for (const id of Object.keys(sync.lastSent)) {
    if (alive.has(id)) continue;
    try { await fs.deleteDoc(fs.doc(col, id)); } catch (e) {}
    delete sync.lastSent[id];
  }
}

/** App 啟動時：之前設過代碼就自動接回去 */
function syncAutoStart() {
  const code = syncSavedCode();
  if (code) syncConnect(code);
}
