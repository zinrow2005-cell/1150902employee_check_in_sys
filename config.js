// W456 FIX392-R6-ORG1-H2 client｜public configuration only.
// `version` is the Apps Script bridge protocol identifier; R5 uses W456_FIX392_R5_CLEAN so the deployed punch-export fix can be verified.
// Never place SYNC_KEY or employee PIN here.
window.WTS_ATTENDANCE_CONFIG = {
  version: 'W456_FIX392_R5_CLEAN',
  bridgeUrl: 'https://script.google.com/macros/s/AKfycbyBAEv9EApCg5FBNovwmpk2pjW8T-ssqnbSSwHogYKtL8b-svB0SGghk7qVXeBcleoT/exec',
  farmName: '王泰山畜牧場',
  requireGps: true,
  requireLineShare: true
};
