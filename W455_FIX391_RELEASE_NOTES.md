# W455 FIX391｜GitHub 員工端／Apps Script 登入握手修正

- 修正登入前 `health` POST 只回 JSON、沒有 `postMessage`，造成員工端固定等待到逾時。
- Apps Script `doPost health` 改用 `bridgeHtml_()`；`doGet health` 仍維持 JSON 供主系統診斷。
- 員工端與 Apps Script bridge 版本統一為 `W455_FIX391_CLEAN`。
- PWA cache 更新為 FIX391，iPhone／iPad 重新整理後不再沿用 W451 前端資源。
- 本版部署順序：先重新部署 Code.gs Web App 新版本，再覆蓋 GitHub Pages。
