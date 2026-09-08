# Current deployment

GitHub 員工自助端：W456 FIX392-R1。Apps Script bridge 可沿用既有 W451/W455/W456 的正式部署；本熱修正將登入改為直接呼叫 `login`，不再以新增的 `clientHandshake` 阻擋登入。橋接測試改用既有 `health`，版本差異只做診斷、不阻擋登入。
