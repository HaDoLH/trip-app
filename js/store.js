/* ============================================================
   store.js — 資料層
   這一層只管「資料怎麼存、怎麼改」，完全不碰畫面。
   就像印刷廠的原稿庫：畫面（app.js）要什麼就來拿，改完再放回去。
   ============================================================ */

/* ---------- localStorage 安全存取 ----------
   瀏覽器的 localStorage 不保證存得住：無痕視窗、App 內嵌瀏覽器、
   使用者關閉網站資料，都會直接丟出錯誤。
   所以包一層 try/catch，讀不到就當作沒有，不讓整支程式當掉。      */
const safeStorage = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); return true; } catch (e) { return false; } },
  remove(key) { try { localStorage.removeItem(key); } catch (e) {} }
};

const STORE_KEY = 'trip_app_v2';      // 新版資料
const OLD_KEY = 'tainan_itinerary';   // 網頁版 Claude 舊版資料（只讀不刪）
const THEME_KEY = 'trip_app_theme';   // 深色 / 淺色偏好

/* ---------- 小工具 ---------- */

/** 產生一組不會重複的 id：時間戳 + 亂數 */
function uid(prefix = 's') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const pad2 = n => String(n).padStart(2, '0');

/** Date 物件 → '2026-04-24' 這種字串（存檔一律用這個格式，才排得了序） */
function toYmd(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** '2026-04-24' → Date 物件。
    注意：不能直接 new Date('2026-04-24')，那會被當成「格林威治時間的午夜」，
    在台灣時區會變成前一天早上 8 點，日期就少一天。所以拆開來自己組。 */
function fromYmd(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, m - 1, d);
}

const WEEK_TXT = ['日', '一', '二', '三', '四', '五', '六'];

/** '2026-04-24' → '4/24 週五'（畫面上顯示用） */
function formatDateLabel(ymdStr) {
  if (!ymdStr) return '';
  const d = fromYmd(ymdStr);
  if (isNaN(d)) return ymdStr;
  return `${d.getMonth() + 1}/${d.getDate()} 週${WEEK_TXT[d.getDay()]}`;
}

/** 算兩個日期之間共有幾天（含頭含尾） */
function daysBetween(startYmd, endYmd) {
  const a = fromYmd(startYmd), b = fromYmd(endYmd);
  if (isNaN(a) || isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

/* ---------- 顏色：由旅程主題色推算每一天的顏色 ----------
   同一趟旅程的各天，用「同色系但色相稍微轉一點」的做法，
   看起來會是一整套，而不是各自為政的雜色。
   （就像同一個品牌的延伸色，不是隨便挑四個顏色）           */

/** #C05020 → {h, s, l}。HSL 比 RGB 好操作：h 是色相角度、s 彩度、l 明度 */
function hexToHsl(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

/**
 * 第 index 天該用什麼顏色。
 * 每往後一天，色相轉 26 度、明度微調，四天下來是一組漸變的同家族色。
 */
function dayColor(tripColor, index) {
  const { h, s, l } = hexToHsl(tripColor || '#C05020');
  const hue = (h + index * 26 + 360) % 360;
  const sat = Math.min(72, Math.max(38, s));
  const lig = Math.min(58, Math.max(38, l + (index % 2 === 0 ? 0 : 5)));
  return `hsl(${Math.round(hue)} ${Math.round(sat)}% ${Math.round(lig)}%)`;
}

/** 這個底色上該放黑字還是白字（用亮度判斷，跟印刷選反白同個道理） */
function inkOn(color) {
  let r, g, b;
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  } else {
    // hsl(...) 的情況，交給瀏覽器算：畫一個 1px 的點再讀回顏色
    const probe = document.createElement('canvas').getContext('2d');
    probe.fillStyle = color;
    probe.fillRect(0, 0, 1, 1);
    [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  }
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#1A1916' : '#FFFFFF';
}

/* ============================================================
   資料存取
   ============================================================ */

/** 全部資料。畫面層直接讀這個物件 */
let DB = { version: 2, activeTripId: null, trips: [] };

function saveDB() {
  const ok = safeStorage.set(STORE_KEY, JSON.stringify(DB));
  if (!ok) console.warn('存檔失敗：瀏覽器不允許寫入 localStorage');
  return ok;
}

/**
 * 把網頁版 Claude 的舊資料（只有天、沒有旅程）包成一趟旅程。
 * 舊 key 不刪，萬一新版出問題還救得回來。
 */
function migrateOldData(oldDays) {
  const dateMap = ['2026-04-24', '2026-04-25', '2026-04-26', '2026-04-27'];
  return {
    id: 'trip-tainan',
    name: '台南四日遊',
    emoji: '🏮',
    color: '#C05020',
    dateStart: dateMap[0],
    dateEnd: dateMap[3],
    note: '兩人同行．騎車 ＋ 坐車',
    stay: { name: '友愛街旅館', mapQuery: '台南市中西區友愛街115巷5號 友愛街旅館' },
    days: oldDays.map((d, i) => ({
      id: d.id || uid('day'),
      date: dateMap[i] || '',
      title: d.title || '',
      stops: d.stops || []
    }))
  };
}

/** App 啟動時呼叫一次 */
function loadDB() {
  // 1. 先找新版資料
  const raw = safeStorage.get(STORE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.trips)) {
        DB = parsed;
        if (!DB.trips.some(t => t.id === DB.activeTripId)) DB.activeTripId = null;
        return DB;
      }
    } catch (e) { console.warn('新版資料讀取失敗，改用預設資料', e); }
  }

  // 2. 沒有新版 → 找舊版來搬家
  const old = safeStorage.get(OLD_KEY);
  if (old) {
    try {
      const oldDays = JSON.parse(old);
      if (Array.isArray(oldDays) && oldDays.length) {
        DB = { version: 2, activeTripId: null, trips: [migrateOldData(oldDays)] };
        saveDB();
        return DB;
      }
    } catch (e) { console.warn('舊版資料搬移失敗', e); }
  }

  // 3. 都沒有 → 用範例資料
  DB = {
    version: 2,
    activeTripId: null,
    trips: JSON.parse(JSON.stringify(typeof SAMPLE_TRIPS !== 'undefined' ? SAMPLE_TRIPS : []))
  };
  saveDB();
  return DB;
}

