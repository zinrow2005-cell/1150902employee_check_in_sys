# 王泰山畜牧場｜員工定位自拍打卡 W410 FIX346

## 正式員工入口
https://zinrow2005-cell.github.io/1150902employee_check_in_sys/

## 這個資料夾怎麼上傳 GitHub
將本資料夾內的所有檔案直接覆蓋到 Repository `1150902employee_check_in_sys` 的根目錄。
不要再多包一層資料夾。

必要檔案：
- `index.html`
- `app.js`
- `style.css`
- `config.js`
- `sw.js`
- `manifest.webmanifest`
- `.nojekyll`
- `assets/`

## Apps Script 橋接
`config.js` 已預設目前正式 Web App `/exec`：
https://script.google.com/macros/s/AKfycbyOfvV3_HsZH7N585dcTo5ZlOkrCrzcDKcLAykx6gZp0T3QBFBYjkYLK4ULkKmSwngQ/exec

GitHub 端只保存公開的 `/exec` 網址；**不要把 SYNC_KEY 放進 GitHub**。

## W410 打卡流程
登入 → GPS 定位 → 自拍 → 拍照確認 → 分享照片到 LINE → 確認已傳到指定 LINE 群組 → 回傳時間/GPS/地址等文字資料到 Apps Script。

照片本體不寫入 Apps Script、Google Sheet 或單機主系統。

## 防重複
- LINE 分享按鈕 15 秒防連點
- 同員工任意打卡 30 秒內不新增第二筆
- 同員工相同類型打卡 3 分鐘內不新增第二筆
- 相同 `recordId` 重送永遠只算一筆
