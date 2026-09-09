/* ============================================================
   範例資料：台南四日遊
   第一次打開 App 時會載入這一趟，之後就以你自己存的資料為準。

   資料的層次是這樣（像資料夾一層一層包）：
     旅程 Trip → 天 Day → 景點 Stop
   ============================================================ */

const SAMPLE_TRIPS = [
  {
    id: 'trip-tainan',
    name: '台南四日遊',
    emoji: '🏮',
    color: '#C05020',              // 這趟的主題色，每一天的顏色由它推算
    dateStart: '2026-04-24',
    dateEnd: '2026-04-27',
    note: '兩人同行．騎車 ＋ 坐車',
    stay: {
      name: '友愛街旅館',
      mapQuery: '台南市中西區友愛街115巷5號 友愛街旅館'
    },
    days: [
      {
        id: 'day1',
        date: '2026-04-24',
        title: '抵達，開逛！',
        stops: [
          { id: 'd1s1', time: '13:11', name: '台南高鐵站抵達', note: '轉區間車到台南車站，或搭 Uber 直達友愛街旅館', type: 'transit', mapQuery: '台南高鐵站', booked: false, alt: false },
          { id: 'd1s2', time: '抵達後', name: '放行李 / 找小吃墊胃', note: '旅館 check-in，附近找小吃墊胃，開始逛', type: 'hotel', mapQuery: '台南市中西區友愛街115巷5號 友愛街旅館', booked: false, alt: false },
          { id: 'd1s3', time: '13:30', name: '新泰興被服廠', note: '中正路 271 巷 6-1 號｜週五 13:00–19:00｜攝影書店＋手工茶，老被服廠改造空間', type: 'sight', mapQuery: '台南市中西區中正路271巷6-1號 新泰興被服廠', booked: false, alt: false },
          { id: 'd1s4', time: '下午', name: '蝸牛巷', note: '正興街附近｜散步拍照，傍晚光線美', type: 'sight', mapQuery: '台南蝸牛巷 正興街', booked: false, alt: false },
          { id: 'd1s5', time: '15:30', name: 'ditto bakery 蒂頭製作所', note: '永福路二段 35 巷 6 號｜週五 15:30 開始｜麵包甜點', type: 'cafe', mapQuery: '台南市中西區永福路二段35巷6號 ditto bakery', booked: false, alt: true },
          { id: 'd1s6', time: '傍晚', name: 'Laïzé Tainan', note: '文和街 180 號｜週四–日 12:30–19:00｜法式香水概念茶飲', type: 'cafe', mapQuery: '台南市中西區文和街180號 Laizé', booked: false, alt: false },
          { id: 'd1s7', time: '飯前', name: 'Feedo', note: '友愛街 24-1 號｜週五有開｜設計感飲料', type: 'cafe', mapQuery: '台南市中西區友愛街24-1號 Feedo', booked: false, alt: false },
          { id: 'd1s8', time: '19:30', name: '火星 Cafe Mars', note: '永和街 69 號｜週四–日 12–21:00｜已訂位 19:30，僅 9 位', type: 'food', mapQuery: '台南市中西區永和街69號 火星Cafe Mars', booked: true, alt: false },
          { id: 'd1s9', time: '飯後', name: 'ToyDaddy 玩具老爹', note: '武聖路 27 巷 23 號｜週五 14:00–22:00｜扭蛋、盲盒、一番賞', type: 'shop', mapQuery: '台南市中西區武聖路27巷23號 ToyDaddy', booked: false, alt: false },
          { id: 'd1s10', time: '晚上', name: '武聖夜市 或 回旅館發懶', note: '週五有開，看狀況決定', type: 'sight', mapQuery: '台南武聖夜市', booked: false, alt: false }
        ]
      },
      {
        id: 'day2',
        date: '2026-04-25',
        title: '早午餐＋逛街＋展覽＋市場',
        stops: [
          { id: 'd2s1', time: '12:30', name: 'PEKO PEKO 早午餐', note: '民生路一段 132 巷 5 號｜09:30–16:00｜已訂位 12:30', type: 'food', mapQuery: '台南市中西區民生路一段132巷5號 PEKO PEKO', booked: true, alt: false },
          { id: 'd2s2', time: '飯後', name: '漢菓方 HANGOFUN', note: '新美街 70 號｜週四–日 14:30 開｜新式漢方巧克力 / 曼陀珠，走路就到', type: 'shop', mapQuery: '台南市中西區新美街70號 漢菓方HANGOFUN', booked: false, alt: false },
          { id: 'd2s3', time: '下午', name: '可樂計劃 Project Cola', note: '民生路一段 6 號｜12:00–19:00｜13 種中藥香料手工可樂', type: 'cafe', mapQuery: '台南市中西區民生路一段6號 可樂計劃Project Cola', booked: false, alt: false },
          { id: 'd2s4', time: '下午', name: '國華街', note: '台南著名美食街，閒逛吃小食', type: 'sight', mapQuery: '台南國華街', booked: false, alt: false },
          { id: 'd2s5', time: '下午', name: '西市場', note: '西門路二段｜週六 11:00–21:00｜文青市集＋老建築', type: 'sight', mapQuery: '台南西市場 西門路二段', booked: false, alt: false },
          { id: 'd2s6', time: '下午', name: '臺南市美術館 1 館', note: '南門路 37 號｜10:00–18:00（週六至 21:00）｜「恁兜攏按怎拜？從餐桌到神桌的藝術連結」⚠ 出發前確認官網', type: 'sight', mapQuery: '台南市中西區南門路37號 臺南市美術館', booked: false, alt: false },
          { id: 'd2s7', time: '晚餐', name: '立吞壽司（主選）', note: '友愛街 117 號，友愛市場內｜週六 10:00–14:00 / 17:00–售完｜⚠ 建議電話確認晚段有無開放', type: 'food', mapQuery: '台南市中西區友愛街117號 立吞壽司 友愛市場', booked: false, alt: false },
          { id: 'd2s8', time: '備案', name: '程食堂（友愛市場）', note: 'LINE: asd000923｜電話: 0973-085-078｜建議開店前預訂', type: 'food', mapQuery: '台南友愛市場 程食堂', booked: false, alt: true }
        ]
      },
      {
        id: 'day3',
        date: '2026-04-26',
        title: '早午餐＋咖啡＋展覽＋雜貨＋神農街＋串燒',
        stops: [
          { id: 'd3s1', time: '11:00', name: '昔昔 むかしむかし', note: '西門路二段 228 巷 9 號｜11:00–14:30｜日本手作飯丸｜⚠ 巷子隱密，請耐心找路，勿停機車於巷內', type: 'food', mapQuery: '台南市中西區西門路二段228巷9號 昔昔', booked: false, alt: false },
          { id: 'd3s2', time: '飯後', name: 'DIDI AT HOME Coffee', note: '北區西門路三段 24 巷 17 號｜週四–日 10:00–17:00｜工業風外帶咖啡', type: 'cafe', mapQuery: '台南市北區西門路三段24巷17號 DIDI AT HOME Coffee', booked: false, alt: false },
          { id: 'd3s3', time: '下午', name: 'ゴゴ台所', note: '樹林街二段 111 號｜11:00–18:00｜甜點咖啡，無訂位，低消一杯飲品', type: 'cafe', mapQuery: '台南市中西區樹林街二段111號 ゴゴ台所', booked: false, alt: false },
          { id: 'd3s4', time: '下午', name: '顆粒－爿爿花展', note: '民權路二段 64 巷 56 號 3 樓｜免費入場｜11:00–19:00｜展期至 5/2', type: 'sight', mapQuery: '台南市中西區民權路二段64巷56號3樓 顆粒花展', booked: false, alt: false },
          { id: 'd3s5', time: '下午', name: 'あ雜貨', note: '忠義路二段 158 巷 23 號之 1｜週日 13:00–19:00', type: 'shop', mapQuery: '台南市中西區忠義路二段158巷23號之1 あ雜貨', booked: false, alt: false },
          { id: 'd3s6', time: '下午', name: '死腦筋選物所', note: '忠明街 4 號｜12:00–22:00｜選物雜貨店', type: 'shop', mapQuery: '台南市中西區忠明街4號 死腦筋選物所', booked: false, alt: false },
          { id: 'd3s7', time: '17:30', name: '神農街', note: '傍晚散步，紅燈籠天黑後最美，步行 5 分鐘可到富治', type: 'sight', mapQuery: '台南神農街', booked: false, alt: false },
          { id: 'd3s8', time: '18:30', name: '富治串燒', note: '公園南路 180 號｜18:00–00:00｜已訂位 18:30', type: 'food', mapQuery: '台南市北區公園南路180號 富治串燒', booked: true, alt: false }
        ]
      },
      {
        id: 'day4',
        date: '2026-04-27',
        title: '收尾返台中',
        stops: [
          { id: 'd4s1', time: '上午', name: '水仙宮古早味鍋燒麵', note: '友愛街 113 號｜週一 11:00–14:00 / 16:00–19:30｜就在旅館旁，最後一餐！', type: 'food', mapQuery: '台南市中西區友愛街113號 水仙宮古早味鍋燒麵', booked: false, alt: false },
          { id: 'd4s2', time: '上午', name: '退房整理行李', note: '友愛街旅館 check-out', type: 'hotel', mapQuery: '台南市中西區友愛街115巷5號 友愛街旅館', booked: false, alt: false },
          { id: 'd4s3', time: '13:50', name: '前往台南高鐵站', note: '搭 Uber 約 20–30 分鐘，建議 13:50 前出發', type: 'transit', mapQuery: '台南高鐵站', booked: false, alt: false },
          { id: 'd4s4', time: '14:41', name: '高鐵發車返台中 🏠', note: '14:41 班次，抵達台中', type: 'transit', mapQuery: '台南高鐵站', booked: false, alt: false }
        ]
      }
    ]
  }
];
