# W406 FIX342｜GitHub 員工定位自拍打卡端

## 正式打卡網址

`https://zinrow2005-cell.github.io/1150902employee_check_in_sys/`

## 建議設定方式：從單機主系統直接帶入 /exec

1. 單機主系統 → 出勤管理中心 → GitHub 員工打卡橋接。
2. 貼上 Google Apps Script 正式 Web App `/exec` 網址。
3. 填同步金鑰、勾啟用並儲存。
4. 按「開啟並自動帶入 /exec」，或複製「一次設定連結」傳到員工手機。
5. GitHub 打卡頁會把合法 `/exec` 保存到該裝置，網址中的 `?bridge=` 會自動移除。

## 也可以在員工打卡頁直接設定

點「橋接設定」→ 貼 Apps Script `/exec` →「儲存橋接網址」。不需要修改 `config.js`。

## GitHub 上傳方式

本 ZIP 已整理成 **Repository 根目錄直接上傳版**。解壓縮後，把 `index.html`、`app.js`、`style.css`、`config.js`、`sw.js`、`manifest.webmanifest`、`.nojekyll` 與 `assets/` 直接覆蓋到 Repository `1150902employee_check_in_sys` 根目錄。

## 安全

- `SYNC_KEY` 只保存在單機主系統與 Apps Script Script Properties。
- 員工 6 位 PIN 由主系統同步到 Apps Script，不寫死在 GitHub。
- GitHub 端只需要 Apps Script `/exec` 公開端點。

## Apps Script 部署

- 執行身分：我
- 誰可以存取：任何人
- 網址必須使用正式 `/exec`，不可使用 `/dev`


## W406 FIX342 必做更新

若員工輸入員工編號與 PIN 後顯示「雲端橋接逾時」，請確認 Apps Script 已換成 W406 `Code.gs`，並到「部署 → 管理部署作業 → 編輯 → 新版本 → 部署」。原 `/exec` 與原 `SYNC_KEY` 可沿用。

此 GitHub 頁面是外部員工打卡入口。主系統保持單機模式時，不能直接把外網手機導向 `/hr-payroll/employee/` 的本機員工自助中心；完整自助功能若要給外部手機使用，應另外透過 Apps Script 橋接，不應直接公開單機主系統。
