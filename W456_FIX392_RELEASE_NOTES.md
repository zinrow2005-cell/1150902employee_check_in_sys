# W456 FIX392｜員工橋接網址與握手可靠性修正版

## 本版修正
- 延續 W455 的「批次工作單一中心」架構，未恢復已退場的全場工作排程中心。
- 修正 W455 GitHub 員工端每次重新載入都以 config.js 覆蓋本機橋接網址，並刪除裝置自訂 /exec 的問題。
- 橋接來源改為：URL 參數／本機儲存 > GitHub config.js 預設；新部署若產生新 /exec，可在「橋接設定」貼上後長期保留。
- 登入前版本檢查改用專用 clientHandshake；即使指到舊部署，也會立即得到橋接回覆，不再卡在舊 health POST 的固定逾時。
- Apps Script 所有 iframe bridgeHtml_ 回覆自動帶 BRIDGE_VERSION。
- 橋接設定畫面顯示目前 /exec 部署 ID 尾碼與來源；逾時錯誤也顯示正在使用哪個 endpoint。
- 主系統重新寫入 github_attendance/config.js 時保留 version 欄位。

## 資料安全
- 不需重建員工、PIN、SYNC_KEY、打卡、請假、班表或薪資資料。
- DATA-SAFE 更新包不含 data/。
