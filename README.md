# 王泰山畜牧場｜GitHub 員工自助端 W456 FIX392-R6-ORG1-H4

本資料夾是 GitHub Pages 正式員工端。

- 登入流程：`login → portalData`；`health` 只做背景診斷。
- 手機若保存舊 Apps Script `/exec`，登入遇到「未知 ACTION」或逾時會自動改試 GitHub `config.js` 的正式 `/exec`；成功後修復此裝置保存網址。
- 桌機／非 iOS 相機會依序嘗試瀏覽器預設鏡頭、facingMode 與實體 `deviceId`；偵測黑畫面會自動換下一顆。
- 「工作月曆／我的班表」會同時顯示正式個人班表與主系統同步的批次重大工作。
- Apps Script bridge protocol：`W456_FIX392_R5_CLEAN`。
- 上傳 GitHub 時，請將 CLEAN 上傳包解壓後的內容直接覆蓋 repository 根目錄。

若畫面右上角不是 **W456 FIX392-R6-ORG1-H4**，代表瀏覽器／PWA 仍在使用舊 GitHub build。


## H4｜請假數量自動計算
- 「日」與「連續曆日」：選擇開始／結束日期後，自動以含起訖日方式計算天數，數量欄改為唯讀。
- 「小時」：維持依開始／結束時間自動計算小時，數量欄同步顯示唯讀結果。
- 「半日」：仍以半日次數輸入，不強制改成日期區間。
