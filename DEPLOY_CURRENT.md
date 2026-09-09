# CURRENT DEPLOYMENT

- Main system runtime / data schema: **W456 FIX392 / 392**
- Employee portal: **W456 FIX392-R6-ORG1-H4**
- Apps Script protocol: **W456_FIX392_R5_CLEAN**
- Punch return: manager shell performs a lightweight attendance-only pull every 30 seconds on all pages; the attendance page can still run the full sync manually.
- Camera: desktop/non-iOS rejects flat near-black virtual-camera frames and cycles actual physical `deviceId` cameras.
- Photo stamp: larger farm icon/name/time/employee/location layout on phone and desktop without the former full-width desktop stamp.
- Employee requests: preleave / leave / roster change / punch correction / overtime continue through the global request bridge.

If the screen does not show `W456 FIX392-R6-ORG1-H4`, the browser/PWA is still using an older GitHub build.


## H3 必做
- H3 修正 Google Sheet 日期／時間被轉成 Date 物件後，下班打卡找不到早上上班紀錄的問題。
- **必須重新部署本包 canonical Code.gs 的新版本**；Apps Script protocol 名稱仍維持 `W456_FIX392_R5_CLEAN`，所以 action contract 不變。

- H4: leave request day/calendar-range quantities are auto-calculated from selected start/end dates (inclusive); hourly quantity remains automatic.
