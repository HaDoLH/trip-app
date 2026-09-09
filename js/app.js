/* ============================================================
   app.js — 畫面與互動

   分工：store.js 管資料、parser.js 管解析，這一支只管「畫出來」和「按下去要做什麼」。
   ============================================================ */

const $ = sel => document.querySelector(sel);
const TYPE_ICONS = { food: '🍽', cafe: '☕', sight: '📍', shop: '🛍', hotel: '🏠', transit: '🚉' };
const TYPE_NAMES = { food: '餐廳', cafe: '咖啡 / 飲料', sight: '景點', shop: '購物', hotel: '住宿', transit: '交通' };
const TRIP_EMOJIS = ['✈️', '🏮', '🗼', '🏝', '⛰', '🍜', '🎡', '🚅', '🌸', '🏖', '🗿', '🏛', '🚗', '🎪', '🍁', '❄️'];
const TRIP_COLORS = ['#C05020', '#D48A17', '#1D9E75', '#2E7D82', '#3A5F8F', '#6B5490', '#B5647A', '#6E6A60'];

/** 把使用者輸入的字變成安全的 HTML（避免店名裡的 < > 把版面弄壞） */
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* 目前畫面的狀態（跟資料無關，重整就歸零） */
const view = {
  screen: 'trips',     // trips | plan | add
  tripId: null,
  dayId: null,
  chat: [],            // 新增分頁的對話訊息
  pending: null        // 等待確認的解析結果
};

/* ---------- 小提示 ---------- */
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ============================================================
   一、旅程列表
   ============================================================ */
function renderTrips() {
  const box = $('#tripList');
  const trips = DB.trips;

  const cards = trips.map(trip => {
    const stopCount = trip.days.reduce((sum, d) => sum + d.stops.length, 0);
    const bookedCount = trip.days.reduce((sum, d) => sum + d.stops.filter(s => s.booked).length, 0);
    const c = trip.color || '#C05020';
    return `
      <div class="trip-card" style="--c:${c}; --c-ink:${inkOn(c)}">
        <div class="trip-cover" data-open="${trip.id}" role="button" tabindex="0"
             style="--c:${c}; --c-ink:${inkOn(c)}">${esc(trip.emoji || '✈️')}</div>
        <div class="trip-info" data-open="${trip.id}" role="button" tabindex="0">
          <div class="name">${esc(trip.name)}</div>
          <div class="when">${esc(formatDateLabel(trip.dateStart))} – ${esc(formatDateLabel(trip.dateEnd))}</div>
          <div class="stat">
            <span>${trip.days.length} 天</span>
            <span>${stopCount} 個行程</span>
            ${bookedCount ? `<span style="color:var(--ok)">已訂位 ${bookedCount}</span>` : ''}
          </div>
        </div>
        <button class="trip-edit" data-edit="${trip.id}" aria-label="編輯 ${esc(trip.name)}">✎</button>
      </div>`;
  }).join('');

  box.innerHTML = (trips.length ? cards : `
    <div class="empty">
      還沒有任何旅程。<br>
      按下面的 <strong>＋ 新增一趟旅程</strong> 開始規劃吧。
    </div>`) +
    `<button class="add-trip" id="btnNewTrip">＋ 新增一趟旅程</button>`;
}

/* ============================================================
   二、行程頁
   ============================================================ */
function currentTrip() { return getTrip(view.tripId); }

function currentDay() {
  const trip = currentTrip();
  if (!trip) return null;
  return getDay(trip, view.dayId) || trip.days[0] || null;
}