/* ---------- 旅程 CRUD ---------- */

const getTrip = id => DB.trips.find(t => t.id === id) || null;
const getDay = (trip, dayId) => (trip ? trip.days.find(d => d.id === dayId) : null) || null;

/**
 * 新增一趟旅程。依起訖日自動生成 Day 1～N，日期自動帶入。
 */
function createTrip({ name, emoji, color, dateStart, dateEnd, note }) {
  const total = daysBetween(dateStart, dateEnd);
  const days = [];
  for (let i = 0; i < total; i++) {
    const d = fromYmd(dateStart);
    d.setDate(d.getDate() + i);
    days.push({ id: uid('day'), date: toYmd(d), title: '', stops: [] });
  }
  const trip = {
    id: uid('trip'),
    name: name || '未命名旅程',
    emoji: emoji || '✈️',
    color: color || '#C05020',
    dateStart, dateEnd,
    note: note || '',
    stay: null,
    days
  };
  DB.trips.push(trip);
  saveDB();
  return trip;
}

/**
 * 更新旅程基本資料。若日期區間有變，天數跟著增減：
 * 變多 → 後面補空白天；變少 → 砍掉的那幾天，行程併到最後一天，不會憑空消失。
 */
function updateTrip(tripId, patch) {
  const trip = getTrip(tripId);
  if (!trip) return null;
  const dateChanged =
    (patch.dateStart && patch.dateStart !== trip.dateStart) ||
    (patch.dateEnd && patch.dateEnd !== trip.dateEnd);

  Object.assign(trip, patch);

  if (dateChanged) {
    const total = daysBetween(trip.dateStart, trip.dateEnd);
    // 天數變少：把要砍掉的那幾天的行程，全部搬到留下來的最後一天
    if (trip.days.length > total) {
      const removed = trip.days.slice(total);
      trip.days = trip.days.slice(0, total);
      const last = trip.days[trip.days.length - 1];
      removed.forEach(d => { last.stops = last.stops.concat(d.stops); });
    }
    // 天數變多：後面補空白天
    while (trip.days.length < total) {
      trip.days.push({ id: uid('day'), date: '', title: '', stops: [] });
    }
    // 重新依起始日排日期
    trip.days.forEach((d, i) => {
      const dt = fromYmd(trip.dateStart);
      dt.setDate(dt.getDate() + i);
      d.date = toYmd(dt);
    });
  }
  saveDB();
  return trip;
}

function deleteTrip(tripId) {
  DB.trips = DB.trips.filter(t => t.id !== tripId);
  if (DB.activeTripId === tripId) DB.activeTripId = null;
  saveDB();
}

/** 在最後面加一天（日期接續前一天） */
function addDay(tripId) {
  const trip = getTrip(tripId);
  if (!trip) return null;
  const last = trip.days[trip.days.length - 1];
  let date = trip.dateStart;
  if (last && last.date) {
    const d = fromYmd(last.date);
    d.setDate(d.getDate() + 1);
    date = toYmd(d);
  }
  const day = { id: uid('day'), date, title: '', stops: [] };
  trip.days.push(day);
  trip.dateEnd = date;
  saveDB();
  return day;
}

