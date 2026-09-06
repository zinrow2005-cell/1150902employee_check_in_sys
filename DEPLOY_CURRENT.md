# W444 FIX380｜正式部署

1. 將本資料夾全部檔案覆蓋 GitHub repository 根目錄。
2. 確認 `VERSION.txt` 為 `W444 FIX380`。
3. 本版 Apps Script schema 未變更，原 W441 FIX377 `Code.gs` /exec 可沿用。
4. GitHub Pages 完成部署後，iPhone / iPad 關閉員工端再重開；登入頁應顯示 `W444 FIX380`。
5. 若仍看到舊版，可重新整理／關閉 PWA 後再開；W444 service worker 會清除舊員工端快取。
