/* ============================================================
   Firebase 設定（跨裝置同步用）

   沿用「行事曆」那個專案 hpschedule，不用再申請一個。
   兩個 App 的資料分在不同的最上層資料夾，互不干擾：
     families/<家庭代碼>/...   ← 行事曆
     trips/<旅程代碼>/items/   ← 這個 App

   ⚠️ 這份設定會被公開（repo 是公開的），這是正常的 ——
   Firebase 的網頁設定值本來就設計成可公開。真正的鎖是「代碼」：
   資料都在 trips/<代碼>/ 底下，不知道代碼的人讀不到也列不出來。
   規則內容見 README.md 的「跨裝置同步」。
   ============================================================ */
window.FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDhEO4CwitvBkc_T2YksbIKKv68HmLRR3o",
  authDomain:        "hpschedule.firebaseapp.com",
  projectId:         "hpschedule",
  storageBucket:     "hpschedule.firebasestorage.app",
  messagingSenderId: "498562850403",
  appId:             "1:498562850403:web:55a9c60b14cdbaef26e256"
};
