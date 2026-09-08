# Apps Script 橋接｜W455 FIX391

正式橋接版本：`W455_FIX391_CLEAN`。本版 health 回報版本與初始化狀態；主管同步寫入加入互斥鎖、舊資料快照及失敗回復。部署後必須建立 Web App 新版本，不能只儲存程式碼。


FIX391 重要修正：員工端的 `health` 是隱藏 iframe POST，因此 `doPost health` 必須回傳 `bridgeHtml_()` 才會向父頁送出 `postMessage`；不可改回純 JSON。`doGet health` 才是主系統診斷使用的 JSON 端點。
