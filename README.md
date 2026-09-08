# 王泰山畜牧場｜GitHub 員工自助端 W456 FIX392-R2

本資料夾只包含 GitHub Pages 正式執行檔。

- 登入流程：`login → portalData`，`health` 只做背景診斷，不阻擋登入。
- 不再在登入前送出 `clientHandshake`，避免線上 Apps Script 尚未支援新 action 時出現「未知 ACTION」。
- 裝置自行儲存的 Apps Script `/exec` 優先於 `config.js`，重新整理不會被覆蓋。
- Apps Script 橋接協定仍為 `W456_FIX392_CLEAN`，R2 不要求因版本名稱本身重新部署後端。
- R2 為最終整合稽核版：同步主系統內建員工端副本、測試程式與部署文件，避免之後又從主系統資料夾拿到舊 FIX392 前端。

上傳 GitHub 時，將本資料夾內容直接放在 repository 根目錄。
