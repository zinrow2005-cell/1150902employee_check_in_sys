// W417 FIX353｜正式 Apps Script /exec 已內建。
// 此檔只保存公開 Web App /exec 與一般介面設定；管理同步密鑰與員工 PIN 不寫入此檔。
// W417 員工自助中心使用新的本機橋接設定版本，更新後不會再沿用舊版本儲存的 /exec。
window.WTS_ATTENDANCE_CONFIG = {
  bridgeUrl: 'https://script.google.com/macros/s/AKfycbweCm0CSnnzpKHi9CA8KecTmKbl40NKLJsyn48w0A5RCrKFlksdYIQK2k4LKm0naYoBbg/exec',
  farmName: '王泰山畜牧場',
  requireGps: true,
  requireLineShare: true
};
