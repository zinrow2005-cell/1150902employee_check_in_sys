# Apps Script｜W433 FIX369 CLEAN

正式員工自助中心橋接版本：`W433_FIX369_CLEAN`

1. 將 `Code.gs` 完整貼到同一個 Apps Script 專案。
2. 以「管理部署 → 編輯 → 新版本」更新目前 Web App。
3. 正式 `/exec`：`https://script.google.com/macros/s/AKfycbyBAEv9EApCg5FBNovwmpk2pjW8T-ssqnbSSwHogYKtL8b-svB0SGghk7qVXeBcleoT/exec`
4. `SYNC_KEY` 只放在 Apps Script Properties 與單機主系統，不放 GitHub。
5. GitHub 端「測試橋接」應回傳版本 `W433_FIX369_CLEAN`。

## FIX369 行為
- 員工編號英文不分大小寫。
- Attendance 支援正常一段及特殊多段上下班，並強制正確事件順序。
- `portalData` 會把今天 Attendance 即時打卡與主系統 EmployeePortal 快照合併。
- EmployeeRequests 接受預排休假、請假、補卡、加班、工作完成回報。
- 長期育嬰留職停薪要求保險處理方式。
- 員工申請在主系統同步、審核後，狀態會回寫 EmployeeRequests 供手機查詢。
- 主系統正式發布班表後，EmployeePortal 快照中的工作月曆會更新至「我的班表」。

- `portalData` 快照可包含 `departmentWorkPlan`，供員工端查看批次月曆各部門重大工作事項；過大時優先保留近期與未來項目。

- FIX369：新增 `roster_change` 休假日期調整申請；只保存申請，正式班表由主系統核准後回傳。

## FIX369｜15 天登入 Session
- `EmployeeSessions` 保存 Session Token 的 SHA-256 雜湊與固定 15 天到期日。
- 員工端每次重新開啟會先呼叫 `sessionCheck`，伺服器驗證通過才自動登入。
- PIN 變更、員工停用／移除、主動登出或快速登入裝置被撤銷時會撤銷既有 Session。
- 正式薪資單仍需再次輸入 6 位 PIN。
