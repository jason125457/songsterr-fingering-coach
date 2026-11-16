# Songsterr Fingering Coach：共用工作規則

適用於任何 coding agent（Claude Code、Codex、Antigravity 等）。本檔是唯一正本；`CLAUDE.md`、`GEMINI.md` 只引用本檔，再加各工具專屬事項。

在 Songsterr 譜頁上顯示左手指法建議的 Chrome 擴充功能（Manifest V3）＋獨立的指法推薦引擎。純 JavaScript、沒有建置步驟。
各階段的規格與現況在 `README.md`（很長，用搜尋找對應的 Phase 小節，不必整份讀）。

## 改完要跑

```bash
npm test                 # 全部驗收測試（引擎、UI、播放同步、行內覆蓋層）
npm run test:engine      # 只改 fingering_engine / normalizer 時
npm run build:preview    # 產生 tests/ui_preview.html，可離線看 Coach 面板
```

真實頁面上的行為（播放游標、音軌切換、捲動）測試蓋不到，需要使用者載入未封裝擴充功能實測；沒測到的部分要明講。

## 不能違反（專案的合規宣告）

- 不做任何樂譜下載或匯出（Guitar Pro、MIDI、PDF）。
- 不繞過付費限制，只讀頁面本來就給免費使用者的公開音符資料。
- 沒有後端、不呼叫任何付費或 LLM API、不用 OCR；指法全由演算法與人體工學規則算出。
- 這個 repo 是公開的，不放個人資訊或帳號資料。

## 地雷

- 沒有打包器：檔案是照 `manifest.json` 的 `content_scripts.js` 順序載入的全域腳本。新增檔案要加進清單，而且排在依賴它的檔案前面。
- 引擎（`src/fingering_engine.js`、`src/normalizer.js`）與 Songsterr 的 DOM 完全解耦，必須能在 Node 離線執行；碰 DOM 的程式只放 `src/ui/`、`src/songsterr/`、`content.js`。
- 弦的編號：第 1 弦是高音 E，第 6 弦是低音 E；調弦要動態解析（Drop D、降音調弦），不寫死標準調弦。
- 時間軸用有理數（分數）累加，不用浮點數，否則多聲部會對不齊。
- Songsterr 改版會讓播放游標的偵測失效：先用 `scripts/` 裡的調查腳本確認現況，再改 `playback_observer.js`。

## 慣例

- commit：英文 Conventional Commits 加 scope，例如 `fix(playback): ...`、`feat(overlay): ...`。
- 行為有變就遞增 `manifest.json` 的 `version`，並更新 README 對應的 Phase 小節。
