# W456 FIX392-R1 登入相容熱修正

- 修正 FIX392 在登入前新增 `clientHandshake`，遇到仍在線上的 W455/W451 Code.gs 時回覆「未知 action」而阻擋登入。
- 登入現在直接送 `login`；版本探測僅作診斷，失敗不阻擋已成功的登入。
- 不需要重新產生員工 PIN、SYNC_KEY 或重建員工資料。

# 王泰山畜牧場 GitHub 員工自助端

目前版本：W456 FIX392。登入前使用 clientHandshake 驗證 Apps Script 版本；裝置自訂 /exec 優先於 bundled config.js。
