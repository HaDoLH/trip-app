/* ============================================================
   parser.js — 文字解析引擎

   任務：把「一段從 IG、部落格、Google Maps 複製來的文字」
        變成一筆一筆結構化的行程。

   做法像校稿時的「抽欄位」：先把最好認的東西挑走（地址、營業時間、
   電話、時間），剩下沒被挑走的那段，就是店名。
   剩下的字愈少，猜錯的機會愈小。

   ⚠ 這是規則式解析，不是 AI，遇到寫法很跳的文案一定會猜錯。
     所以 app.js 一定會先跳「確認卡」讓你檢查過才寫進去。
   ============================================================ */

/* ---------- 各種樣式的辨識規則 ---------- */

// 地址：抓「路/街/大道/巷/弄 + 數字 + 號」這個台灣門牌的骨架
// 例：台南市中西區永和街69號、永福路二段35巷6號、大學路西段53號、民權路二段64巷56號3樓
const RE_ADDRESS = /((?:[^\s，,。；;｜|、]{2,6}(?:市|縣))?(?:[^\s，,。；;｜|、]{1,5}(?:區|鄉|鎮|市))?[^\s，,。；;｜|、]{1,14}?(?:路|街|大道)(?:[一二三四五六七八九十東西南北]段)?(?:[^\s，,。；;｜|、]{0,10}?(?:巷|弄))?\s*\d+(?:\s*[-–之]\s*\d+)?\s*號(?:\s*之\s*\d+)?(?:\s*\d+\s*樓)?)/;

// 寬鬆地址：沒有門牌號，但有「縣市 + 區 + 路」，例如「台南市東區大學路西段」
// 一定要有縣市和區，才不會把一般句子裡的「XX路」誤認成地址
const RE_ADDRESS_LOOSE = /((?:[^\s，,。；;｜|、]{2,6}(?:市|縣))(?:[^\s，,。；;｜|、]{1,5}(?:區|鄉|鎮|市))[^\s，,。；;｜|、\d]{1,14}?(?:路|街|大道)(?:[一二三四五六七八九十東西南北]段)?)/;

// 地址前面常黏著的符號：IG 的 📍 被取字後常變成 *
const RE_LEAD_SYMBOL = /^(?:\s|\*|＊|📍|📌|•|・|※|>)+/;

// 營業時間：時段區間（12:00–21:00、12–21:00、11:00-14:30）
const RE_HOURS_RANGE = /(\d{1,2}(?::\d{2})?\s*[–\-~～至到]\s*\d{1,2}(?::\d{2})?)/g;
// 營業時間：星期（週四–日、週一公休、每週二三公休、週二定休）
const RE_WEEKDAYS = /((?:每)?(?:週|周|星期|禮拜)\s*[一二三四五六日天]+(?:\s*[–\-~～至到]\s*(?:週|周|星期|禮拜)?\s*[一二三四五六日天]+)?(?:\s*(?:公休|店休|定休|休))?)/g;
const RE_CLOSED = /((?:公休|店休|定休|不定期休|無公休)日?)/g;

// 電話
const RE_PHONE = /(0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{3,4}|09\d{2}[-\s]?\d{3}[-\s]?\d{3})/g;

// 單一時間點：19:30、下午3點、晚上7點半、11點
const RE_CLOCK = /((?:凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|深夜)?\s*\d{1,2}\s*[:：點時]\s*(?:半|\d{1,2})?\s*分?)/;
// 只有時段沒有數字：下午、傍晚、晚餐時間…
const RE_PERIOD = /(凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|深夜|飯前|飯後|抵達後|出發前|早餐|午餐|晚餐|宵夜)/;

// 常見的欄位標籤，解析前先拆掉
const RE_LABELS = /(?:店名|名稱|地址|位置|地點|營業時間|時間|電話|聯絡|備註|價位|公休)\s*[:：]\s*/g;

// 「已訂位」「備案」這類狀態標記
const RE_BOOKED = /(已訂位|已預約|已預訂|已訂|訂位完成)/;
const RE_ALT = /(備案|替代方案|候補|plan\s*b|第二選擇)/i;

/* ---------- 截圖取字常混進來的雜訊 ----------
   IG、Google Maps 截圖用實況文字取字時，畫面上的按鈕和數字也會一起被抓下來。 */

