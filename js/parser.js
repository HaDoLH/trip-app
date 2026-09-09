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
// 例：台南市中西區永和街69號、永福路二段35巷6號、忠義路二段158巷23號之1、民權路二段64巷56號3樓
const RE_ADDRESS = /((?:[^\s，,。；;｜|、]{2,6}(?:市|縣))?(?:[^\s，,。；;｜|、]{1,5}(?:區|鄉|鎮|市))?[^\s，,。；;｜|、]{1,14}?(?:路|街|大道)(?:[一二三四五六七八九十]段)?(?:[^\s，,。；;｜|、]{0,10}?(?:巷|弄))?\s*\d+(?:\s*[-–之]\s*\d+)?\s*號(?:\s*之\s*\d+)?(?:\s*\d+\s*樓)?)/;

// 營業時間：時段區間（12:00–21:00、12–21:00、11:00-14:30）
const RE_HOURS_RANGE = /(\d{1,2}(?::\d{2})?\s*[–\-~～至到]\s*\d{1,2}(?::\d{2})?)/g;
// 營業時間：星期（週四–日、週一公休、每週二三公休）
const RE_WEEKDAYS = /((?:每)?(?:週|周|星期|禮拜)\s*[一二三四五六日天]+(?:\s*[–\-~～至到]\s*(?:週|周|星期|禮拜)?\s*[一二三四五六日天]+)?(?:\s*(?:公休|店休|休))?)/g;
const RE_CLOSED = /((?:公休|店休|不定期休|無公休)日?)/g;

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
   一、把一大段文字切成「一筆一筆」

   原理跟排版時看段落標記一樣：先找出哪裡是「新的一筆開始了」。
   旅遊資料的分段訊號有三種：空行、行首時間、新的地址。
   ============================================================ */

/** 這一行看起來像不像「新一筆的開頭」 */
function looksLikeNewEntry(line) {
  const t = line.trim();
  if (!t) return false;
  // 行首就是時間（19:30 xxx、下午3點 xxx）
  if (/^\s*(?:\d{1,2}\s*[:：點時]|(?:凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|深夜)\s*\d)/.test(t)) return true;
  // 行首是條列符號
  if (/^\s*(?:[-–—*+・‧•]|\d+[.)、])\s*\S/.test(t)) return true;
  return false;
}

/** 把使用者貼的一大段，切成一筆一筆的文字 */
function splitEntries(raw) {
  const text = String(raw).replace(/\r\n?/g, '\n').trim();
  if (!text) return [];

  // 第一刀：空行是最明確的分隔（一個店家一個區塊）
  const blocks = text.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);

  const entries = [];
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) { entries.push(block); continue; }

    // 第二刀：這個區塊裡，如果好幾行各自都像「獨立的一筆」，就一行一筆
    const startCount = lines.filter(looksLikeNewEntry).length;
    const addrCount = lines.filter(l => RE_ADDRESS.test(l)).length;

    if (startCount >= 2 || addrCount >= 2) {
      // 一行一筆；但「不像開頭又沒地址」的行，視為上一筆的補充說明
      let current = '';
      for (const line of lines) {
        const isNew = looksLikeNewEntry(line) || RE_ADDRESS.test(line);
        if (isNew && current) { entries.push(current); current = line; }
        else if (isNew) { current = line; }
        // 續行用換行接起來，不要用空白 —— 換行是「這裡本來是另一行」的證據，
        // 等一下判斷店名到哪裡結束時要靠它
        else { current = current ? current + '\n' + line : line; }
      }
      if (current) entries.push(current);
    } else {
      // 整塊就是一筆（例如店名一行、地址一行、營業時間一行）
      entries.push(lines.join('\n'));
    }
  }
  return entries;
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
 * 解析一筆文字，回傳一個 stop 物件（外加 _raw 原文，方便你在確認卡上核對）
 * cityHint：例如 '台南'，用來補全沒有寫縣市的地址，Google Maps 才找得準
 */
function parseEntry(raw, cityHint = '') {
  const original = String(raw).trim();
  let work = original.replace(RE_LABELS, ' ');   // 先拆掉「店名：」「地址：」這類標籤

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

  // --- 4. 到訪時間：只認「開頭」的那一個 ---
  //     寫在中間的數字多半是門牌或價格，不能當時間
  let time = '';
  const headClock = work.match(new RegExp('^\\s*' + RE_CLOCK.source));
  if (headClock) {
    time = normalizeTime(headClock[1]);
    work = work.replace(headClock[0], ' ');
  } else {
    const headPeriod = work.match(new RegExp('^\\s*' + RE_PERIOD.source));
    if (headPeriod) {
      time = headPeriod[1];
      work = work.replace(headPeriod[0], ' ');
    }
  }

  // --- 5. 地址（最重要的分界點：地址左邊是店名，右邊是備註）---
  let address = '';
  let namePart = '', tailPart = '';
  const addrMatch = work.match(RE_ADDRESS);
  if (addrMatch) {
    address = addrMatch[1].trim().replace(/\s+/g, '');
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
    .replace(/^\s*(?:[-–—*+・‧•]|\d+[.)、])\s*/, '')   // 條列符號
    .trim();
  if (name.length > 40) name = name.slice(0, 40);

  // 店名被吃光時（例如整行只有地址），退而求其次用尾段或原文開頭
  if (!name) name = tidy(tailPart).split(/\s+/)[0] || tidy(original).slice(0, 20);

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
  const noteParts = [address, hours, extra, phones.join(' ')].map(tidy).filter(Boolean);
  const note = noteParts.join('｜');

  // --- 9. Google Maps 搜尋詞：地址 + 店名，命中率最高 ---
  let mapQuery = '';
  if (address) {
    // 地址沒寫縣市的話補上，不然 Google 會找到別的縣市的同名路
    const hasCity = /(市|縣)/.test(address.slice(0, 6));
    mapQuery = ((hasCity ? '' : cityHint) + address + ' ' + name).trim();
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
    _address: address
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