function deleteDay(tripId, dayId) {
  const trip = getTrip(tripId);
  if (!trip || trip.days.length <= 1) return false;   // 至少留一天
  trip.days = trip.days.filter(d => d.id !== dayId);
  const last = trip.days[trip.days.length - 1];
  if (last && last.date) trip.dateEnd = last.date;
  saveDB();
  return true;
}

/* ---------- 景點 CRUD ---------- */

function addStop(tripId, dayId, stopData) {
  const day = getDay(getTrip(tripId), dayId);
  if (!day) return null;
  const stop = Object.assign({ id: uid(), time: '待定', name: '', note: '', type: 'sight', mapQuery: '', booked: false, alt: false }, stopData);
  if (!stop.id) stop.id = uid();
  day.stops.push(stop);
  saveDB();
  return stop;
}

function updateStop(tripId, dayId, stopId, stopData, newDayId) {
  const trip = getTrip(tripId);
  const day = getDay(trip, dayId);
  if (!day) return null;
  const idx = day.stops.findIndex(s => s.id === stopId);
  if (idx < 0) return null;

  // 換天：從舊的那天抽出來，接到新的那天最後面
  if (newDayId && newDayId !== dayId) {
    const target = getDay(trip, newDayId);
    if (target) {
      day.stops.splice(idx, 1);
      target.stops.push(Object.assign({}, stopData, { id: stopId }));
      saveDB();
      return { moved: true, dayId: newDayId };
    }
  }
  day.stops[idx] = Object.assign({}, stopData, { id: stopId });
  saveDB();
  return { moved: false, dayId };
}

function deleteStop(tripId, dayId, stopId) {
  const day = getDay(getTrip(tripId), dayId);
  if (!day) return false;
  day.stops = day.stops.filter(s => s.id !== stopId);
  saveDB();
  return true;
}

/** 拖拉排序用：把第 from 個搬到第 to 個位置 */
function moveStop(tripId, dayId, from, to) {
  const day = getDay(getTrip(tripId), dayId);
  if (!day) return false;
  if (from === to || from < 0 || from >= day.stops.length) return false;
  const [item] = day.stops.splice(from, 1);
  day.stops.splice(Math.max(0, Math.min(to, day.stops.length)), 0, item);
  saveDB();
  return true;
}

/* ---------- 匯出 / 匯入 ----------
   資料只存在這一台裝置的瀏覽器裡，清除瀏覽資料或換手機就沒了。
   匯出是唯一的備份手段，也是「Claude 幫我辨識截圖」的資料入口。 */

/** 整包匯出，存成 .json 檔下載 */
function exportJSON() {
  const payload = { type: 'backup', version: 2, exportedAt: new Date().toISOString(), trips: DB.trips };
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `旅程備份_${toYmd(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return text;
}

/**
 * 解析貼進來的 JSON 文字，判斷是哪一種：
 *   backup → 整包旅程（還原備份）
 *   stops  → 一批景點（Claude 辨識截圖後給的）
 * 回傳 { kind, trips? , stops? , error? }
 */
function parseImportText(text) {
  let data;
  try {
    data = JSON.parse(String(text).trim());
  } catch (e) {
    return { kind: 'error', error: '這段不是有效的 JSON。請確認整段都有複製到，開頭是 { 結尾是 }。' };
  }
  if (Array.isArray(data)) {
    // 直接給一個陣列，當作一批景點
    return { kind: 'stops', stops: data.filter(s => s && s.name) };
  }
  if (data.type === 'backup' || Array.isArray(data.trips)) {
    const trips = (data.trips || []).filter(t => t && Array.isArray(t.days));
    if (!trips.length) return { kind: 'error', error: '這份備份裡沒有任何旅程。' };
    return { kind: 'backup', trips };
  }
  if (data.type === 'stops' || Array.isArray(data.stops)) {
    const stops = (data.stops || []).filter(s => s && s.name);
    if (!stops.length) return { kind: 'error', error: '這段資料裡沒有任何景點。' };
    return { kind: 'stops', stops };
  }
  if (data.name && data.days) return { kind: 'backup', trips: [data] };
  return { kind: 'error', error: '看不懂這段資料的格式。可以把它丟給 Claude Code，請它轉成正確格式。' };
}

/** 還原整包備份（會覆蓋現有資料，呼叫前務必先確認） */
function importBackup(trips) {
  DB.trips = trips.map(t => Object.assign({ id: uid('trip'), emoji: '✈️', color: '#C05020' }, t));
  DB.activeTripId = null;
  saveDB();
}

/* ---------- 深色 / 淺色 ---------- */
function getTheme() { return safeStorage.get(THEME_KEY) || 'auto'; }
function setTheme(mode) {
  safeStorage.set(THEME_KEY, mode);
  if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', mode);
}