function renderPlan() {
  const trip = currentTrip();
  if (!trip) { go('trips'); return; }
  const day = currentDay();
  if (day) view.dayId = day.id;

  // 天數 tabs（動態產生，不再寫死）
  $('#dayTabs').innerHTML = trip.days.map((d, i) => {
    const c = dayColor(trip.color, i);
    const on = d.id === view.dayId;
    return `<button class="daytab" role="tab" aria-selected="${on}" data-day="${d.id}"
              style="--c:${c}; --c-ink:${inkOn(c)}">Day ${i + 1}</button>`;
  }).join('');

  if (!day) { $('#dayView').innerHTML = ''; return; }

  const idx = trip.days.indexOf(day);
  const c = dayColor(trip.color, idx);
  const routeUrl = buildRouteUrl(day);

  const stopsHtml = day.stops.length
    ? day.stops.map(stop => renderStop(stop, c)).join('')
    : `<li class="empty">這天還沒有安排。<br>到下面的 <strong>＋ 新增</strong> 分頁貼一段文字，<br>或按「手動新增一筆」。</li>`;

  $('#dayView').innerHTML = `
    <div class="day-head" style="--c:${c}; --c-ink:${inkOn(c)}">
      <span class="day-badge">Day ${idx + 1}</span>
      <span class="day-title">${esc(day.title || '（尚未命名）')}</span>
      <span class="day-date">${esc(formatDateLabel(day.date))}</span>
      ${routeUrl ? `<button class="day-route" id="btnRoute">🗺 看今日路線</button>` : ''}
    </div>
    <ul class="stops" id="stopList">${stopsHtml}</ul>
    <div class="day-foot">
      <button class="ghost-btn" id="btnAddStop">＋ 手動新增一筆</button>
      <button class="ghost-btn" id="btnEditDay">✎ 這天的標題</button>
      <button class="ghost-btn" id="btnAddDay">＋ 加一天</button>
      ${trip.days.length > 1 ? `<button class="ghost-btn danger" id="btnDelDay">刪除這天</button>` : ''}
    </div>`;

  initDrag($('#stopList'), day.id);
}

