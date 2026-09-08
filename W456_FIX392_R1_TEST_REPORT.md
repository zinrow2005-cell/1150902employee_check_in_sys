# W456 FIX392-R1 測試報告

日期：2026-09-08

## 問題重現
FIX392 前端在正式 `login` 之前送出新增的 `clientHandshake`。W455（以及更早）的線上 Code.gs 沒有這個 action，因此後端回覆「未知 action」，登入在驗證員工編號／PIN 前即失敗。

## 修正驗證
- Chromium 模擬 W455_FIX391_CLEAN 後端：PASS。
  - 第一個 POST action = `login`。
  - 不再送出 `clientHandshake`。
  - 後續 `portalData` 正常。
  - `health` 僅做非阻塞診斷。
- Chromium 模擬 W456_FIX392_CLEAN 後端：PASS。
  - 第一個 POST action = `login`。
  - `portalData` 正常。
  - `health` 診斷正常。
- 橋接設定「測試橋接」：
  - W455 後端可顯示正常，版本差異只提示、不阻擋登入。
  - W456 後端可顯示正常。
- JavaScript 語法：`node --check app.js` PASS。
- Bundled Code.gs 語法：PASS。
- Service Worker cache key 已升級為 FIX392-R1，避免手機繼續使用舊 app.js。

## 部署範圍
此問題只需要更新 GitHub 員工端。既有正式 Apps Script 不需要為「未知 action」問題再次部署；主系統資料也不需要更新。
