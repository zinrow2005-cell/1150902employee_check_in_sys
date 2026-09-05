# W433 FIX369 CLEAN 部署

1. 將本資料夾內容完整覆蓋 GitHub repository 根目錄。
2. 確認登入頁顯示「GitHub 員工自助端 W433 FIX369」。
3. 將 `backend_google_apps_script/Code.gs` 完整覆蓋 Apps Script，使用「管理部署 → 編輯目前部署 → 新版本 → 部署」，維持同一個 `/exec`。
4. 「測試橋接」必須回傳 `W433_FIX369_CLEAN`，並回報 `sessionDays = 15`。
5. 第一次升級到 FIX369 後，既有 W432 短期 Session 不會轉成 15 天 Session；員工需重新登入一次。
6. 重新登入成功後，關閉瀏覽器／PWA再開啟，15 天內應自動恢復登入。
