// W432 FIX368R5 client｜public configuration only.
// `version` below identifies the W432 FIX368 bridge schema; it is intentionally not the R5 UI packaging label.
// Never place SYNC_KEY or employee PIN here.
window.WTS_ATTENDANCE_CONFIG = {
  version: 'W432_FIX368_CLEAN',
  bridgeUrl: 'https://script.google.com/macros/s/AKfycbyBAEv9EApCg5FBNovwmpk2pjW8T-ssqnbSSwHogYKtL8b-svB0SGghk7qVXeBcleoT/exec',
  farmName: '王泰山畜牧場',
  requireGps: true,
  requireLineShare: true
};
