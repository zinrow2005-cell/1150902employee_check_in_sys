# Apps Script Bridge

正式橋接協定：`W456_FIX392_R5_CLEAN`。

目前 GitHub 員工端為 **W456 FIX392-R5**。前端登入直接送 `login`；`health` 只做背景診斷。後端保留 `clientHandshake` 僅供舊客戶端相容。

## R5 必須重新部署
R5 修正 Attendance 工作表 Date / DateTime 欄位的標準化與 cursor 比較，避免新打卡因 Google Sheets 回傳 Date 物件而被漏掉。因此 R5 必須把本資料夾的 `Code.gs` 覆蓋到 Apps Script，並在「管理部署作業」中建立新版本。

正式部署完成後，主系統橋接診斷應顯示 `W456_FIX392_R5_CLEAN`。
