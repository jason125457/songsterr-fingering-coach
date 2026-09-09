# Songsterr Fingering Coach (Phase 1 Prototype)

這是一個針對 [Songsterr](https://www.songsterr.com/) 樂譜頁面的 Chrome Extension Manifest V3 技術可行性驗證（PoC）專案。

本階段（第一階段）專注於**資料可行性驗證，不實作任何 UI**。透過直接分析 Songsterr 頁面已載入的結構化資料與官方 CDN 網路回應，精確解析歌曲中前 5 小節的音符、拍點、吉他弦號（string）與品格（fret），並以清晰格式輸出至瀏覽器開發者工具的 Console。

---

## 遵守規範宣告

- ❌ **無樂譜下載功能**：本專案不提供、不實作任何匯出或下載 Guitar Pro / MIDI / PDF 樂譜檔案的功能。
- ❌ **不繞過付費限制**：僅讀取 Songsterr 免費公開樂譜原本即已呈現給使用者的公開音符資料。
- ❌ **無後端伺服器**：純前端 Chrome Extension，所有邏輯皆在使用者本機瀏覽器內運作。
- ❌ **無付費 API**：不依賴任何付費服務或第三方收費轉譯 API。
- ❌ **無 OCR**：不使用畫面截圖或光學文字識別，100% 採用結構化樂理資料來源。

---

## 1. 資料來源分析 (Data Source Architecture)

透過逆向工程分析 Songsterr 官方前端程式碼（`appClient`, `StoreWorker`, `common`, `vendor`），Songsterr 樂譜的載入機制由兩個核心部分組成：

### (1) 頁面初始狀態：`<script id="state" type="application/json">`
當使用者開啟任何 Songsterr 歌曲網頁（如 `https://www.songsterr.com/a/wsa/metallica-enter-sandman-tab-s19`）時，伺服器端渲染（SSR）會在 HTML 底部直接注入一個 ID 為 `state` 的 JSON script 標籤。

Content Script 可直接從 `document.getElementById('state')` 讀取並獲得以下關鍵結構：
```json
{
  "meta": {
    "current": {
      "songId": 19,
      "revisionId": 8903139,
      "image": "v0-3-2-aYRgzzbbfZRUB-rf",
      "artist": "Metallica",
      "title": "Enter Sandman",
      "tracks": [
        { "partId": 0, "name": "James Hetfield | Lead Vocals", "instrument": "Viola", "tuning": [69, 62, 55, 48] },
        { "partId": 1, "name": "James Hetfield | Line 6 Variax 700 | Acoustic Guitar", "tuning": [64, 59, 55, 50, 45, 40] },
        { "partId": 2, "name": "Kirk Hammett | Gibson Les Paul Deluxe | Lead Guitar", "tuning": [64, 59, 55, 50, 45, 40] },
        { "partId": 3, "name": "James Hetfield | Clean Guitar", "tuning": [64, 59, 55, 50, 45, 40] }
      ]
    }
  },
  "routeContent": {
    "params": {
      "partId": 2
    }
  }
}
```

### (2) 樂軌音符結構化資料：CloudFront CDN
Songsterr 前端播放器會根據歌曲的 `songId`、版本 `revisionId`、版本標記 `image`，以及樂軌 `partId`，向其官方 CloudFront CDN 節點要求該樂軌的完整樂理與音符 JSON：

- **官方節點清單**：
  - 主要節點：`dqsljvtekg760.cloudfront.net`, `d34shlm8p2ums2.cloudfront.net`, `d3cqchs6g3b5ew.cloudfront.net`
  - Stage 節點：`d3d3l6a6rcgkaf.cloudfront.net`
  - 舊版/備援節點：`d3rrfvx08uyjp1.cloudfront.net`
- **URL 構造演算法**（出自 Songsterr 前端核心函式 `qS`）：
  ```javascript
  if (image && image.endsWith('-stage')) {
    url = `https://d3d3l6a6rcgkaf.cloudfront.net/${songId}/${revisionId}/${image}/${partId}.json`;
  } else if (image) {
    url = `https://dqsljvtekg760.cloudfront.net/${songId}/${revisionId}/${image}/${partId}.json`;
  } else {
    url = `https://d3rrfvx08uyjp1.cloudfront.net/part/${revisionId}/${partId}`;
  }
  ```

該 JSON 直接包含了該樂軌完整的 `measures`（小節）、`voices`（聲部）、`beats`（拍點）、`notes`（音符）等原生結構。

---

## 2. 解析方式 (Parsing Methodology)

自 CDN 取得樂軌 JSON 後，樂理階層為：
`Measures[]` ➔ `Voices[]` ➔ `Beats[]` ➔ `Notes[]`

### (1) 小節與拍點定位
- **小節序號 (measureNumber)**：陣列索引 `mIdx + 1`（從第 1 小節開始）。
- **拍號 (timeSignature)**：讀取 `measure.signature`，例如 `[4, 4]` 轉換為 `"4/4"`，`[2, 4]` 轉換為 `"2/4"`。
- **拍點序號 (beatNumber)**：陣列索引 `bIdx + 1`。
- **節奏音長 (timing / duration)**：讀取 `beat.duration`，例如 `[1, 4]` 代表四分音符（"1/4"），`[1, 8]` 代表八分音符（"1/8"）。

### (2) 弦號與品格 (string + fret) 對應
在 Songsterr 的資料結構中：
- **`stringIndex`（0-based 索引）**：
  - `0`：第 1 弦（最高音弦，標準調音為 High E4）
  - `1`：第 2 弦（B3）
  - `2`：第 3 弦（G3）
  - `3`：第 4 弦（D3）
  - `4`：第 5 弦（A2）
  - `5`：第 6 弦（最低音弦，標準調音為 Low E2）
- **`stringNumber`（1-based 吉他手習慣標記）**：`stringIndex + 1`（第 1 弦 ~ 第 6 弦）。
- **`fret`（品格）**：整數數字。`0` 代表空弦音，`1` ~ `24` 代表吉他指板上的品位。
- **絕對音高換算 (Pitch)**：
  - 讀取樂軌的 `tuning`（MIDI 音高陣列，如 `[64, 59, 55, 50, 45, 40]`）。
  - 單音實際 MIDI 音高 = `tuning[stringIndex] + fret`。
  - 轉換為音名與八度（例如 MIDI 64 + 0 = `E4`；MIDI 40 + 7 = `B2`）。
- **休止符 (isRest)**：當 `beat.rest === true` 或 `note.rest === true` 時標記。
- **連音符 (isTie)**：當 `note.tie === true` 時標記延音。

---

## 3. 3 首經典樂譜驗證結果 (Verification Results)

本專案執行自動化測試腳本 `test_runner.js`，針對 3 首不同風格與調音的 Songsterr 樂譜進行驗證：

### 驗證 1：Metallica - Enter Sandman (Song ID: 19)
- **樂軌**：James Hetfield | Clean Guitar (Part ID: 3)
- **調音**：標準調音 E Standard `[E4, B3, G3, D3, A2, E2]`
- **驗證成果**：成功取得前 5 小節完整音符。第 2 小節精確比對出全球吉他手熟知的前奏 Riff（第 6 弦空弦 0品 ➔ 第 5 弦 7品 ➔ 第 4 弦 5品 ➔ 第 6 弦 6品 ➔ 第 6 弦 5品 ➔ 第 5 弦 7品 ➔ 第 6 弦 0品）：
  - Beat 1: `string: 5 (Low E), fret: 0`
  - Beat 2: `string: 4 (A), fret: 7`
  - Beat 3: `string: 3 (D), fret: 5`
  - Beat 4: `string: 5 (Low E), fret: 6`
  - Beat 5: `string: 5 (Low E), fret: 5`
  - Beat 6: `string: 4 (A), fret: 7`
  - Beat 7: `string: 5 (Low E), fret: 0`

### 驗證 2：Deep Purple - Smoke On The Water (Song ID: 329)
- **樂軌**：Ritchie Blackmore | Fender Stratocaster | Rhythm Guitar (Part ID: 2)
- **調音**：標準調音 E Standard
- **驗證成果**：成功取得前 5 小節共 38 個音符，精確比對出傳奇雙音（Double-stops）Riff：
  - Measure 1 Beat 1: `string: 3 (D) fret: 5` & `string: 4 (A) fret: 5` (四度雙音 G & D)
  - Measure 1 Beat 2: `string: 2 (G) fret: 3` & `string: 3 (D) fret: 3` (四度雙音 Bb & F)
  - Measure 1 Beat 3: `string: 2 (G) fret: 5` & `string: 3 (D) fret: 5` (四度雙音 C & G)
  - Measure 2 Beat 3: `string: 2 (G) fret: 6` & `string: 3 (D) fret: 6` (四度雙音 Db & Ab)

### 驗證 3：Nirvana - Come As You Are (Song ID: 14)
- **樂軌**：Kurt Cobain | Mosrite Gospel | Rhythm Guitar (Part ID: 5)
- **調音**：降全音 D Standard `[D4, A3, F3, C3, G2, D2]`（MIDI `[62, 57, 53, 48, 43, 38]`）
- **驗證成果**：成功取得前 5 小節完整音符，成功適應非標準調音，精確比對前奏主 Riff：
  - Measure 1 (拍號 2/4):
    - Beat 2: `string: 5 (Low D), fret: 0`
    - Beat 3: `string: 5 (Low D), fret: 0`
    - Beat 4: `string: 5 (Low D), fret: 1`
  - Measure 2 (拍號 4/4):
    - Beat 1: `string: 5 (Low D), fret: 2`
    - Beat 2: `string: 4 (G), fret: 0`
    - Beat 3: `string: 5 (Low D), fret: 2`
    - Beat 4: `string: 4 (G), fret: 0`
    - Beat 5: `string: 5 (Low D), fret: 2`
    - Beat 6: `string: 5 (Low D), fret: 2`
    - Beat 7: `string: 5 (Low D), fret: 1`

---

## 4. 輸出 JSON 範例 (Console Output Format)

在瀏覽器中開啟任一樂譜，擴充功能會自動印出如下結構之 JSON：

```json
{
  "song": {
    "songId": 14,
    "revisionId": 8611143,
    "title": "Come As You Are",
    "artist": "Nirvana"
  },
  "track": {
    "partId": 5,
    "name": "Kurt Cobain | Mosrite Gospel | Rhythm Guitar",
    "instrument": "Electric Guitar (clean)",
    "tuningMidi": [62, 57, 53, 48, 43, 38],
    "tuningNames": ["D4", "A3", "F3", "C3", "G2", "D2"],
    "totalMeasures": 112
  },
  "first5Measures": [
    {
      "measureNumber": 1,
      "timeSignature": "2/4",
      "marker": "Intro",
      "notesCount": 3,
      "notes": [
        {
          "measureNumber": 1,
          "beatNumber": 1,
          "timing": "1/8",
          "isRest": true
        },
        {
          "measureNumber": 1,
          "beatNumber": 2,
          "timing": "1/8",
          "stringIndex": 5,
          "stringNumber": 6,
          "openString": "D2",
          "fret": 0,
          "pitch": "D2",
          "isTie": false,
          "isRest": false
        },
        {
          "measureNumber": 1,
          "beatNumber": 3,
          "timing": "1/8",
          "stringIndex": 5,
          "stringNumber": 6,
          "openString": "D2",
          "fret": 0,
          "pitch": "D2",
          "isTie": false,
          "isRest": false
        },
        {
          "measureNumber": 1,
          "beatNumber": 4,
          "timing": "1/8",
          "stringIndex": 5,
          "stringNumber": 6,
          "openString": "D2",
          "fret": 1,
          "pitch": "D#2",
          "isTie": false,
          "isRest": false
        }
      ]
    },
    {
      "measureNumber": 2,
      "timeSignature": "4/4",
      "marker": null,
      "notesCount": 7,
      "notes": [
        {
          "measureNumber": 2,
          "beatNumber": 1,
          "timing": "1/4",
          "stringIndex": 5,
          "stringNumber": 6,
          "openString": "D2",
          "fret": 2,
          "pitch": "E2",
          "isTie": false,
          "isRest": false
        },
        {
          "measureNumber": 2,
          "beatNumber": 2,
          "timing": "1/8",
          "stringIndex": 4,
          "stringNumber": 5,
          "openString": "G2",
          "fret": 0,
          "pitch": "G2",
          "isTie": false,
          "isRest": false
        },
        {
          "measureNumber": 2,
          "beatNumber": 3,
          "timing": "1/8",
          "stringIndex": 5,
          "stringNumber": 6,
          "openString": "D2",
          "fret": 2,
          "pitch": "E2",
          "isTie": false,
          "isRest": false
        }
      ]
    }
  ]
}
```

同時，Console 會另外呼叫 `console.table` 提供視覺化表格：
```
┌─────────┬────────┬────────┬───────────────────┬──────┬───────┬──────────┬─────┐
│ Measure │ Beat   │ Timing │ String (0=High E) │ Fret │ Pitch │ Open Str │ Tie │
├─────────┼────────┼────────┼───────────────────┼──────┼───────┼──────────┼─────┤
│ 1       │ 2      │ 1/8    │ 5                 │ 0    │ D2    │ D2       │     │
│ 1       │ 3      │ 1/8    │ 5                 │ 0    │ D2    │ D2       │     │
│ 1       │ 4      │ 1/8    │ 5                 │ 1    │ D#2   │ D2       │     │
│ 2       │ 1      │ 1/4    │ 5                 │ 2    │ E2    │ D2       │     │
│ 2       │ 2      │ 1/8    │ 4                 │ 0    │ G2    │ G2       │     │
│ 2       │ 3      │ 1/8    │ 5                 │ 2    │ E2    │ D2       │     │
└─────────┴────────┴────────┴───────────────────┴──────┴───────┴──────────┴─────┘
```

---

## 5. 安裝與測試說明 (How to Load & Test)

### 載入 Chrome 擴充功能
1. 開啟 Chrome 瀏覽器，進入擴充功能管理頁面：`chrome://extensions/`。
2. 開啟右上角 **「開發人員模式」 (Developer mode)**。
3. 點擊左上角 **「載入未封裝項目」 (Load unpacked)**。
4. 選擇本專案資料夾：`G:\Google Antigravity\guitar`。
5. 擴充功能即載入完成。

