# W443 FIX379｜正式部署

1. 將本資料夾全部檔案覆蓋 GitHub repository 根目錄。
2. `config.js` 保留目前正式 Apps Script `/exec` 網址。
3. Google Apps Script `Code.gs` 不需重新部署，維持 W441 FIX377 bridge schema。
4. GitHub Pages 部署完成後，iPhone / iPad 關閉員工端再重開；登入頁應顯示 `W443 FIX379`。
5. 若仍看到舊畫面，請重新整理或關閉 PWA 後再開，新的 Service Worker cache 為 fix379。
