# W456 FIX392-R1｜員工登入「未知 action」相容熱修正

## 根因
FIX392 的 GitHub 員工端在真正 `login` 前先送出新動作 `clientHandshake`。W455 與更早已部署的橋接沒有這個 action，因此會直接回覆「未知 action」，登入在驗證員工編號／PIN 之前就被中止。

## 修正
- 登入流程改為直接 `login`，不再讓版本握手阻擋登入。
- `health` 只用於「測試橋接」與登入後非阻塞診斷。
- 線上 Apps Script 版本與前端顯示不同時，只提示診斷資訊，不中止核心登入。
- `postBridge` 會記錄目前 action；若後端仍回「未知 action」，錯誤會指出是哪個動作被拒絕。
- 更新 Service Worker cache key，避免 iPhone／iPad 繼續執行舊 FIX392 app.js。

## 部署範圍
本問題只需更新 GitHub 員工端。既有 Apps Script Code.gs 不必因這個問題再次部署；主系統資料也不需變更。
