# 王泰山畜牧場｜GitHub 員工自助中心 W433 FIX369 CLEAN

目前唯一正式版本：`W433_FIX369_CLEAN`  
正式 Apps Script `/exec`：`https://script.google.com/macros/s/AKfycbyBAEv9EApCg5FBNovwmpk2pjW8T-ssqnbSSwHogYKtL8b-svB0SGghk7qVXeBcleoT/exec`

- `config.js` 是重新載入時的唯一正式橋接來源。
- `SYNC_KEY` 與員工 PIN 不得寫入 GitHub。
- 員工編號英文不分大小寫；6 位 PIN 精確比對。
- 相機使用全螢幕取景並在瀏覽器支援時要求 1X。

## FIX369｜15 天登入維持
- 第一次或 Session 到期後，使用員工編號＋6 位 PIN、Face ID／Touch ID／指紋或手勢登入。
- 成功登入後，同一台裝置保存固定 15 天 Session；關閉 Safari／Chrome／PWA 再開啟不需重輸 PIN。
- 啟動時會呼叫 Apps Script `sessionCheck` 驗證 Session，只有伺服器仍判定有效才自動登入。
- 主動登出、PIN 變更、員工停用／移除、快速登入裝置被撤銷時，Session 立即失效。
- 薪資單仍需要再次輸入 6 位 PIN。

## 快速登入
- 正式 GitHub HTTPS 可使用 WebAuthn Face ID／Touch ID／指紋。
- 手勢登入為選用備援。
- 指紋／Face ID 生物特徵不會傳到牧場系統，伺服器只保存公開金鑰。

## 班表與申請
- 「我的班表」只顯示主系統正式發布內容。
- 員工可提出休假日期調整申請，主管核准後才修改正式班表。
- 員工可送出預排休假、請假、補卡、加班與工作完成回報。
- 工作項目表由批次月曆同步各部門重大工作事項。

## 出勤
- 正常一天：`上班 → 下班`。
- 特殊回場工作可建立第 2 段、第 3 段工作時段。
- 手機即時打卡與主系統快照會去重合併。
