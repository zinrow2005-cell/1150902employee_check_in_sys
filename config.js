// W435 FIX371 client｜public configuration only.
// `version` identifies the current W435 FIX371 bridge schema. UI / Service Worker / Apps Script must remain aligned.
// Never place SYNC_KEY or employee PIN here.
window.WTS_ATTENDANCE_CONFIG = {
  version: 'W435_FIX371_CLEAN',
  bridgeUrl: 'https://script.google.com/macros/s/AKfycbyBAEv9EApCg5FBNovwmpk2pjW8T-ssqnbSSwHogYKtL8b-svB0SGghk7qVXeBcleoT/exec',
  farmName: '王泰山畜牧場',
  requireGps: true,
  requireLineShare: true
};
