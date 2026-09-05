# Apps Script｜W432 FIX368 CLEAN

正式員工自助中心橋接版本：`W432_FIX368_CLEAN`

1. 將 `Code.gs` 完整貼到同一個 Apps Script 專案。
2. 以「管理部署 → 編輯 → 新版本」更新目前 Web App。
3. 正式 `/exec`：`https://script.google.com/macros/s/AKfycbyBAEv9EApCg5FBNovwmpk2pjW8T-ssqnbSSwHogYKtL8b-svB0SGghk7qVXeBcleoT/exec`
4. `SYNC_KEY` 只放在 Apps Script Properties 與單機主系統，不放 GitHub。
5. GitHub 端「測試橋接」應回傳版本 `W432_FIX368_CLEAN`。

## FIX368｜15 天登入 Session
- 員工以「員工編號＋6 位 PIN」成功登入後，Apps Script 建立固定 15 天有效的隨機 Session Token。
- 正式 Session 存於 Script Properties；CacheService 只做短效加速，因此不受 CacheService 短效期限限制。
- 每次使用 Session 都重新確認員工仍存在且為啟用狀態；員工停用後 Session 立即失效。
- 主動登出會撤銷 Apps Script Session。
- PIN 不會寫入 GitHub 或手機 localStorage；手機只保存隨機 Session Token、員工公開資料與到期時間。

## 既有正式行為
- 員工編號英文不分大小寫。
- Attendance 支援正常一段及特殊多段上下班，並強制正確事件順序。
- `portalData` 會把今天 Attendance 即時打卡與主系統 EmployeePortal 快照合併。
- EmployeeRequests 接受休假日期調整、預排休假、請假、補卡、加班、工作完成回報。
- 長期育嬰留職停薪要求保險處理方式。
- 員工申請在主系統同步、審核後，狀態會回寫 EmployeeRequests 供手機查詢。
- 主系統正式發布班表後，EmployeePortal 快照中的工作月曆會更新至「我的班表」。
- `portalData` 快照可包含 `departmentWorkPlan`，供員工端查看批次月曆各部門重大工作事項。
