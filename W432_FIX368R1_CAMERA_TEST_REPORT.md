# W432 FIX368R1 CAMERA VERIFIED｜相機驗證報告

## 找到的 W432 實際漏洞
W432 的流程是：取得 MediaStream → 等到第一幀 → 套用 `zoom.min` → 直接開放快門。
因此若某些手機瀏覽器在 `applyConstraints({zoom:min})` 後讓影像管線變黑，W432 不會再次偵測，使用者會看到黑畫面。

## FIX368R1 修正
1. GPS 完成後不再自動開相機；必須由使用者直接點「開啟鏡頭拍照」，保留 iOS/Android 的直接 user gesture。
2. 開鏡後驗證 `MediaStreamTrack.readyState === "live"`。
3. 驗證 `<video>` 的 `videoWidth/videoHeight` 與 `currentTime` 持續前進。
4. 將實際 video frame 畫到 96×72 診斷 canvas，確認畫素不是全 0 黑畫面。
5. 套用裝置 `zoom.min` 前驗證一次，套用後再驗證一次。
6. 若最小倍率造成黑畫面，自動停止該 stream，改用較簡單 camera constraints 並取消 Web zoom，優先取得真正影像。
7. 只有驗證成功才顯示綠色「● 鏡頭已開啟」、解析度、倍率與快門。
8. Web 即時相機連續失敗時，停止黑畫面並提供 `<input capture="user">` 手機系統相機 fallback。
9. 拍照當下仍再次確認 video frame；全黑照片不會被接受。

## 程式檢查
- app.js syntax：PASS
- sw.js syntax：PASS
- 相機直接觸控啟動：PASS
- zoom 前影像驗證：PASS
- zoom 後影像驗證：PASS
- track live 驗證：PASS
- video currentTime 前進驗證：PASS
- 實際像素全黑判斷：PASS
- 未驗證前禁止快門：PASS
- native camera fallback：PASS
- Service Worker cache bust：PASS

## 真實鏡頭測試限制
已嘗試用本環境 Chromium 搭配虛擬攝影機做真正 `getUserMedia()` 測試，但執行環境的強制 Chromium policy 為：
- `VideoCaptureAllowed: false`
- `URLBlocklist: ["*"]`

因此本環境本身禁止瀏覽器開啟實體或虛擬 camera，無法取代 iPhone/Android 真機驗收。R1 的做法是把真正 frame 驗證放到員工手機執行；手機畫面只有在鏡頭確實輸出非黑影像時才會顯示「● 鏡頭已開啟」。
