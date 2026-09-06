# 王泰山畜牧場｜GitHub 員工自助端 W443 FIX379

## 本版重點

- 完整檢查員工端所有可見時間欄位。
- 「工作項目表／部門工作計畫」原本可能直接顯示 `generatedAt` ISO 時間，改為台灣可讀格式。
- 同日顯示 `今天 HH:mm`，前一日顯示 `昨天 HH:mm`，較早日期顯示 `YYYY/MM/DD（週） HH:mm`，並保留相對時間提示。
- 請假、班表、首頁同步時間沿用既有可讀化格式。

## Bridge 相容性

本版只更新員工端顯示層與 Service Worker cache。Google Apps Script 仍使用 **W441 FIX377 CLEAN** bridge schema，`config.js` 與 `backend_google_apps_script/Code.gs` 的 W441 版本標記是資料介面相容標記，請勿誤認為舊版殘留。

因此 **不需要重新部署 Apps Script**。
