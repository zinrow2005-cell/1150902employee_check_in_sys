# W435 FIX371｜正式部署

1. 將本資料夾全部檔案覆蓋 GitHub repository 根目錄。
2. 將 `backend_google_apps_script/Code.gs` 完整覆蓋 Apps Script，儲存並建立新的 Web App 部署版本。
3. 正式 `/exec` 網址若沿用既有部署，不需修改 `config.js`。
4. 重新開啟員工端，確認右上角顯示 `W435 FIX371`。
5. 測試：新送一筆請假 → 編輯 → 撤回；另以已核准請假測試「申請取消請假」。
6. 單機主系統需同步升級到 W435 FIX371，才會處理撤回與取消請假。