function renderStop(stop, color) {
  const mapUrl = stop.mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.mapQuery)}`
    : '';
  return `
    <li class="stop ${stop.alt ? 'alt-stop' : ''}" data-stop="${stop.id}" style="--c:${color}">
      <div class="stop-grip" title="按住拖曳可以調整順序">⠿</div>
      <div class="stop-time">${esc(stop.time || '')}</div>
      <div class="stop-body">
        <div class="stop-name">
          <span>${TYPE_ICONS[stop.type] || '📍'}</span>
          <span class="txt">${esc(stop.name)}</span>
          ${stop.booked ? '<span class="pill pill-booked">已訂位 ✅</span>' : ''}
          ${stop.alt ? '<span class="pill pill-alt">備案</span>' : ''}
        </div>
        ${stop.note ? `<div class="stop-note">${esc(stop.note)}</div>` : ''}
        ${mapUrl ? `<a class="map-link" href="${mapUrl}" target="_blank" rel="noopener">🗺 Google Maps</a>` : ''}
      </div>
      <button class="stop-edit" data-edit-stop="${stop.id}" aria-label="編輯 ${esc(stop.name)}">✎</button>
    </li>`;
}

/**
 * 把當天的景點串成 Google Maps 多點路線。
 * 備案、沒有地圖搜尋詞的都跳過（那些不是實際會走的點）。
 */
function buildRouteUrl(day) {
  const pts = day.stops.filter(s => s.mapQuery && !s.alt).map(s => s.mapQuery);
  if (pts.length < 2) return '';
  const origin = pts[0];
  const destination = pts[pts.length - 1];
  // Google 的中途點上限是 9 個，超過只取前面 9 個
  const waypoints = pts.slice(1, -1).slice(0, 9);
  let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
  if (waypoints.length) url += `&waypoints=${waypoints.map(encodeURIComponent).join('|')}`;
  url += '&travelmode=driving';
  return url;
}

/* ---------- 拖拉排序 ----------
   用 Pointer Events，滑鼠和觸控走同一套邏輯。
   只有左邊的握把 ⠿ 能拖（握把的 CSS 有 touch-action:none），
   這樣手機上「捲動頁面」和「拖曳排序」不會打架 —— 這是最容易踩的坑。 */
function initDrag(list, dayId) {
  if (!list) return;
  let dragging = null, rows = [], startIdx = -1, dropIdx = -1;

  const clearMarks = () => rows.forEach(r => r.classList.remove('drag-over', 'drag-over-end'));

  list.addEventListener('pointerdown', e => {
    const grip = e.target.closest('.stop-grip');
    if (!grip) return;
    dragging = grip.closest('.stop');
    rows = Array.from(list.querySelectorAll('.stop'));
    startIdx = rows.indexOf(dragging);
    dropIdx = startIdx;
    dragging.classList.add('dragging');
    grip.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  list.addEventListener('pointermove', e => {
    if (!dragging) return;
    e.preventDefault();
    // 看游標目前落在哪兩列之間
    let idx = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { idx = i; break; }
    }
    if (idx === dropIdx) return;
    dropIdx = idx;
    clearMarks();
    if (idx < rows.length) rows[idx].classList.add('drag-over');
    else rows[rows.length - 1].classList.add('drag-over-end');
  });

  const finish = () => {
    if (!dragging) return;
    dragging.classList.remove('dragging');
    clearMarks();
    // 往下搬的時候，因為自己會先被抽走，目標位置要往前一格
    const to = dropIdx > startIdx ? dropIdx - 1 : dropIdx;
    dragging = null;
    if (to !== startIdx && to >= 0) {
      moveStop(view.tripId, dayId, startIdx, to);
      renderPlan();
    }
  };
  list.addEventListener('pointerup', finish);
  list.addEventListener('pointercancel', finish);
}

/* ============================================================
   三、新增分頁（對話式）
   ============================================================ */
const CHIPS = [
  '貼一段 IG 貼文',
  '19:30 火星 Cafe Mars 永和街69號 已訂位',
  '一次貼好幾家（每家之間空一行）'
];

function pushMsg(msg) {
  view.chat.push(msg);
  if (view.chat.length > 60) view.chat = view.chat.slice(-60);
  renderChat();
}

function renderChat() {
  const box = $('#chatList');
  if (!view.chat.length) {
    box.innerHTML = `
      <div class="empty">
        把找到的資料貼進下面的輸入框，我會幫你拆成一筆一筆的行程。<br><br>
        <strong>可以貼什麼：</strong><br>
        IG 貼文、部落格片段、Google Maps 分享的文字<br>
        店名、地址、營業時間、電話都認得<br><br>
        <strong>截圖怎麼辦？</strong><br>
        丟給 Claude Code 說「加行程」，<br>把它給你的資料從 ☰ →「匯入資料」貼進來。
      </div>`;
    return;
  }

  box.innerHTML = view.chat.map(m => {
    if (m.role === 'me') {
      return `<div class="msg me"><div class="col"><div class="bubble">${esc(m.text)}</div></div></div>`;
    }
    const body = m.card ? renderCard(m) : `<div class="bubble">${esc(m.text)}</div>`;
    return `<div class="msg">
        <div class="avatar" style="background:var(--surface-2)">🧭</div>
        <div class="col" style="flex:1">${body}</div>
      </div>`;
  }).join('');
  requestAnimationFrame(() => { $('#scAdd').scrollTop = $('#scAdd').scrollHeight; });
}

/** 解析結果的確認卡 —— 一定要你看過、勾過才寫進行程 */
function renderCard(msg) {
  const trip = currentTrip();
  if (!trip) return '<div class="bubble">找不到這趟旅程。</div>';
  const items = msg.card.items;
  const chosen = items.filter(i => i._on).length;

  return `<div class="card">
    <div class="ok">解析出 ${items.length} 筆，確認一下要加哪些：</div>
    <div class="items">
      ${items.map((it, i) => `
        <label class="pick" data-on="${it._on ? 1 : 0}">
          <input type="checkbox" data-pick="${i}" ${it._on ? 'checked' : ''}>
          <span class="pk-body">
            <span class="pk-top">
              <span class="pk-time">${esc(it.time)}</span>
              <span class="pk-name">${TYPE_ICONS[it.type] || '📍'} ${esc(it.name)}</span>
              ${it.booked ? '<span class="pill pill-booked">已訂位</span>' : ''}
              ${it.alt ? '<span class="pill pill-alt">備案</span>' : ''}
            </span>
            ${it.note ? `<span class="pk-note">${esc(it.note)}</span>` : ''}
          </span>
          <button class="pk-edit" data-fix="${i}" type="button" aria-label="修改這筆">✎</button>
        </label>`).join('')}
    </div>
    <div class="where">
      加到：
      <select data-target-day>
        ${trip.days.map((d, i) =>
          `<option value="${d.id}" ${d.id === view.dayId ? 'selected' : ''}>Day ${i + 1}　${esc(formatDateLabel(d.date))}</option>`
        ).join('')}
      </select>
    </div>
    <button class="go" data-commit ${chosen ? '' : 'disabled'}>加入 ${chosen} 筆行程</button>
  </div>`;
}

/** 使用者按下送出：解析 → 出確認卡 */
function handleSend() {
  const input = $('#msgInput');
  const text = input.value.trim();
  if (!text) return;
  const trip = currentTrip();
  if (!trip) { toast('請先進入一趟旅程'); return; }

  input.value = '';
  autoGrow();
  pushMsg({ role: 'me', text });

  const stops = parseText(text, guessCity(trip.name));
  if (!stops.length) {
    pushMsg({ role: 'bot', text: '這段我看不出來有店名耶。可以試著把「店名、地址、營業時間」都貼進來，或每家之間空一行。' });
    return;
  }
  stops.forEach(s => { s._on = true; });
  view.pending = { items: stops };
  pushMsg({ role: 'bot', card: view.pending });
}

/** 確認卡按下「加入」 */
function commitPending(dayId) {
  if (!view.pending) return;
  const picked = view.pending.items.filter(i => i._on);
  if (!picked.length) return;
  picked.forEach(item => {
    addStop(view.tripId, dayId, {
      time: item.time, name: item.name, note: item.note,
      type: item.type, mapQuery: item.mapQuery,
      booked: !!item.booked, alt: !!item.alt
    });
  });
  const trip = currentTrip();
  const dayIdx = trip.days.findIndex(d => d.id === dayId);
  view.dayId = dayId;
  view.pending = null;
  // 把卡片換成完成訊息，避免重複按
  view.chat[view.chat.length - 1] = { role: 'bot', text: `✅ 已加入 ${picked.length} 筆到 Day ${dayIdx + 1}。\n可以到「行程」分頁看看，順序可以用左邊的 ⠿ 拖曳調整。` };
  renderChat();
  renderPlan();
  toast(`已加入 ${picked.length} 筆`);
}

/* 輸入框跟著內容長高，最高 130px */
function autoGrow() {
  const t = $('#msgInput');
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 130) + 'px';
}

/* ============================================================
   四、彈出面板（表單）
   ============================================================ */
function openSheet(html, onMount) {
  closeSheet();
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg) closeSheet(); });
  $('.app').appendChild(bg);
  if (onMount) onMount(bg);
  return bg;
}
function closeSheet() {
  const el = document.querySelector('.sheet-bg');
  if (el) el.remove();
}

/** 色票 + emoji 選擇器（共用小元件） */
function swatchHtml(current) {
  return `<div class="swatches" id="colorPick">` + TRIP_COLORS.map(c =>
    `<button type="button" class="sw" data-c="${c}" style="--c:${c}" aria-pressed="${c === current}" aria-label="顏色 ${c}"></button>`
  ).join('') + `</div>`;
}
function emojiHtml(current) {
  return `<div class="emojis" id="emojiPick">` + TRIP_EMOJIS.map(e =>
    `<button type="button" class="emoji-btn" data-e="${e}" aria-pressed="${e === current}">${e}</button>`
  ).join('') + `</div>`;
}
/** 讓一組按鈕變成「單選」行為 */
function bindPick(root, sel, attr, onPick) {
  const box = root.querySelector(sel);
  if (!box) return;
  box.addEventListener('click', e => {
    const btn = e.target.closest('button[' + attr + ']');
    if (!btn) return;
    box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false'));
    btn.setAttribute('aria-pressed', 'true');
    onPick(btn.getAttribute(attr));
  });
}

/* ---------- 旅程表單 ---------- */
function openTripForm(tripId) {
  const trip = tripId ? getTrip(tripId) : null;
  let color = trip ? trip.color : TRIP_COLORS[0];
  let emoji = trip ? trip.emoji : '✈️';
  const today = toYmd(new Date());

  openSheet(`
    <h2>${trip ? '編輯旅程' : '新增旅程'}</h2>
    <p>填好起訖日期，系統會自動幫你排好每一天。</p>
    <div class="field">
      <label>旅程名稱</label>
      <input type="text" id="tName" value="${esc(trip ? trip.name : '')}" placeholder="例如：京都五日、花蓮小旅行">
    </div>
    <div class="row">
      <div class="field"><label>出發日</label><input type="date" id="tStart" value="${trip ? trip.dateStart : today}"></div>
      <div class="field"><label>回程日</label><input type="date" id="tEnd" value="${trip ? trip.dateEnd : today}"></div>
    </div>
    <div class="field">
      <label>備註</label>
      <input type="text" id="tNote" value="${esc(trip ? trip.note : '')}" placeholder="幾人同行、交通方式…">
    </div>
    <h3>封面圖示</h3>${emojiHtml(emoji)}
    <h3>主題色</h3>${swatchHtml(color)}
    <p class="note">主題色會決定每一天的顏色（同色系深淺變化）。</p>
    <div class="sheet-actions">
      <button class="btn btn-secondary" data-close>取消</button>
      ${trip ? '<button class="btn btn-danger" id="tDelete">刪除</button>' : ''}
      <button class="btn btn-primary" id="tSave">儲存</button>
    </div>
  `, root => {
    bindPick(root, '#colorPick', 'data-c', v => { color = v; });
    bindPick(root, '#emojiPick', 'data-e', v => { emoji = v; });
    root.querySelector('[data-close]').onclick = closeSheet;

    root.querySelector('#tSave').onclick = () => {
      const name = root.querySelector('#tName').value.trim();
      const dateStart = root.querySelector('#tStart').value;
      const dateEnd = root.querySelector('#tEnd').value;
      const note = root.querySelector('#tNote').value.trim();
      if (!name) { toast('請輸入旅程名稱'); return; }
      if (!dateStart || !dateEnd) { toast('請選擇起訖日期'); return; }
      if (dateEnd < dateStart) { toast('回程日不能早於出發日'); return; }

      if (trip) {
        const before = trip.days.length;
        updateTrip(trip.id, { name, emoji, color, dateStart, dateEnd, note });
        const after = trip.days.length;
        closeSheet();
        renderTrips(); renderPlan();
        toast(after !== before ? `已更新，天數改為 ${after} 天` : '已更新');
      } else {
        const t = createTrip({ name, emoji, color, dateStart, dateEnd, note });
        closeSheet();
        openTrip(t.id);
        toast(`已建立「${t.name}」，共 ${t.days.length} 天`);
      }
    };

    const del = root.querySelector('#tDelete');
    if (del) del.onclick = () => {
      if (!confirm(`確定要刪除「${trip.name}」？這趟的所有行程都會一起消失，且無法復原。`)) return;
      deleteTrip(trip.id);
      closeSheet();
      go('trips');
      renderTrips();
      toast('已刪除');
    };
  });
}

/* ---------- 景點表單 ----------
   mode: 'db'（直接改資料）或 'pending'（改確認卡裡還沒寫進去的那筆） */
function openStopForm(opts) {
  const { mode, stop, dayId, index } = opts;
  const trip = currentTrip();
  const isNew = !stop;
  const s = stop || { time: '', name: '', note: '', mapQuery: '', type: 'food', booked: false, alt: false };

  openSheet(`
    <h2>${isNew ? '新增行程' : '編輯行程'}</h2>
    <div class="row">
      <div class="field"><label>時間</label><input type="text" id="sTime" value="${esc(s.time)}" placeholder="19:30 或 下午"></div>
      ${mode === 'db' ? `<div class="field"><label>哪一天</label><select id="sDay">
        ${trip.days.map((d, i) => `<option value="${d.id}" ${d.id === dayId ? 'selected' : ''}>Day ${i + 1}　${esc(formatDateLabel(d.date))}</option>`).join('')}
      </select></div>` : ''}
    </div>
    <div class="field"><label>名稱</label><input type="text" id="sName" value="${esc(s.name)}" placeholder="店名或景點名稱"></div>
    <div class="field"><label>備註</label><textarea id="sNote" placeholder="地址、營業時間、注意事項…">${esc(s.note)}</textarea></div>
    <div class="field"><label>Google Maps 搜尋詞</label><input type="text" id="sMap" value="${esc(s.mapQuery)}" placeholder="地址 + 店名，找得最準"></div>
    <div class="field"><label>類型</label><select id="sType">
      ${Object.keys(TYPE_NAMES).map(k => `<option value="${k}" ${k === s.type ? 'selected' : ''}>${TYPE_ICONS[k]} ${TYPE_NAMES[k]}</option>`).join('')}
    </select></div>
    <div class="field"><div class="check-row">
      <label class="check"><input type="checkbox" id="sBooked" ${s.booked ? 'checked' : ''}> ✅ 已訂位</label>
      <label class="check"><input type="checkbox" id="sAlt" ${s.alt ? 'checked' : ''}> 🔄 備案</label>
    </div></div>
    <div class="sheet-actions">
      <button class="btn btn-secondary" data-close>取消</button>
      ${(!isNew && mode === 'db') ? '<button class="btn btn-danger" id="sDelete">刪除</button>' : ''}
      <button class="btn btn-primary" id="sSave">儲存</button>
    </div>
  `, root => {
    root.querySelector('[data-close]').onclick = closeSheet;

    root.querySelector('#sSave').onclick = () => {
      const name = root.querySelector('#sName').value.trim();
      if (!name) { toast('請輸入名稱'); return; }
      const data = {
        time: root.querySelector('#sTime').value.trim() || '待定',
        name,
        note: root.querySelector('#sNote').value.trim(),
        mapQuery: root.querySelector('#sMap').value.trim(),
        type: root.querySelector('#sType').value,
        booked: root.querySelector('#sBooked').checked,
        alt: root.querySelector('#sAlt').checked
      };

      if (mode === 'pending') {
        // 只改確認卡上的那一筆，還沒寫進行程
        Object.assign(view.pending.items[index], data);
        closeSheet();
        renderChat();
        return;
      }

      const targetDay = root.querySelector('#sDay') ? root.querySelector('#sDay').value : dayId;
      if (isNew) {
        addStop(view.tripId, targetDay, data);
        view.dayId = targetDay;
        toast('已新增');
      } else {
        const res = updateStop(view.tripId, dayId, stop.id, data, targetDay);
        if (res && res.moved) view.dayId = targetDay;
        toast('已更新');
      }
      closeSheet();
      renderPlan();
    };

    const del = root.querySelector('#sDelete');
    if (del) del.onclick = () => {
      if (!confirm(`確定要刪除「${s.name}」？`)) return;
      deleteStop(view.tripId, dayId, stop.id);
      closeSheet();
      renderPlan();
      toast('已刪除');
    };
  });
}

/* ---------- 這一天的標題 ---------- */
function openDayForm() {
  const trip = currentTrip();
  const day = currentDay();
  if (!day) return;
  openSheet(`
    <h2>Day ${trip.days.indexOf(day) + 1} 設定</h2>
    <div class="field"><label>這天的主題</label>
      <input type="text" id="dTitle" value="${esc(day.title)}" placeholder="例如：早午餐＋逛街＋展覽"></div>
    <div class="field"><label>日期</label><input type="date" id="dDate" value="${esc(day.date)}"></div>
    <div class="sheet-actions">
      <button class="btn btn-secondary" data-close>取消</button>
      <button class="btn btn-primary" id="dSave">儲存</button>
    </div>
  `, root => {
    root.querySelector('[data-close]').onclick = closeSheet;
    root.querySelector('#dSave').onclick = () => {
      day.title = root.querySelector('#dTitle').value.trim();
      day.date = root.querySelector('#dDate').value;
      saveDB();
      closeSheet();
      renderPlan(); renderTrips();
      toast('已更新');
    };
  });
}

/* ---------- 設定 / 說明 ---------- */
function openMenu() {
  const theme = getTheme();
  openSheet(`
    <h2>設定與說明</h2>

    <h3>外觀</h3>
    <div class="seg-theme" id="themePick">
      <button type="button" data-t="auto" aria-pressed="${theme === 'auto'}">跟隨系統</button>
      <button type="button" data-t="light" aria-pressed="${theme === 'light'}">淺色</button>
      <button type="button" data-t="dark" aria-pressed="${theme === 'dark'}">深色</button>
    </div>

    <h3>備份你的資料</h3>
    <p>行程存在<strong>這台裝置的瀏覽器</strong>裡。清除瀏覽資料、換手機都會消失，記得定期匯出備份。</p>
    <button class="btn btn-secondary" id="btnExport" style="width:100%">⬇ 匯出備份檔</button>

    <h3>匯入資料</h3>
    <p>兩種東西都可以貼進來：<br>
      ① 之前匯出的備份檔內容（會覆蓋現在全部資料）<br>
      ② Claude Code 幫你辨識截圖後給的行程資料</p>
    <div class="field"><textarea id="importText" class="tall" placeholder='把 JSON 整段貼進來，開頭是 { 結尾是 }'></textarea></div>
    <button class="btn btn-secondary" id="btnImport" style="width:100%">貼上並匯入</button>

    <h3>截圖怎麼變成行程？</h3>
    <p>在 Claude Code 把截圖丟給它，說「<code>加行程</code>」，它會回你一段資料，複製後貼到上面的匯入框即可。</p>

    <h3>貼文字的訣竅</h3>
    <ul>
      <li>店名、地址、營業時間、電話一起貼，認得最準</li>
      <li>一次貼好幾家時，<strong>每家之間空一行</strong></li>
      <li>時間寫在最前面（<code>19:30 火星咖啡…</code>）才會被當成到訪時間</li>
      <li>寫「已訂位」「備案」會自動標記</li>
      <li>解析難免猜錯，加入前的確認卡上可以逐筆修改</li>
    </ul>

    <div class="sheet-actions"><button class="btn btn-primary" data-close>關閉</button></div>
  `, root => {
    root.querySelector('[data-close]').onclick = closeSheet;
    bindPick(root, '#themePick', 'data-t', v => { setTheme(v); });

    root.querySelector('#btnExport').onclick = () => {
      exportJSON();
      toast('已下載備份檔');
    };

    root.querySelector('#btnImport').onclick = () => {
      const text = root.querySelector('#importText').value.trim();
      if (!text) { toast('請先貼上資料'); return; }
      const res = parseImportText(text);

      if (res.kind === 'error') { alert(res.error); return; }

      if (res.kind === 'backup') {
        if (!confirm(`這是一份完整備份（${res.trips.length} 趟旅程）。\n匯入會覆蓋現在全部資料，確定嗎？`)) return;
        importBackup(res.trips);
        closeSheet();
        go('trips'); renderTrips();
        toast(`已還原 ${res.trips.length} 趟旅程`);
        return;
      }

      // 一批景點 → 丟進確認卡，跟貼文字走同一條路
      if (!currentTrip()) { alert('請先進入一趟旅程，再匯入景點。'); return; }
      const items = res.stops.map(s => Object.assign(
        { time: '待定', note: '', type: 'sight', mapQuery: '', booked: false, alt: false },
        s, { _on: true }
      ));
      view.pending = { items };
      closeSheet();
      go('add');
      pushMsg({ role: 'me', text: `（匯入 ${items.length} 筆資料）` });
      pushMsg({ role: 'bot', card: view.pending });
    };
  });
}

/* ============================================================
   五、畫面切換
   ============================================================ */
function go(screen) {
  view.screen = screen;
  $('#scTrips').hidden = screen !== 'trips';
  $('#scPlan').hidden = screen !== 'plan';
  $('#scAdd').hidden = screen !== 'add';
  $('#composer').hidden = screen !== 'add';
  $('#tabBar').hidden = screen === 'trips';
  $('#btnBack').hidden = screen === 'trips';
  $('#tabPlan').setAttribute('aria-selected', String(screen === 'plan'));
  $('#tabAdd').setAttribute('aria-selected', String(screen === 'add'));

  const trip = currentTrip();
  if (screen === 'trips') {
    $('#barTitle').textContent = '我的旅程';
  } else if (trip) {
    $('#barTitle').innerHTML = `${esc(trip.emoji || '')} ${esc(trip.name)}<span class="sub">${esc(formatDateLabel(trip.dateStart))} 起</span>`;
  }
  if (screen === 'add') { renderChat(); setTimeout(autoGrow, 0); }
}

function openTrip(tripId) {
  view.tripId = tripId;
  DB.activeTripId = tripId;
  saveDB();
  const trip = currentTrip();
  view.dayId = trip && trip.days[0] ? trip.days[0].id : null;
  view.chat = [];
  view.pending = null;
  renderPlan();
  go('plan');
}

/* ============================================================
   六、事件綁定
   ============================================================ */

// 旅程列表
$('#tripList').addEventListener('click', e => {
  const open = e.target.closest('[data-open]');
  const edit = e.target.closest('[data-edit]');
  if (edit) { openTripForm(edit.getAttribute('data-edit')); return; }
  if (open) { openTrip(open.getAttribute('data-open')); return; }
  if (e.target.closest('#btnNewTrip')) openTripForm(null);
});
$('#tripList').addEventListener('keydown', e => {
  const open = e.target.closest('[data-open]');
  if (open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openTrip(open.getAttribute('data-open')); }
});

// 天數 tabs
$('#dayTabs').addEventListener('click', e => {
  const tab = e.target.closest('[data-day]');
  if (!tab) return;
  view.dayId = tab.getAttribute('data-day');
  renderPlan();
});

// 行程頁的各種按鈕
$('#dayView').addEventListener('click', e => {
  const trip = currentTrip();
  const day = currentDay();
  if (!trip || !day) return;

  const editStop = e.target.closest('[data-edit-stop]');
  if (editStop) {
    const stop = day.stops.find(s => s.id === editStop.getAttribute('data-edit-stop'));
    if (stop) openStopForm({ mode: 'db', stop, dayId: day.id });
    return;
  }
  if (e.target.closest('#btnAddStop')) { openStopForm({ mode: 'db', stop: null, dayId: day.id }); return; }
  if (e.target.closest('#btnEditDay')) { openDayForm(); return; }
  if (e.target.closest('#btnAddDay')) {
    const d = addDay(trip.id);
    view.dayId = d.id;
    renderPlan(); renderTrips();
    toast(`已加一天（Day ${trip.days.length}）`);
    return;
  }
  if (e.target.closest('#btnDelDay')) {
    const idx = trip.days.indexOf(day);
    if (day.stops.length && !confirm(`Day ${idx + 1} 裡還有 ${day.stops.length} 筆行程，刪除後就沒了。確定嗎？`)) return;
    deleteDay(trip.id, day.id);
    view.dayId = null;
    renderPlan(); renderTrips();
    toast('已刪除這天');
    return;
  }
  if (e.target.closest('#btnRoute')) {
    const url = buildRouteUrl(day);
    const pts = day.stops.filter(s => s.mapQuery && !s.alt).length;
    if (pts > 11) toast('Google 最多支援 11 個點，這次只帶前面幾個');
    window.open(url, '_blank', 'noopener');
  }
});

// 確認卡上的操作
$('#chatList').addEventListener('click', e => {
  const fix = e.target.closest('[data-fix]');
  if (fix) {
    e.preventDefault();
    const i = +fix.getAttribute('data-fix');
    openStopForm({ mode: 'pending', stop: view.pending.items[i], index: i });
    return;
  }
  const commit = e.target.closest('[data-commit]');
  if (commit) {
    const sel = $('#chatList').querySelector('[data-target-day]');
    commitPending(sel ? sel.value : view.dayId);
  }
});
$('#chatList').addEventListener('change', e => {
  const pick = e.target.closest('[data-pick]');
  if (!pick || !view.pending) return;
  view.pending.items[+pick.getAttribute('data-pick')]._on = pick.checked;
  renderChat();
});

// 輸入區
$('#btnSend').addEventListener('click', handleSend);
$('#msgInput').addEventListener('input', autoGrow);
// 手機上 Enter 要能換行（貼多筆資料靠換行），所以只有滑鼠裝置按 Enter 才送出
const isTouch = window.matchMedia('(pointer: coarse)').matches;
$('#msgInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !isTouch) { e.preventDefault(); handleSend(); }
});
$('#chips').innerHTML = CHIPS.map(c => `<button type="button" class="chip">${esc(c)}</button>`).join('');
$('#chips').addEventListener('click', e => {
  if (!e.target.classList.contains('chip')) return;
  const t = $('#msgInput');
  // 第一顆和第三顆只是說明，不要真的填進去
  if (e.target.textContent.startsWith('貼一段') || e.target.textContent.startsWith('一次貼')) {
    t.focus(); return;
  }
  t.value = e.target.textContent;
  autoGrow(); t.focus();
});

// 分頁與返回
$('#tabPlan').onclick = () => go('plan');
$('#tabAdd').onclick = () => go('add');
$('#btnBack').onclick = () => { renderTrips(); go('trips'); };
$('#btnMenu').onclick = openMenu;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

/* ============================================================
   七、啟動
   ============================================================ */
loadDB();
setTheme(getTheme());
renderTrips();
go('trips');

/* 註冊 Service Worker：出門沒網路也打得開。
   路徑一定要用相對路徑 —— GitHub Pages 放在 /trip-app/ 子目錄下，
   寫成 '/sw.js' 會找不到檔案。 */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW 註冊失敗（本機開發時很正常）', err));
  });
}