### 測試步驟
1. 在瀏覽器中開啟任一 Songsterr 樂譜頁面，例如：
   - `https://www.songsterr.com/a/wsa/metallica-enter-sandman-tab-s19`
   - `https://www.songsterr.com/a/wsa/deep-purple-smoke-on-the-water-tab-s274`
   - `https://www.songsterr.com/a/wsa/nirvana-come-as-you-are-tab-s14`
2. 按 `F12` 或點擊右鍵「檢查」開啟 Chrome DevTools。
3. 切換至 **Console** 標籤頁。
4. 即可看見由 `[Songsterr Fingering Coach]` 輸出的彩色醒目標題、完整 JSON 物件與 Notes 摘要表格。

### 開發者除錯命令（在 Console 內輸入）
擴充功能已在全域註冊 `window.__SONGSTERR_FINGERING_COACH__`，可直接執行：
- `window.__SONGSTERR_FINGERING_COACH__.extract()`：手動重新提取當前頁面資料。
- `window.__SONGSTERR_FINGERING_COACH__.extractTrack(partId)`：提取指定樂軌（例如切換至木吉他或貝斯）。
- `window.__SONGSTERR_FINGERING_COACH__.getLastExtracted()`：取得最近一次解析的資料物件。
- `window.__SONGSTERR_FINGERING_COACH__.getRawState()`：檢視頁面原始 State。

