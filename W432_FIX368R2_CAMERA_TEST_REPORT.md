# W432 FIX368R2 相機修正測試報告

## 問題
真機 iPhone 顯示全黑並停在「正在啟動相機…」。R1 仍依賴 iOS WebRTC `<video>`，因此無法保證 Safari/PWA 真機可取得影像。

## R2 修正
- iPhone/iPad 改用 iOS 原生相機入口：`<input type="file" accept="image/*" capture="user">`。
- 第一次拍照入口使用 `<label for="nativeCameraInput">` 直接由使用者觸控觸發，不經 WebRTC 黑畫面。
- Android/desktop WebRTC：`getUserMedia()` 5.5 秒硬逾時，`video.play()` 1.8 秒硬逾時。
- 系統相機回傳照片仍檢查有效尺寸與全黑畫面，再建立照片預覽。

## 實際自動化驗證
以 Chromium + iPhone Safari User-Agent + 430×932 mobile viewport 進行 UI 路徑測試：
1. iOS 原生相機按鈕可直接觸發 file chooser。 PASS
2. `capture=user`。 PASS
3. 不加入 `camera-fullscreen`。 PASS
4. `cameraLoading` 不顯示。 PASS
5. 模擬相機回傳 900×1200 非黑照片後，照片預覽開啟。 PASS
6. canvas 尺寸 900×1200。 PASS

## 限制
此執行環境無 Apple 相機硬體，因此不能替使用者的實體 iPhone 按下快門；但 R2 不再要求 iPhone 執行 WebRTC 相機，而是交由 iOS 系統相機處理。iOS 原生相機的實際 zoom 無法由網頁強制設定；若相機 UI 提供 0.5X／0.7X，請選最小倍率。
