// W421 FIX357｜新的正式 Apps Script /exec 已內建。
// 此檔只保存公開 Web App /exec 與一般介面設定；管理同步密鑰與員工 PIN 不寫入此檔。
// W421 主系統會將上一個正式 /exec 視為舊部署並自動遷移；SYNC_KEY 仍只保存在單機主系統。
window.WTS_ATTENDANCE_CONFIG = {
  bridgeUrl: 'https://script.google.com/macros/s/AKfycbyBAEv9EApCg5FBNovwmpk2pjW8T-ssqnbSSwHogYKtL8b-svB0SGghk7qVXeBcleoT/exec',
  farmName: '王泰山畜牧場',
  requireGps: true,
  requireLineShare: true
};
