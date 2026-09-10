# CURRENT DEPLOYMENT

- Main system runtime / data schema: **W456 FIX392 / 392**
- Employee portal: **W456 FIX392-R6-ORG1-H2**
- Apps Script protocol: **W456_FIX392_R5_CLEAN**
- Punch return: manager shell performs a lightweight attendance-only pull every 30 seconds on all pages; the attendance page can still run the full sync manually.
- Camera: desktop/non-iOS rejects flat near-black virtual-camera frames and cycles actual physical `deviceId` cameras.
- Photo stamp: larger farm icon/name/time/employee/location layout on phone and desktop without the former full-width desktop stamp.
- Employee requests: preleave / leave / roster change / punch correction / overtime continue through the global request bridge.

If the screen does not show `W456 FIX392-R6-ORG1-H2`, the browser/PWA is still using an older GitHub build.
