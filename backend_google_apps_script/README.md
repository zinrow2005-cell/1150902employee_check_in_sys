# Apps Script｜W417 FIX353 員工自助中心橋接

本版延續 W415 並新增：

- `EmployeePayslips`：只保存主系統已月結鎖定、且已移除銀行帳號／身分證等敏感欄位的員工薪資快照。
- `portalPayslip`：有效登入 Session＋再次輸入本人 6 位 PIN＋指定月份後，才回傳該員工該月份薪資單。
- `work_completion`：員工工作完成回報可進 `EmployeeRequests`，由單機主系統同步後寫回原工作任務完成流程，仍需主管最後確認。

## 更新方式

1. 以本包 `Code.gs` 完整取代 Apps Script 目前的 `Code.gs`。
2. 執行一次 `SETUP_ATTENDANCE_BRIDGE`。既有 `SHEET_ID`、`SYNC_KEY`、員工帳號設定會沿用；函式只補齊新工作表／欄位。
3. 「部署 → 管理部署作業 → 編輯 → 新版本 → 部署」。
4. 沿用既有正式 `/exec`；不要重新產生 SYNC_KEY。

請勿把 SYNC_KEY 放進 GitHub。
