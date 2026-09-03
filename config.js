// W410 FIX346｜正式橋接網址已預設。
// 此網址不是密碼；管理同步金鑰與員工 PIN 不會放在 GitHub。
// 若未來 Apps Script /exec 更換，可在員工打卡頁「橋接設定」直接覆蓋本機設定。
window.WTS_ATTENDANCE_CONFIG = {
  bridgeUrl: 'https://script.google.com/macros/s/AKfycbyOfvV3_HsZH7N585dcTo5ZlOkrCrzcDKcLAykx6gZp0T3QBFBYjkYLK4ULkKmSwngQ/exec',
  farmName: '王泰山畜牧場',
  requireGps: true,
  requireLineShare: true
};
