/* ============================================================
   zine.js — 匯出成「行程手冊」

   備份檔（JSON）是給機器讀的；這一支產出的是給人看的：
   一個獨立的 .html 檔，雙擊就能開，Ctrl+P 可以存成 PDF，
   整個檔案傳給別人也打得開（不需要這個 App、不需要網路）。

   風格沿用她自己做的 travel zine：米紙底、襯線標題、等寬時間、
   每天一個主色。所有樣式都內嵌在檔案裡，不依賴外部檔案。
   ============================================================ */

const ZINE_FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@400;600;700&display=swap';

// 每天換一個主色，翻頁時一眼知道換天了
const ZINE_ACCENTS = ['#7a2818', '#4a3258', '#1f5a4d', '#c8651e', '#9a7320', '#2f4858'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** 這一支會被寫進獨立檔案，不能依賴 app.js，所以自己帶一個跳脫函式 */
function zEsc(s) {
  return String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function zSafeUrl(u) {
  const s = String(u || '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

/** 2026-10-17 → { md:'10.17', week:'週六', en:'SAT' } */
function zDate(ymd) {
  const EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const d = fromYmd(ymd);
  if (isNaN(d)) return { md: ymd || '', week: '', en: '' };
  return {
    md: `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`,
    week: '週' + WEEK_TXT[d.getDay()],
    en: EN[d.getDay()]
  };
}

/** 地址（去掉縣市和郵遞區號，跟 App 裡看到的一致） */
function zAddr(stop, city) {
  return cleanAddress(`${stop.mapQuery || ''}
${stop.note || ''}`, city);
}

function zStatus(stop) {
  const tags = [];
  if (stop.booked) tags.push(['已訂位', 'ok']);
  if (stop.alt) tags.push(['備案', 'alt']);
  if (stop.done) tags.push(['已完成', 'done']);
  return tags.map(([t, k]) => `<span class="tag tag-${k}">${zEsc(t)}</span>`).join('');
}

function zEntry(stop, city) {
  const addr = zAddr(stop, city);
  const lines = String(stop.note || '').split('｜').map(t => t.trim()).filter(Boolean);
  const map = stop.mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.mapQuery)}` : '';
  const link = zSafeUrl(stop.link);
  const icon = { food: '🍽', cafe: '☕', snack: '🍰', sight: '📍', shop: '🛍', hotel: '🏠', transit: '🚉' }[stop.type] || '📍';
  return `
      <article class="entry">
        <div class="when">${zEsc(stop.time || '')}</div>
        <div class="what">
          <h3><span class="ico">${icon}</span>${zEsc(stop.name)}${zStatus(stop)}</h3>
          ${addr ? `<p class="addr">${zEsc(addr)}</p>` : ''}
          ${lines.length ? `<ul class="meta">${lines.map(t => `<li>${zEsc(t)}</li>`).join('')}</ul>` : ''}
          ${(map || link) ? `<p class="links">
            ${map ? `<a href="${map}">地圖</a>` : ''}
            ${link ? `<a href="${zEsc(link)}">原始貼文</a>` : ''}
          </p>` : ''}
        </div>
      </article>`;
}

function zDay(day, i, city) {
  const d = zDate(day.date);
  const accent = ZINE_ACCENTS[i % ZINE_ACCENTS.length];
  // 排好時間的在上面，待定的收到最後當「候補」
  const timed = day.stops.filter(s => timeMinutes(s.time) !== null);
  const loose = day.stops.filter(s => timeMinutes(s.time) === null);
  return `
    <section class="day" style="--accent:${accent}">
      <header class="day-head">
        <span class="numeral">${ROMAN[i] || i + 1}</span>
        <div class="day-title">
          <div class="day-no">${String(i + 1).padStart(2, '0')}<em>Day ${i + 1}</em></div>
          <div class="day-when">${d.md}　${d.week}　<span class="en">${d.en}</span></div>
          ${day.title ? `<div class="day-theme">${zEsc(day.title)}</div>` : ''}
        </div>
      </header>
      ${timed.map(s => zEntry(s, city)).join('')}
      ${loose.length ? `<div class="loose">
        <h4>候補 ／ 還沒排時間</h4>
        ${loose.map(s => zEntry(s, city)).join('')}
      </div>` : ''}
    </section>`;
}

/** 整本手冊的 HTML（可以單獨存成檔案） */
function zineHtml(trip) {
  const city = typeof guessCity === 'function' ? guessCity(trip.name) : '';
  const a = zDate(trip.dateStart), b = zDate(trip.dateEnd);
  const total = trip.days.reduce((n, d) => n + d.stops.length, 0);
  const booked = trip.days.reduce((n, d) => n + d.stops.filter(s => s.booked).length, 0);
  const made = toYmd(new Date());

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${zEsc(trip.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${ZINE_FONTS}" rel="stylesheet">
<style>
:root{
  --paper:#f4ede1; --paper-warm:#ebe2d1; --paper-deep:#ddd1ba;
  --ink:#1a1410; --ink-soft:#3a2f24; --muted:#8a7d6a;
  --hair:rgba(26,20,16,.14); --hair-soft:rgba(26,20,16,.07);
  --serif:'Fraunces','Noto Serif TC',serif;
  --sans:'Instrument Sans','Noto Sans TC',sans-serif;
  --mono:'JetBrains Mono',monospace;
  --accent:#7a2818;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--paper-deep); color:var(--ink);
  font-family:var(--sans); font-size:15px; line-height:1.75;
  -webkit-font-smoothing:antialiased;
}
.sheet{
  max-width:780px; margin:0 auto; background:var(--paper);
  padding:56px 54px 72px; box-shadow:0 2px 40px rgba(26,20,16,.16);
}

/* ---- 封面 ---- */
.cover{border-bottom:2px solid var(--ink); padding-bottom:30px; margin-bottom:10px}
.kicker{
  font-family:var(--mono); font-size:11px; letter-spacing:.18em;
  text-transform:uppercase; color:var(--muted);
  display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;
}
.cover h1{
  font-family:var(--serif); font-weight:700; font-size:clamp(44px,9vw,76px);
  line-height:1.04; margin:18px 0 6px; letter-spacing:-.02em;
}
/* 旅程名稱很長時字級降一階，不然封面會被標題佔滿 */
.cover h1.long{font-size:clamp(28px,5.6vw,46px); line-height:1.25}
.range{
  font-family:var(--mono); font-size:13px; color:var(--ink-soft);
  display:flex; gap:26px; flex-wrap:wrap; margin-top:14px;
}
.range b{font-weight:500; display:block; font-size:22px; color:var(--ink)}
.range span{font-size:10px; letter-spacing:.16em; color:var(--muted); text-transform:uppercase}
.cover-note{margin-top:18px; color:var(--ink-soft); font-size:13.5px}

/* ---- 每一天 ---- */
.day{margin-top:52px}
.day-head{
  display:flex; align-items:flex-start; gap:18px;
  border-top:1px solid var(--hair); padding-top:18px;
}
.numeral{
  font-family:var(--serif); font-size:13px; letter-spacing:.14em; color:var(--accent);
  border:1px solid var(--accent); border-radius:2px; padding:2px 8px; flex:0 0 auto; margin-top:7px;
}
.day-no{font-family:var(--serif); font-size:40px; font-weight:700; line-height:1; color:var(--accent)}
.day-no em{
  font-style:normal; font-family:var(--sans); font-size:12px; letter-spacing:.14em;
  text-transform:uppercase; color:var(--muted); margin-left:10px; vertical-align:6px;
}
.day-when{font-family:var(--mono); font-size:12.5px; color:var(--ink-soft); margin-top:6px}
.day-when .en{color:var(--muted); letter-spacing:.12em}
.day-theme{font-family:var(--serif); font-size:16px; margin-top:4px; color:var(--ink-soft)}

/* ---- 單筆行程 ---- */
.entry{display:flex; gap:20px; padding:16px 0; border-bottom:1px solid var(--hair-soft)}
.when{
  font-family:var(--mono); font-size:13px; color:var(--accent);
  flex:0 0 62px; padding-top:3px; font-variant-numeric:tabular-nums;
}
.what{flex:1; min-width:0}
.what h3{
  font-family:var(--serif); font-size:17.5px; font-weight:600; margin:0;
  line-height:1.45; word-break:break-word;
}
.what h3 .ico{margin-right:7px}
.tag{
  font-family:var(--sans); font-size:10px; letter-spacing:.06em; font-weight:500;
  padding:2px 8px; border-radius:999px; margin-left:8px; vertical-align:3px; white-space:nowrap;
}
.tag-ok{background:#1f5a4d; color:#f4ede1}
.tag-alt{background:var(--paper-warm); color:var(--muted); border:1px solid var(--hair)}
.tag-done{background:var(--paper-deep); color:var(--ink-soft)}
.addr{margin:5px 0 0; font-size:12.5px; color:var(--muted); letter-spacing:.01em}
.meta{margin:7px 0 0; padding-left:16px; font-size:13px; color:var(--ink-soft)}
.meta li{margin:1px 0}
.links{margin:8px 0 0; display:flex; gap:16px; font-family:var(--mono); font-size:11.5px}
.links a{color:var(--accent); text-decoration:none; border-bottom:1px solid currentColor; padding-bottom:1px}

.loose{margin-top:10px; padding:14px 18px; background:var(--paper-warm); border-radius:3px}
.loose h4{
  margin:0 0 4px; font-family:var(--sans); font-size:11px; letter-spacing:.14em;
  text-transform:uppercase; color:var(--muted); font-weight:600;
}
.loose .entry:last-child{border-bottom:none}

.fin{
  margin-top:60px; padding-top:22px; border-top:2px solid var(--ink);
  font-family:var(--serif); font-style:italic; color:var(--muted);
  display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:10px;
}
.fin small{font-family:var(--mono); font-style:normal; font-size:10.5px; letter-spacing:.1em}

/* ---- 列印按鈕（印出來時會自己消失） ---- */
.print-btn{
  position:fixed; right:20px; bottom:20px; z-index:9;
  font-family:var(--sans); font-size:13px; padding:11px 20px; border-radius:999px;
  background:var(--ink); color:var(--paper); border:none; cursor:pointer;
  box-shadow:0 6px 20px rgba(26,20,16,.3);
}

@media (max-width:640px){
  .sheet{padding:34px 20px 50px}
  .entry{gap:12px}
  .when{flex:0 0 52px; font-size:12px}
}

/* ---- 列印 / 存成 PDF ---- */
@media print{
  @page{size:A4; margin:14mm}
  body{background:#fff}
  .sheet{box-shadow:none; max-width:none; padding:0; background:#fff}
  .print-btn{display:none}
  .entry{break-inside:avoid; page-break-inside:avoid}
  .day-head{break-after:avoid; page-break-after:avoid}
  .day{break-before:auto}
  .links a{border:none}
  a{color:inherit}
}
</style>
</head>
<body>
<div class="sheet">

  <header class="cover">
    <div class="kicker">
      <span>${zEsc(trip.emoji || '')} ${zEsc(trip.name)}</span>
      <span>${trip.days.length} DAYS · ${total} STOPS${booked ? ' · ' + booked + ' BOOKED' : ''}</span>
    </div>
    <h1 class="${trip.name.length > 12 ? 'long' : ''}">${zEsc(trip.name)}</h1>
    <div class="range">
      <div><span>From</span><b>${a.md}</b>${a.week}</div>
      <div><span>To</span><b>${b.md}</b>${b.week}</div>
    </div>
    ${trip.note ? `<p class="cover-note">${zEsc(trip.note)}</p>` : ''}
  </header>

  ${trip.days.map((d, i) => zDay(d, i, city)).join('')}

  <div class="fin">
    <span>fin.</span>
    <small>${zEsc(made)} · 旅程 Trip</small>
  </div>
</div>

<button class="print-btn" onclick="window.print()">列印 ／ 存成 PDF</button>
</body>
</html>`;
}

/** 下載成 .html 檔 */
function zineDownload(trip) {
  const blob = new Blob([zineHtml(trip)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${trip.name}_行程手冊.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 直接開一個分頁預覽 */
function zinePreview(trip) {
  const w = window.open('', '_blank');
  if (!w) return false;           // 被擋彈出視窗
  w.document.write(zineHtml(trip));
  w.document.close();
  return true;
}
