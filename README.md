# 旅程 Trip

多趟旅程規劃的網頁 App。貼一段文字就能自動拆成行程，可以加到手機主畫面當 App 用。

線上版：https://hadolh.github.io/trip-app/

前身是網頁版 Claude 做的「台南四日行程」，這一版把它從單趟改成「去哪都能用」。

---

## 功能

- 🧳 **多趟旅程**：填好起訖日期，自動生成 Day 1～N
- ✍️ **貼文字自動建行程**：IG 貼文、部落格、Google Maps 分享的文字都認得，一次可以貼好幾家
- 📸 **截圖交給 Claude Code 辨識**，產出的資料從「匯入資料」貼進來
- ✅ 加入前會先出確認卡，逐筆勾選、可修改，不會亂寫進去
- ⠿ **拖曳排序**：按住每一列左邊的握把上下拖
- 🗺 **每日路線**：一鍵把當天景點串成 Google Maps 多點導航
- 🌙 深色模式（跟隨系統，也可手動切）
- 📱 PWA：手機「加入主畫面」後就是獨立 App，沒網路也打得開
- 💾 匯出／匯入備份

---

## 檔案結構

```
trip-app/
├── index.html          # 骨架：手機外殼 + 三個畫面 + 底部分頁
├── css/app.css         # 設計 token + 全部樣式
├── js/
│   ├── sample-data.js  # 範例資料（台南四日遊）
│   ├── store.js        # 資料層：存讀檔、舊資料搬家、CRUD、匯出匯入
│   ├── parser.js       # 文字解析引擎
│   └── app.js          # 畫面渲染與事件
├── manifest.json       # PWA 設定
├── sw.js               # Service Worker（離線快取）
└── icons/              # App 圖示
```

三層分工：**store 管資料 → parser 管解析 → app 管畫面**。要改功能時，先想「這是哪一層的事」。

---

## 資料結構

```js
{
  version: 2,
  activeTripId: "trip-tainan",
  trips: [{
    id, name, emoji, color,          // color 是主題色，各天顏色由它推算
    dateStart: "2026-04-24",
    dateEnd: "2026-04-27",
    note, stay,
    days: [{
      id, date: "2026-04-24", title,
      stops: [{
        id,
        time: "19:30",               // 時間，或「下午」「待定」
        name: "火星 Cafe Mars",
        note: "地址｜營業時間｜備註",
        type: "food",                // food/cafe/sight/shop/hotel/transit
        mapQuery: "台南市中西區永和街69號 火星Cafe Mars",
        booked: true,                // 已訂位
        alt: false                   // 備案
      }]
    }]
  }]
}
```

資料存在瀏覽器的 localStorage，key 是 `trip_app_v2`。
舊版 key `tainan_itinerary` 如果存在會自動搬過來，**舊 key 不刪**（留著保險）。

---

## 截圖辨識 → 匯入格式

在 Claude Code 丟截圖說「加行程」，會自動觸發 `trip-import` skill，輸出：

```json
{
  "type": "stops",
  "stops": [
    {
      "time": "19:30",
      "name": "火星 Cafe Mars",
      "note": "台南市中西區永和街69號｜週四–日 12:00–21:00",
      "type": "food",
      "mapQuery": "台南市中西區永和街69號 火星Cafe Mars",
      "booked": true,
      "alt": false
    }
  ]
}
```

複製整段 → App 的 ☰ →「匯入資料」→ 貼上 → 選要加到第幾天 → 確認卡上勾選 → 加入。

備份檔則是 `{"type":"backup", "trips":[...]}`，匯入時會覆蓋全部資料（會先問過）。

---

## 本機開發

```bash
cd trip-app
python -m http.server 8000
# 瀏覽器開 http://localhost:8000
```

⚠️ **不要用雙擊 index.html 開啟**。PWA 和 Service Worker 需要 http 環境，`file://` 開起來功能會缺一半。

---

## 踩過的坑（改的時候要注意）

1. **輸入框字級不得小於 16px** — 小於 16px 時 iOS Safari 一點就把整頁放大，版面會被推出螢幕外
2. **Service Worker 路徑一律用相對路徑** — GitHub Pages 在子目錄 `/trip-app/` 下，寫 `/sw.js` 會 404
3. **改版後要把 `sw.js` 的 `CACHE_NAME` 版本號 +1** — 否則手機一直用舊快取，看不到新功能
4. **拖曳握把要 `touch-action: none`** — 否則手機會邊拖邊捲動
5. **`new Date('2026-04-24')` 會少一天** — 那被當成格林威治時間，台灣時區會退回前一天。要自己拆字串組（`fromYmd()` 就是為此而寫）

---

## 之後可以加的

- [ ] 預算記錄與分帳
- [ ] 行程時間衝突提醒
- [ ] 把整趟匯出成 PDF 或分享連結
- [ ] 行程照片（要注意 localStorage 容量只有 5MB 左右）