// IG 帳號（@ 前面要是行首或空白，才不會把 email 誤認成帳號）
const RE_HANDLE = /(^|[\s(（])@([A-Za-z0-9._]{2,30})/g;
// 追蹤數、貼文數：「10 則貼文」「1,667 位追蹤者」「2.3萬 粉絲」
const RE_STATS = /[\d,.]+\s*(?:萬|千|[kKM])?\s*(?:則貼文|篇貼文|貼文|位追蹤者|追蹤者|人追蹤|追蹤中|位粉絲|粉絲|個讚|則評論|則評價|followers|following|posts)/gi;
// 整行都是按鈕文字
const RE_UI_LINE = /^(?:追蹤|追蹤中|已追蹤|發送訊息|訊息|聯絡|分享個人檔案|編輯個人檔案|查看翻譯|顯示更多|更多|路線|撥打電話|網站|儲存|分享|個人檔案|follow|following|message|contact)$/i;

/* ---------- 類型判斷 ----------
   從店名和內文猜這是哪一種地點。愈前面的規則優先。 */
const TYPE_RULES = [
  { type: 'hotel',   words: ['旅館', '飯店', '民宿', '旅店', 'hotel', 'hostel', 'inn', '住宿', 'check-in', 'check in', '青旅'] },
  { type: 'transit', words: ['高鐵', '台鐵', '火車站', '車站', '機場', '客運', '轉運', '碼頭', '租車', '搭車', 'uber', '捷運', '巴士'] },
  { type: 'cafe',    words: ['咖啡', '珈琲', 'cafe', 'café', 'coffee', '茶', '飲', '甜點', '烘焙', 'bakery', '麵包', '可可', '巧克力', '冰', '果汁', 'bar', '酒'] },
  { type: 'food',    words: ['食堂', '壽司', '串燒', '燒肉', '拉麵', '麵', '飯', '餐廳', '料理', '小吃', '早午餐', 'brunch', '鍋', '定食', '牛排', '火鍋', '餃', '粥', '湯', '便當', '滷', '炸', '烤', '海產', '快炒', '居酒屋'] },
  { type: 'shop',    words: ['選物', '雜貨', '書店', '扭蛋', '盲盒', '一番賞', '商店', 'shop', 'store', '市集', '藥妝', '百貨', '文具', '古著', '二手', '唱片', '香水', '紀念品', '伴手禮'] },
  { type: 'sight',   words: ['美術館', '博物館', '展', '公園', '古蹟', '寺', '宮', '廟', '教堂', '老街', '夜市', '市場', '步道', '山', '海', '燈塔', '園區', '巷', '街', '景點', '神社', '城'] }
];

function guessType(name, fullText) {
  const target = (name + ' ' + fullText).toLowerCase();
  for (const rule of TYPE_RULES) {
    if (rule.words.some(w => target.includes(w.toLowerCase()))) return rule.type;
  }
  return 'sight';   // 猜不出來就當景點，最不容易誤導
}

/* ---------- 時間正規化 ----------
   把「下午3點半」變成「15:30」，方便排序也比較好讀。 */
function normalizeTime(raw) {
  if (!raw) return '';
  const text = raw.trim();
  const m = text.match(/(凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|深夜)?\s*(\d{1,2})\s*[:：點時]\s*(半|\d{1,2})?/);
  if (!m) return text;
  let hour = parseInt(m[2], 10);
  const period = m[1];
  const minute = m[3] === '半' ? 30 : (m[3] ? parseInt(m[3], 10) : 0);
  if (/下午|傍晚|晚上|深夜/.test(period) && hour < 12) hour += 12;
  if (period === '中午' && hour < 12) hour = 12;
  if (/凌晨|清晨/.test(period) && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return text;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/* ============================================================
   〇、先認出「每一行是什麼」

   像排版前先幫每一段文字標上樣式：這行是標題、這行是地址、這行是內文。
   標好之後，要判斷哪裡是「下一家」就容易多了。
   ============================================================ */

/** 找地址：先用嚴格版（要有門牌號），找不到再用寬鬆版 */
function findAddress(text) {
  return text.match(RE_ADDRESS) || text.match(RE_ADDRESS_LOOSE);
}

/** 拿掉追蹤數、按鈕文字；整行都是雜訊就回傳空字串 */
function cleanNoise(line) {
  const t = String(line).replace(RE_STATS, ' ').replace(/\s{2,}/g, ' ').trim();
  return RE_UI_LINE.test(t) ? '' : t;
}

/**
 * 這一行是什麼？
 *   noise         雜訊（追蹤數、按鈕）
 *   handle        只有一個 IG 帳號
 *   address       只有地址
 *   named-address 同一行裡「店名 + 地址」
 *   detail        營業時間、電話這類細節
 *   text          其他文字（店名或描述）
 */
function lineKind(line) {
  const t = cleanNoise(line);
  if (!t) return 'noise';
  if (/^@[A-Za-z0-9._]{2,30}$/.test(t)) return 'handle';

  const am = findAddress(t);
  if (am) {
    const before = t.slice(0, am.index).replace(RE_LEAD_SYMBOL, '').trim();
    return before ? 'named-address' : 'address';
  }

  // 把營業時間、電話都拿掉之後，幾乎不剩字的，就是細節行
  const rest = t
    .replace(RE_PHONE, '').replace(RE_WEEKDAYS, '').replace(RE_HOURS_RANGE, '').replace(RE_CLOSED, '')
    .replace(/營業時間|營業|休息|時間|電話/g, '')
    .replace(/[\s（）()｜|,，、:：~～\-–—]+/g, '');
  return rest.length <= 1 ? 'detail' : 'text';
}

const isAddrKind = k => k === 'address' || k === 'named-address';

/* ============================================================
   一、把一大段文字切成「一筆一筆」
   ============================================================ */

/** 這一行看起來像不像「新一筆的開頭」（行首是時間或條列符號） */
function looksLikeNewEntry(line) {
  const t = line.trim();
  if (!t) return false;
  if (/^\s*(?:\d{1,2}\s*[:：點時]|(?:凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|深夜)\s*\d)/.test(t)) return true;
  if (/^\s*(?:[-–—*+・‧•]|\d+[.)、])\s*\S/.test(t)) return true;
  return false;
}

/**
 * 切一個區塊（沒有空行的一整段）。
 *
 * 以「地址」當錨點：每一家店都有一個地址，
 * 地址往上數，最貼近它的那一行字就是這家的店名（中間夾的帳號、追蹤數一起帶走）。
 * 這樣不管是「店名 地址」寫在同一行，還是 IG 那種「店名一行、地址一行」，都切得對。
 */
function splitBlock(lines) {
  const kinds = lines.map(lineKind);
  const addrIdx = kinds.map((k, i) => (isAddrKind(k) ? i : -1)).filter(i => i >= 0);
  // 行首是時間或條列符號的也算新的一筆（但「* 地址」那種不算，那是 IG 的 📍）
  const hard = lines.map((l, i) => (kinds[i] !== 'address' && looksLikeNewEntry(l) ? i : -1)).filter(i => i >= 0);

  if (addrIdx.length <= 1 && hard.length <= 1) return [lines.join('\n')];

  const starts = new Set(hard);
  let prev = -1;                       // 上一個地址在第幾行，往回找不能越過它
  for (const k of addrIdx) {
    let s = k;
    if (kinds[k] === 'address') {      // 地址自己一行 → 店名在上面
      let j = k - 1;
      const skip = () => { while (j > prev && (kinds[j] === 'noise' || kinds[j] === 'handle')) j--; };
      skip();                          // 跳過夾在中間的追蹤數、帳號
      if (j > prev && kinds[j] === 'text') {
        s = j; j--;                    // 最貼近地址的一行字 = 店名（只拿一行，再上面的是上一家的描述）
        while (j > prev && (kinds[j] === 'noise' || kinds[j] === 'handle')) { s = j; j--; }
      } else {
        s = j + 1;                     // 找不到店名：從帳號那行開始（沒帳號就是地址本身）
      }
    }
    starts.add(s);
    prev = k;
  }

  const sorted = [...starts].filter(i => i > 0).sort((a, b) => a - b);
  const out = [];
  let from = 0;
  for (const s of sorted) {
    if (s > from) { out.push(lines.slice(from, s).join('\n')); from = s; }
  }
  out.push(lines.slice(from).join('\n'));
  return out;
}

/** 這一筆是不是「沒頭的」：一開頭就是地址或營業時間，缺店名 */
function isHeadless(entry) {
  for (const l of entry.split('\n')) {
    const k = lineKind(l);
    if (k === 'noise') continue;
    return k === 'address' || k === 'detail';
  }
  return true;                         // 整筆都是雜訊
}
const entryHasAddress = entry => entry.split('\n').some(l => isAddrKind(lineKind(l)));

/** 把使用者貼的一大段，切成一筆一筆的文字 */
function splitEntries(raw) {
  const text = String(raw).replace(/\r\n?/g, '\n').trim();
  if (!text) return [];

  // 第一刀：空行
  const blocks = text.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);

  // 第二刀：每個區塊裡再用地址當錨點切
  const pieces = [];
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    pieces.push(...splitBlock(lines));
  }

  // 第三步：縫回來。實況文字取字常在每一行之間都插空行，
  // 會把「店名 / 追蹤數 / 地址」拆成三塊。沒頭的那塊要接回上一家。
  const out = [];
  for (const p of pieces) {
    if (out.length && isHeadless(p)) {
      const last = out.length - 1;
      // 只有營業時間、雜訊 → 一定是上一家的；有地址 → 上一家還沒地址才接
      if (!entryHasAddress(p) || !entryHasAddress(out[last])) {
        out[last] = out[last] + '\n' + p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

/* ============================================================
   二、解析單一筆
   ============================================================ */

/** 把重複空白、殘留標點清一清 */
function tidy(str) {
  return String(str || '')
    .replace(/[｜|\n]/g, ' ')
    .replace(/^[\s，,。、；;：:／/\-–—·・~～]+/, '')
    .replace(/[\s，,。、；;：:／/\-–—·・~～]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * 解析一筆文字，回傳一個 stop 物件
 *   _raw：原文，確認卡上可以對照
 *   _nameUnsure：店名是猜的（例如只抓到 IG 帳號），確認卡上會提醒你補
 * cityHint：例如 '台南'，用來補全沒有寫縣市的地址，Google Maps 才找得準
 */
function parseEntry(raw, cityHint = '') {
  const original = String(raw).trim();

  // --- 0. 先清雜訊：追蹤數、按鈕文字 ---
  let work = original.split('\n').map(cleanNoise).filter(Boolean).join('\n');
  work = work.replace(RE_LABELS, ' ');   // 拆掉「店名：」「地址：」這類標籤

  // IG 帳號另外收起來：不當店名，放進備註
  const handles = [];
  work = work.replace(RE_HANDLE, (m, lead, h) => { handles.push(h); return lead; });

  // --- 1. 狀態標記 ---
  const booked = RE_BOOKED.test(work);
  const alt = RE_ALT.test(work);

  // --- 2. 電話 ---
  const phones = work.match(RE_PHONE) || [];
  phones.forEach(p => { work = work.replace(p, ' '); });

  // --- 3. 營業時間（要先抽走，否則 12:00–21:00 會被誤認成「到訪時間」）---
  const hoursParts = [];
  [RE_WEEKDAYS, RE_HOURS_RANGE, RE_CLOSED].forEach(re => {
    re.lastIndex = 0;
    const found = work.match(re) || [];
    found.forEach(h => {
      hoursParts.push(h.trim());
      work = work.replace(h, ' ');
    });
  });

  // 前面拿掉東西後，開頭可能剩空行，先修齊
  work = work.replace(/^[\s]+/, '');

  // --- 4. 到訪時間：只認「開頭」的那一個 ---
  //     寫在中間的數字多半是門牌或價格，不能當時間
  let time = '';
  const headClock = work.match(new RegExp('^\\s*' + RE_CLOCK.source));
  if (headClock) {
    time = normalizeTime(headClock[1]);
    work = work.replace(headClock[0], ' ').replace(/^\s+/, '');
  } else {
    const headPeriod = work.match(new RegExp('^\\s*' + RE_PERIOD.source));
    if (headPeriod) {
      time = headPeriod[1];
      work = work.replace(headPeriod[0], ' ').replace(/^\s+/, '');
    }
  }

  // --- 5. 地址（最重要的分界點：地址左邊是店名，右邊是備註）---
  let address = '';
  let namePart = '', tailPart = '';
  const addrMatch = findAddress(work);
  if (addrMatch) {
    address = addrMatch[1].replace(RE_LEAD_SYMBOL, '').replace(/\s+/g, '');
    namePart = work.slice(0, addrMatch.index);
    tailPart = work.slice(addrMatch.index + addrMatch[0].length);
  } else {
    // 沒有地址：第一段（第一個標點或換行之前）當店名
    const cut = work.search(/[，,。｜|、\n]/);
    if (cut > 0) { namePart = work.slice(0, cut); tailPart = work.slice(cut); }
    else { namePart = work; tailPart = ''; }
  }

  // --- 6. 整理店名 ---
  // 店名若橫跨好幾行（前面可能是「Day 2 推薦」之類的標題），只取最貼近地址的那一行
  const nameLines = namePart.split('\n').map(s => s.trim()).filter(Boolean);
  if (nameLines.length > 1) namePart = nameLines[nameLines.length - 1];

  let name = tidy(namePart)
    .replace(RE_BOOKED, '')
    .replace(RE_ALT, '')
    .replace(RE_LEAD_SYMBOL, '')
    .replace(/^\s*(?:[-–—*+・‧•]|\d+[.)、])\s*/, '')   // 條列符號
    .trim();
  if (name.length > 40) name = name.slice(0, 40);

  // 找不到店名：有 IG 帳號就先拿帳號頂著，否則用原文開頭；兩種都標「待確認」
  let nameUnsure = false;
  if (!name) {
    nameUnsure = true;
    name = handles[0] || tidy(tailPart).split(/\s+/)[0] || tidy(original).slice(0, 20);
    if (handles[0]) handles.shift();   // 已經拿去當店名了，備註就不再重複
  }

  // --- 7. 其餘備註 ---
  //     狀態字、標籤字抽掉之後，常會留下孤零零的標點，一起清乾淨
  const extra = tidy(
    tidy(tailPart)
      .replace(RE_BOOKED, '')
      .replace(RE_ALT, '')
      .replace(/(?:聯絡|訂位)?電話/g, ' ')
      .replace(/\s*([，,、])\s*/g, '$1')
      .replace(/[，,、]{2,}/g, '，')
  );

  // --- 8. 組 note：格式跟原本台南資料一致「地址｜營業時間｜備註」---
  const hours = hoursParts.join(' ').replace(/\s{2,}/g, ' ').trim();
  const handleNote = handles.map(h => '@' + h).join(' ');
  const noteParts = [address, hours, extra, phones.join(' '), handleNote].map(tidy).filter(Boolean);
  const note = noteParts.join('｜');

  // --- 9. Google Maps 搜尋詞：地址 + 店名，命中率最高 ---
  //     店名是猜的（例如帳號）就只用地址，帶著奇怪的字 Google 反而找不到
  let mapQuery = '';
  if (address) {
    const hasCity = /(市|縣)/.test(address.slice(0, 6));   // 沒寫縣市就補上，免得找到別縣市的同名路
    const base = (hasCity ? '' : cityHint) + address;
    mapQuery = (nameUnsure ? base : base + ' ' + name).trim();
  } else {
    mapQuery = ((cityHint ? cityHint + ' ' : '') + name).trim();
  }

  return {
    time: time || '待定',
    name,
    note,
    type: guessType(name, original),
    mapQuery,
    booked,
    alt,
    _raw: original,
    _address: address,
    _nameUnsure: nameUnsure
  };
}

/** 主要入口：一段文字 → 一批 stop */
function parseText(raw, cityHint = '') {
  return splitEntries(raw)
    .map(entry => parseEntry(entry, cityHint))
    .filter(s => s.name && s.name.length >= 1);
}

/**
 * 從旅程名稱猜城市，用來補全地址。
 * 例：「台南四日遊」→「台南」、「京都五日」→「京都」
 */
function guessCity(tripName) {
  if (!tripName) return '';
  const known = ['台北', '臺北', '新北', '桃園', '台中', '臺中', '台南', '臺南', '高雄', '基隆', '新竹', '苗栗', '彰化', '南投', '雲林', '嘉義', '屏東', '宜蘭', '花蓮', '台東', '臺東', '澎湖', '金門', '馬祖',
    '東京', '大阪', '京都', '奈良', '神戶', '名古屋', '福岡', '北海道', '札幌', '沖繩', '首爾', '釜山', '曼谷', '新加坡', '香港', '澳門'];
  const hit = known.find(c => tripName.includes(c));
  return hit || '';
}
