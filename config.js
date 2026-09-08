// W456 FIX392-R4 client｜public configuration only.
// `version` is the Apps Script bridge protocol identifier; R4 keeps W456_FIX392_CLEAN for compatibility.
// Never place SYNC_KEY or employee PIN here.
window.WTS_ATTENDANCE_CONFIG = {
  version: 'W456_FIX392_CLEAN',
  bridgeUrl: 'https://script.google.com/macros/s/AKfycbyBAEv9EApCg5FBNovwmpk2pjW8T-ssqnbSSwHogYKtL8b-svB0SGghk7qVXeBcleoT/exec',
  farmName: '王泰山畜牧場',
  requireGps: true,
  requireLineShare: true
};
