# W432 FIX368R5 CLEAN R1｜整理後驗證報告

## 版本一致性
- index.html 顯示版本：W432 FIX368R5
- CSS / JS cache bust：432368r5
- Service Worker cache：fix368r5
- 活躍 HTML / JS / CSS / SW：沒有 R1～R4 舊版執行標記

## 正式執行檔
- index.html
- app.js
- style.css
- sw.js
- config.js
- manifest.webmanifest
- assets/wts-logo-original.png
- assets/wts-name-handwritten-white.png

## 檔案清理
- 舊 CAMERA_VERIFICATION_R1/R2：移除
- 舊 R1/R2 CAMERA TEST REPORT：移除
- R3/R4 視覺說明／測試：移除
- 未使用 assets/wts-name-white.png：移除
- backend_google_apps_script：不放入 GitHub 前端正式上傳包（後端本次無修改）

## 檢查
- app.js `node --check`：PASS
- manifest.webmanifest JSON：PASS
- GitHub package zip integrity：PASS
- 主系統 github_attendance patch zip integrity：PASS
