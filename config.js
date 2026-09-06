// W433 FIX369 client｜public configuration only.
// `version` identifies the current W433 FIX369 bridge schema. UI / Service Worker / Apps Script must remain aligned.
// Never place SYNC_KEY or employee PIN here.
window.WTS_ATTENDANCE_CONFIG = {
  version: 'W433_FIX369_CLEAN',
  bridgeUrl: 'https://script.google.com/macros/s/AKfycbyBAEv9EApCg5FBNovwmpk2pjW8T-ssqnbSSwHogYKtL8b-svB0SGghk7qVXeBcleoT/exec',
  farmName: '王泰山畜牧場',
  requireGps: true,
  requireLineShare: true
};
