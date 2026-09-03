# W408 FIX344｜GitHub 員工定位自拍打卡端

## 本版修正
- 修正 Apps Script 登入回傳在多層 iframe 下可能送不到 GitHub 頁面而固定逾時。
- Apps Script 改用 `window.top.postMessage()`，並保留 parent 相容回傳。
- 登入頁「橋接設定」新增「測試雲端橋接」。
- Service Worker 更新為 `fix344-v1`。

## 上傳 GitHub
將本資料夾全部檔案直接覆蓋 Repository 根目錄：
`zinrow2005-cell/1150902employee_check_in_sys`

上傳後開啟正式網址，登入區應顯示「GitHub 員工端 W408」。

## 第一次測試
1. 橋接設定貼既有 Apps Script `/exec`。
2. 按「測試雲端橋接」。
3. 顯示「雲端橋接正常」後，再用員工編號與 PIN 登入。
