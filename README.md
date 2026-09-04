# 王泰山畜牧場｜GitHub 員工自助中心 W421 FIX357R2 CLEAN

目前唯一正式版本：`W421_FIX357R2_CLEAN`  
正式 Apps Script `/exec`：`https://script.google.com/macros/s/AKfycbyBAEv9EApCg5FBNovwmpk2pjW8T-ssqnbSSwHogYKtL8b-svB0SGghk7qVXeBcleoT/exec`

- `config.js` 是重新載入時的唯一正式橋接來源。
- 瀏覽器既有的版本化 bridge localStorage 不得覆蓋 `config.js`。
- Service Worker 啟用時會刪除其他舊 Cache Storage。
- `SYNC_KEY` 與員工 PIN 不得寫入 GitHub。
