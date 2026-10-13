/* ============================================================
   photos.js — 行程照片

   為什麼要另外寫一支：
   照片很大，不能跟行程資料放在一起。
   · localStorage 只有 5MB 左右，塞一兩張就滿了 → 改用 IndexedDB（容量以 GB 計）
   · 雲端同步是「一趟旅程存成一份文件」，而 Firestore 一份文件上限 1MB
     → 照片各自存成一份獨立文件，行程裡只記住它的編號

   所以一張照片會在兩個地方：
     本機 IndexedDB  → 開啟快、沒網路也看得到
     雲端 photos/    → 換裝置時才去抓，抓完存進本機，下次就不用再抓
   ============================================================ */

const PHOTO_DB = 'trip_photos';
const PHOTO_STORE = 'imgs';
const PHOTO_MAX_SIDE = 1280;     // 長邊縮到這個大小，手機看綽綽有餘
const PHOTO_QUALITY = 0.72;      // 再小畫質就看得出來了

/* ---------- IndexedDB：本機的照片櫃 ---------- */

let _idb = null;
function idbOpen() {
  if (_idb) return _idb;
  _idb = new Promise(resolve => {
    let req;
    try { req = indexedDB.open(PHOTO_DB, 1); } catch (e) { return resolve(null); }
    req.onupgradeneeded = () => { try { req.result.createObjectStore(PHOTO_STORE); } catch (e) {} };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);        // 無痕視窗會失敗，當作沒有，不要讓程式當掉
  });
  return _idb;
}

function idbRun(mode, fn) {
  return idbOpen().then(db => {
    if (!db) return null;
    return new Promise(resolve => {
      let tx;
      try { tx = db.transaction(PHOTO_STORE, mode); } catch (e) { return resolve(null); }
      const req = fn(tx.objectStore(PHOTO_STORE));
      tx.oncomplete = () => resolve(req ? req.result : true);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
  });
}

const idbPut = (id, val) => idbRun('readwrite', st => st.put(val, id));
const idbGet = id => idbRun('readonly', st => st.get(id));
const idbDel = id => idbRun('readwrite', st => st.delete(id));

/* ---------- 壓縮 ----------
   手機拍一張動輒 3~5MB，原圖存上去又慢又佔空間。
   縮到長邊 1280、轉成 JPEG，通常會變成 200~400KB。 */

function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return reject(new Error('這不是圖片檔'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      try { resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY)); }
      catch (e) { reject(new Error('這張圖轉不過去')); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('讀不到這張圖')); };
    img.src = url;
  });
}

/* ---------- 雲端 ----------
   路徑 trips/<代碼>/photos/<照片編號>，跟行程資料同一把鎖，
   Firestore 規則不用再改。沒開同步的話這幾個函式什麼都不做。 */

function photoCloudRef(id) {
  if (!sync.api || !sync.api.db || !sync.code) return null;
  const { fs, db } = sync.api;
  return { fs, ref: fs.doc(fs.collection(db, 'trips', sync.code, 'photos'), id) };
}

async function photoUpload(id, dataUrl) {
  const c = photoCloudRef(id);
  if (!c) return false;
  try { await c.fs.setDoc(c.ref, { data: dataUrl, at: Date.now() }); return true; }
  catch (e) { return false; }
}

async function photoDownload(id) {
  const c = photoCloudRef(id);
  if (!c) return null;
  try {
    const snap = await c.fs.getDoc(c.ref);
    const d = snap && snap.exists && snap.exists() ? snap.data() : null;
    return d && d.data ? d.data : null;
  } catch (e) { return null; }
}

/* ---------- 給畫面用的三個動作 ---------- */

/** 存一張照片，回傳它的編號 */
async function photoSave(file) {
  const dataUrl = await compressImage(file);
  const id = uid('ph');
  await idbPut(id, dataUrl);
  photoUpload(id, dataUrl);          // 背景上傳，不擋畫面
  return { id, dataUrl };
}

/** 讀一張照片：先找本機，沒有才去雲端拿（拿到就存起來，下次不用再拿） */
async function photoLoad(id) {
  const local = await idbGet(id);
  if (local) return local;
  const remote = await photoDownload(id);
  if (remote) idbPut(id, remote);
  return remote;
}

/** 刪一張照片：本機和雲端都刪 */
async function photoDelete(id) {
  idbDel(id);
  const c = photoCloudRef(id);
  if (c) { try { await c.fs.deleteDoc(c.ref); } catch (e) {} }
}
