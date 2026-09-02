# GitHub Pages 員工定位自拍打卡端｜正式部署說明

## 對應版本
- GitHub 打卡端：W401 FIX337
- 單機主系統：W401 FIX337
- Apps Script 橋接端：W402 FIX338

## GitHub 只需要上傳本資料夾內容
必須包含：
- index.html
- app.js
- style.css
- config.js
- sw.js
- manifest.webmanifest
- .nojekyll

## 只需要修改 config.js
找到：
`bridgeUrl: 'PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE'`

改成你的 Apps Script 正式 `/exec` 網址，例如：
`bridgeUrl: 'https://script.google.com/macros/s/你的部署ID/exec'`

注意：
- 不可填 `/dev`
- 不要把 SYNC_KEY 放進 config.js
- 不要把員工 PIN 寫死在 GitHub

## 員工登入
員工使用主系統建立的：
- 員工編號
- 6 位 PIN

帳號由單機主系統同步到 Apps Script，不需要手動維護 GitHub 名單。

## 打卡流程
登入 → GPS 定位／地名 → 上班或下班 → 即時自拍 → 分享到 LINE 群組 → 回到頁面完成打卡。

## Apps Script 權限
Web App 必須設定：
- 執行身分：我
- 誰可以存取：任何人

可先用未登入 Google 的無痕視窗開啟 `/exec` 測試；正常會看到 health JSON。