---

## 6. 目前限制與技術邊界 (Current Limitations)

1. **僅限樂譜播放頁面**：
   - 僅在路徑包含 `/a/wsa/` 且含有樂譜資料的頁面生效；搜尋頁或歌手頁無樂譜資料可提取。
2. **前 5 小節取樣**：
   - 第一階段驗證依規格僅擷取前 5 小節；部分樂軌前奏長達十幾小節為休止符（如 Enter Sandman 的主音吉他在第 13 小節才進場），此時前 5 小節均為 `isRest: true`。
3. **拍子記號變更**：
   - 目前以每小節的 `signature` 為基準，若該小節省略則繼承前小節或預設 `4/4`。
4. **多音部 (Polyphony / Multi-voice)**：
   - 某些古典吉他譜具有 Voice 0 與 Voice 1（高音部旋律與低音部伴奏同時進行），目前依 Voice 依序攤平收集。

---

## 7. 下一步規劃 (Roadmap for Phase 2)

- **UI 呈現**：在 Songsterr 樂譜畫面右側或下方嵌入浮動側邊欄（Fingering Coach Panel）或指板覆蓋圖。
- **指法推薦演算法 (Fingering Engine)**：
  - 根據前後音符的品格與弦跳躍距離，計算人體工學最佳手型（Left-hand Finger Assignment: Index 1, Middle 2, Ring 3, Pinky 4）。
  - 自動偵測橫按（Barre chord）與跨把位移動（Position shifts）。
- **即時播放游標同步**：
  - 監聽 Songsterr 音訊播放進度，即時高亮顯示當前小節與拍點的最佳手指擺放提示。
