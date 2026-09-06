# W432 FIX368R2 iOS 原生相機修正

- iPhone / iPad 不再以 WebRTC `<video>` 作為主要拍照方式。
- 點「開啟鏡頭拍照」時，直接以 `<input type="file" accept="image/*" capture="user">` 呼叫 iOS 系統自拍相機。
- 拍照後回員工端檢查照片非全黑，再加上牧場、員工、時間、GPS/地名浮水印。
- Android / desktop 保留 WebRTC，但 `getUserMedia()` 5.5 秒硬逾時、`video.play()` 1.8 秒硬逾時，避免永遠停在「正在啟動相機」。
- iOS 系統相機的實際鏡頭倍率由 Apple Camera UI 控制；若畫面有 0.5X / 0.7X 等選項，請使用最小倍率。網頁不能強制 iOS 原生相機的 zoom。
