/* ============================================================
   範例資料
   第一次打開 App 時載入這一趟當作示範，之後就以你自己存的資料為準。
   看膩了可以直接刪掉這趟，或改成你自己的行程。

   資料的層次是這樣（像資料夾一層一層包）：
     旅程 Trip → 天 Day → 景點 Stop
   ============================================================ */

const SAMPLE_TRIPS = [
  {
    id: 'trip-demo',
    name: '示範：兩日小旅行',
    emoji: '🧭',
    color: '#C05020',              // 這趟的主題色，每一天的顏色由它推算
    dateStart: '2026-10-03',
    dateEnd: '2026-10-04',
    note: '這是示範資料，可以直接刪掉',
    stay: null,
    days: [
      {
        id: 'demo-d1',
        date: '2026-10-03',
        title: '抵達、吃飯、隨便晃',
        stops: [
          {
            id: 'demo-s1', time: '10:30', name: '車站抵達',
            note: '先寄放行李再開始逛',
            type: 'transit', mapQuery: '台中車站',
            booked: false, alt: false
          },
          {
            id: 'demo-s2', time: '12:00', name: '示範餐廳',
            // note 的寫法：地址｜營業時間｜其他備註
            note: '中山路 1 號｜11:00–20:00｜已訂位，兩人',
            type: 'food', mapQuery: '台中市中區中山路1號 示範餐廳',
            booked: true, alt: false       // booked = 已訂位，會顯示綠色標記
          },
          {
            id: 'demo-s3', time: '下午', name: '示範咖啡店',
            note: '民權路 22 號｜週四–日 13:00–19:00｜手沖單品',
            type: 'cafe', mapQuery: '台中市中區民權路22號 示範咖啡店',
            booked: false, alt: false
          },
          {
            id: 'demo-s4', time: '備案', name: '示範選物店',
            note: '如果咖啡店客滿就改來這裡',
            type: 'shop', mapQuery: '台中 示範選物店',
            booked: false, alt: true       // alt = 備案，底色會變淡、標黃色籤
          }
        ]
      },
      {
        id: 'demo-d2',
        date: '2026-10-04',
        title: '收尾回家',
        stops: [
          {
            id: 'demo-s5', time: '09:30', name: '示範早餐店',
            note: '公園路 8 號｜06:00–11:00',
            type: 'food', mapQuery: '台中市中區公園路8號 示範早餐店',
            booked: false, alt: false
          },
          {
            id: 'demo-s6', time: '14:00', name: '返程',
            note: '記得提早 30 分鐘到站',
            type: 'transit', mapQuery: '台中車站',
            booked: false, alt: false
          }
        ]
      }
    ]
  }
];
