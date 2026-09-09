# Songsterr Fingering Coach

🎸 **Songsterr Fingering Coach** 是一個針對 [Songsterr](https://www.songsterr.com/) 樂譜的 Chrome Extension (Manifest V3) 與**獨立左手吉他指法推薦引擎（Fingering Engine）**。

本專案現已完成 **Phase 1（資料讀取與逆向驗證）**、**Phase 2（解耦指法推薦演算法引擎）**、**Phase 2.6（人性化指法演算法優化）** 與 **Phase 3.0（完整樂曲串接與 Fingering Coach UI 基礎建設）**。

---

## 📌 專案里程碑與開發進度 (Milestones & Progress)

| 階段 (Phase) | 核心目標 (Milestone Objective) | 交付成果 (Key Deliverables) | 當前狀態 (Status) |
| :--- | :--- | :--- | :---: |
| **Phase 1: Songsterr Reader** | 逆向解析 Songsterr 樂譜公開音符資料與 CDN 封包 | `content.js`、資料正規化解析、無後端無付費 API 驗證 | **已完成 (Completed)** ✅ |
| **Phase 2: Decoupled Engine** | 架構解耦、人體工學狀態空間、Viterbi DP 全域最佳指法搜尋 | `src/fingering_engine.js`、`src/normalizer.js`、離線單元測試套件 | **已完成 (Completed)** ✅ |
| **Phase 2.5: Real-Song Validation** | 真實長曲目驗證（以《傍晚去太子灣嗎》前 20 小節 120 拍為基準） | 120 拍完整分析、換把/同指跨弦/橫按/拉伸標註、成本排序 | **已完成 (Completed)** ✅ |
| **Phase 2.6: Human Optimization** | 消除不自然提早換把、重複 Riff 指法一致性、開放手型聚合、可解釋成本 | 樂句邊界獎勵、重複動機記憶、開放和弦手型、成本透明化輸出 | **已完成 (Completed)** ✅ |
| **Phase 3.0: Full Pipeline & UI** | 完整樂曲串接、Session 快取、極速非阻塞運算、浮動指型 Coach 面板、Mini-Barre 向量圖 | `src/ui/coach_panel.js`、`shape_diagram.js`、`coach.css`、M1-M20 瀏覽 | **已完成 (Completed)** ✅ |
| **Phase 3.1: Playback Sync** | 與 Songsterr 播放器音訊與遊標即時跟隨同步 | Audio cursor observer、拍點自動推進、小節切換跟隨 | **規劃中 (Next Up)** 🎯 |
| **Phase 4: Advanced Shapes** | CAGED 五大和弦音階型態比對、自訂偏好指型庫 | 爵士/藍調/金屬自訂手型偏好、進階調弦指板映射 | **待評估 (Backlog)** 📋 |


---

## 遵守規範宣告

- ❌ **無樂譜下載功能**：本專案不提供、不實作任何匯出或下載 Guitar Pro / MIDI / PDF 樂譜檔案的功能。
- ❌ **不繞過付費限制**：僅讀取 Songsterr 免費公開樂譜原本即已呈現給使用者的公開音符資料。
- ❌ **無後端伺服器**：純前端與獨立模組，所有運算皆在使用者本機或 Node.js 離線環境完成。
- ❌ **無付費 API / 無 LLM API**：100% 採用純演算法與吉他人體工學規則，無外部 API 成本與延遲。
- ❌ **無 OCR**：不使用畫面截圖或光學文字識別，100% 採用結構化樂理資料來源。
- ❌ **無任何 UI / Songsterr 畫面覆蓋（Phase 2 嚴格限制）**：專注於底層解耦與指法邏輯，不干擾頁面 DOM。

---

## 系統架構解耦 (Decoupled Architecture)

本專案在 Phase 2 完成核心架構解耦，各層單向依賴，未來可直接抽換資料來源（如 Guitar Pro .gp5/.gpx、MusicXML、Standard MIDI）：

```
┌──────────────────────────────────────┐
│  Data Sources (例如 Songsterr CDN)    │
│  - content.js / test_runner.js       │
└──────────────────┬───────────────────┘
                   │ Raw JSON (Full Track)
                   ▼
┌──────────────────────────────────────┐
│  Tab Normalizer (src/normalizer.js)  │
│  - 拍點聚合 (Same Beat Grouping)      │
│  - 弦、品、休止符、連音標準化          │
└──────────────────┬───────────────────┘
                   │ Full Normalized Track
                   ▼
┌──────────────────────────────────────┐
│ Fingering Engine (fingering_engine)  │
│  - 人體工學狀態空間 (Ergonomics)      │
│  - 全域 Viterbi / DP 最佳路徑搜尋     │
│  - 樂句邊界 / 重複動機 / 開放手型     │
└──────────────────┬───────────────────┘
                   │ Fingering Analysis (Cached)
                   ▼
┌──────────────────────────────────────┐
│ UI Layer (src/ui/)                   │
│  - CoachPanel (src/ui/coach_panel.js)│
│  - ShapeDiagram (shape_diagram.js)   │
│  - Scoped Dark Theme (coach.css)     │
└──────────────────────────────────────┘
```

> **重要架構原則**：
> 1. `src/fingering_engine.js`、`src/normalizer.js` 完全純粹解耦，不依賴 DOM 或 UI。
> 2. UI 層（`CoachPanel`、`ShapeDiagram`）**僅以唯讀方式消費指法分析結果**，絕對不重新計算指法。
> 3. 全曲 Session 快取以 `songId-revisionId-partId` 為鍵值，全曲 146 小節分析耗時僅約 100ms，徹底杜絕 UI 阻塞。

---

## 1. 標準化資料格式 (Normalized Tab Data Schema)

統一各資料來源，同一拍點（Beat）同時發聲的多個音符（如雙音 Double-stops、和弦 Chords）**必須聚合於同一個 beat 之中**，不可被拆散。

```json
{
  "song": {
    "title": "Enter Sandman",
    "artist": "Metallica",
    "songId": 19
  },
  "track": {
    "name": "Clean Guitar",
    "instrument": "Electric Guitar (clean)",
    "tuning": [64, 59, 55, 50, 45, 40]
  },
  "measures": [
    {
      "measureNumber": 2,
      "timeSignature": "4/4",
      "marker": null,
      "beats": [
        {
          "beatNumber": 1,
          "timing": "1/8",
          "notes": [
            {
              "string": 5,
              "fret": 0,
              "isRest": false,
              "isTie": true,
              "isSlide": false
            }
          ]
        },
        {
          "beatNumber": 2,
          "timing": "1/8",
          "notes": [
            {
              "string": 4,
              "fret": 7,
              "isRest": false,
              "isTie": false,
              "isSlide": false
            }
          ]
        }
      ]
    }
  ]
}
```

---

## 2. 指法推薦引擎演算法 (Fingering Engine v1)

### 核心演算法：Viterbi 全域動態規劃 (Dynamic Programming)
若僅以「單一小節」或「局部貪婪」做指法選擇，在遇到小節線交界時容易產生不合理的高頻位移（例如第 1 小節末為 7 品、第 2 小節初為 8 品，若拆開算會判定換至第 8 把位，但實際上手指只需延伸）。

因此，本引擎將整首樂曲或樂段攤平成連續拍點序列 $k = 1, 2, \dots, N$，利用 **動態規劃（Viterbi Algorithm）** 尋找全域成本最小的路徑：

$$\text{Total Cost} = \sum_{k=1}^{N} \text{Cost}_{\text{intra}}(\text{State}_k) + \sum_{k=2}^{N} \text{Cost}_{\text{transition}}(\text{State}_{k-1}, \text{State}_k)$$

### 人體工學狀態定義 (State Space)
對於每個拍點 $k$，候選狀態為 $(\text{Position } P, \text{Fingers } [f_1, f_2, \dots])$：
- **把位 (Position $P$)**：食指基準品格（如 Position 7 表示食指位於第 7 品）。
- **自然跨度 (Natural Span)**：$[P, P+3]$，對應食指(1)、中指(2)、無名指(3)、小指(4)。
- **延伸範圍 (Stretch Bounds)**：$[P-1, P+4]$，食指往下延伸 1 格、小指往上延伸 1 格。
- **空弦音 (Open String)**：`fret = 0` 固定賦予 `recommendedFinger = 0`，不強制要求手把位移動。

### 計分規則與權重 (Scoring Weights)

```javascript
const WEIGHTS = {
  // 拍點內人體工學成本 (Intra-Beat Ergonomics)
  FINGER_DEVIATION: 8,       // 手指偏離該把位自然對應手指的成本 (|finger - ideal| * 8)
  STRETCH_INDEX: 15,         // 食指向下延伸 1 格的輕微負擔 (pos - 1)
  STRETCH_PINKY: 18,         // 小指向上延伸 1 格的負擔 (pos + 4)
  AWKWARD_STRETCH: 80,       // 超出常規跨度的不自然伸展
  BARRE_COST: 15,            // 橫按代價（食指或無名指橫按同品多弦）
  EXTREME_INFEASIBLE: 99999, // 物理不可能的手型（成本極大，直接剪枝）

  // 跨拍點移動與平滑性成本 (Inter-Beat Transitions)
  POSITION_SHIFT_BASE: 40,   // 換把位的基礎固定成本（手腕與大臂位移代價）
  POSITION_SHIFT_PER_FRET: 12,// 換把距離成本 (每多移 1 格 + 12)
  SAME_FINGER_SAME_STRING: 30,// 同一手指在同弦滑動跳音的遲滯懲罰
  STRING_SKIPPING_PENALTY: 5, // 跨大弦距時的不穩定補償
  AWKWARD_FINGER_JUMP: 10     // 反向或跨指跳動的遲滯成本
};
```

### 同時發聲音符（雙音 / 和弦）物理限制
1. **同指不同品絕對禁止**：若同一拍點上，不同弦的品格不同（$f_1 \ne f_2$），分配相同手指的成本為 $\infty$（人手無法以同一手指同時按壓不同品格）。
2. **品格與手指物理單調性**：低品格音符必須分配小於或等於高品格音符的手指（$f_1 < f_2 \implies \text{finger}_1 \le \text{finger}_2$）。
3. **橫按支持 (Barre Allowance)**：同品格在不同弦上的音符（如 Smoke on the Water 第 5 品雙音），允許由同一手指（Finger 1 或 Finger 3）橫按，或由相鄰手指按壓。
4. **空弦錨定 (Open String Anchoring)**：空弦期間手型可自由準備或維持原把位，跨空弦的換把給予適度平滑度權重（$16 + 4 \times \Delta P$），避免指法無故跳格。

---

## 3. 輸出格式範例 (Output Format)

### (1) 人體工學 Console Debug 格式（精確依據規格）
在瀏覽器 Console 或測試執行時，以清晰小節塊輸出：

```text
=======================================================
🎸 Fingering Coach Analysis: Smoke On The Water - Deep Purple
Track: Rhythm Guitar (Overdriven Guitar)
=======================================================

Measure 1 (Intro)
Position: 3

D5 + A5 → [3 + 3]
G3 + D3 → [1 + 1]
G5 + D5 → [3 + 3]
G0 → 0 (Open)
D5 + A5 → [3 + 3]

Position shift: false

-------------------------------------------------------

Measure 2
Position: 3

G3 + D3 → [1 + 1]
G6 + C#6 → [3 + 4]
G5 + D5 → [3 + 3]

Position shift: false
```

### (2) 結構化 JSON 輸出
分析結果之 JSON 格式：

```json
{
  "song": { "title": "Enter Sandman", "artist": "Metallica" },
  "measures": [
    {
      "measureNumber": 2,
      "recommendedPosition": 5,
      "isPositionShift": false,
      "beats": [
        {
          "beatNumber": 1,
          "timing": "1/8",
          "recommendedPosition": 5,
          "isPositionShift": false,
          "notes": [
            { "string": 5, "fret": 0, "recommendedFinger": 0, "isRest": false }
          ]
        },
        {
          "beatNumber": 2,
          "timing": "1/8",
          "recommendedPosition": 5,
          "isPositionShift": false,
          "notes": [
            { "string": 4, "fret": 7, "recommendedFinger": 3, "isRest": false }
          ]
        },
        {
          "beatNumber": 3,
          "timing": "1/8",
          "recommendedPosition": 5,
          "isPositionShift": false,
          "notes": [
            { "string": 3, "fret": 5, "recommendedFinger": 1, "isRest": false }
          ]
        },
        {
          "beatNumber": 4,
          "timing": "1/8",
          "recommendedPosition": 5,
          "isPositionShift": false,
          "notes": [
            { "string": 5, "fret": 6, "recommendedFinger": 2, "isRest": false }
          ]
        }
      ]
    }
  ]
}
```

---

## 4. 自動化測試驗證 (Test Suite)

所有測試皆為**離線純運算**，不依賴任何外部網路或 Chrome 執行環境。

### 執行全部測試
```bash
npm test
# 或
node tests/run_all_tests.js
```

### 測試項目包含：

#### 1. 5 大 Synthetic 人體工學極端案例 (`tests/synthetic.test.js`)
- ✅ **Case 1 (7 → 8 → 9 → 10)**：自然維持在 Position 7，手指依序為 Index(1) → Middle(2) → Ring(3) → Pinky(4)。
- ✅ **Case 2 (7 → 9 → 8 → 7 | 8 → 9 → 10 跨小節)**：跨小節全域分析，兩小節均穩定停留在 Position 7，小節交界無多餘換把（`isPositionShift: false`）。
- ✅ **Case 3 (0 → 7 → 0 → 8 空弦與實音交錯)**：空弦音皆指派 `finger = 0`，手型錨定於 Position 7 不位移。
- ✅ **Case 4 (雙音 Double-stops 同拍發聲)**：同一拍發聲的雙音檢驗物理合理性，同品橫按與不同品階梯手型皆正確解析。
- ✅ **Case 5 (3 → 5 → 10 → 12 明顯大跳躍)**：在 3 品與 5 品維持 Position 3，跳至 10 品時精準觸發 `isPositionShift = true` 並平滑切換至高把位。

#### 2. 3 首 Phase 1 真實樂譜 Fixture 驗證 (`tests/fixtures.test.js`)
- ✅ **Metallica - Enter Sandman**：成功判定前奏主音 Riff 位於 **Position 5**，5品(1) - 6品(2) - 7品(3) 與 0品空弦(0) 完美重現全球吉他手標準按法。
- ✅ **Deep Purple - Smoke On The Water**：成功判定四度雙音 Riff 位於 **Position 3**，橫按與雙指分配符合人體工學。
- ✅ **Nirvana - Come As You Are**：成功判定降全音前奏 Riff 位於 **Position 1**，0品空弦(0) - 1品(1) - 2品(2) 正確對應。

#### 3. Phase 2.5 & Phase 2.6 人性化真實歌曲實測驗證 (`tests/real_song_validation.js`)
- ✅ **Schoolgirl byebye - 傍晚去太子灣嗎**：
  - 執行指令：`npm run test:validation` 或 `node tests/real_song_validation.js`
  - 成功驗證前 20 小節（共 120 拍點）之主吉他（Lead Guitar）指法。
  - **Phase 2.6 人性化演算法全面優化**：
    1. **Phrase / Measure Boundary Preference**：M2 整小節穩定留在 Pos 7，準確在 M3 第一拍小節線換入 Pos 8。
    2. **Repeated Pattern Consistency**：M5、M9、M13 的 Cmaj7 旋律再現自動復用 M1 的 Pos 7 與 1-2-3 手指。
    3. **Generic Shape Coherence**：M17 的低音 C 分解和弦自動錨定至更符合真人習慣的第 1 把位開放手型（Pos 1，指 3 + 指 2）。
    4. **Open-String Shift Window**：M19 完美運用第 4 拍的高音 E 空弦窗口平滑滑降至第 1 把位。
    5. **Explainable Cost Breakdown**：每拍均附帶透明的移動成本、延伸懲罰、樂句邊界獎勵、重複模式獎勵與手型獎勵數據。

#### 4. Phase 3.0 UI 驗證與全曲效能驗證 (`tests/ui_acceptance.test.js`)
- ✅ **全曲串接與非阻塞運算 (Full Track Pipeline)**：
  - 以《傍晚去太子灣嗎》全曲 146 小節（數百個拍點）進行端到端串接，正規化僅需 0.5ms，指法推薦引擎僅需約 **100ms**，全流程約 110ms，徹底杜絕瀏覽器主執行緒卡頓。
- ✅ **Session 記憶體快取 (Fingering Cache)**：
  - 以 `songId-revisionId-partId` 為鍵值，重複瀏覽或同音軌切換時即時命中快取（0ms），無多餘重複運算。
- ✅ **M1（Pos 7 / 1-2-3 手型）**：
  - 正確聚合 G7、G9、B8、E7，產生標準 4 品 compact diagram，左側標註 `7fr`。
- ✅ **M3（Pos 8 高把位與 B6 換把至 Pos 10）**：
  - 自動偵測小節內換把，精準拆分為 **Segment 1（Beats 1–5，Pos 8）** 與 **Segment 2（Beat 6，Pos 10）** 兩段獨立手型，杜絕衝突疊圖。
- ✅ **M4（12 + 10 + 10 Mini-Barre）**：
  - 成功識別食指（Finger 1）在第 10 品橫跨 B 弦與 G 弦之同指按弦，於 SVG 中自動生成圓角膠囊（Mini-barre Capsule），並與 12 品無名指（Finger 3）精準組合。
- ✅ **M17（Pos 1 開放和弦手型）**：
  - 正確辨識低把位 C 和弦分解，頂部繪製琴枕（Nut）粗線，空弦音上方標示「O」，無發聲弦保持乾淨空白。
- ✅ **M19（空弦音滑降過渡）**：
  - 前段為 Pos 5，透過高音 E 空弦音平順過渡至 Pos 1，兩段 Segment 自動無縫切換。
- ✅ **經典樂譜 Fixture 相容性**：
  - *Enter Sandman*、*Smoke On The Water*（雙音橫按）、*Come As You Are* 全數通過 SVG 向量渲染，無任何異常或語法錯誤。

---

## 5. Chrome Extension 載入與使用

1. 開啟 Chrome 瀏覽器，進入 `chrome://extensions/`。
2. 開啟右上角 **「開發人員模式」**。
3. 點擊 **「載入未封裝項目」**，選取此專案根目錄。
4. 開啟任何 Songsterr 樂譜頁面（例如 [Schoolgirl byebye - 傍晚去太子灣嗎](https://www.songsterr.com/a/wsa/schoolgirl-byebye-tab-s6557798)）。
5. 頁面右側將自動浮現 **Fingering Coach 浮動面板**：
   - 點擊 `◀ Prev` / `Next ▶` 手動瀏覽小節（M1～M146）。
   - 點擊小節內各拍點（B1、B2...）高亮當前按弦音符。
   - 檢視 Compact Chord Shape 向量圖、Mini-Barre 膠囊、當前弦/品/手指詳細卡片。
   - 點擊面板右上角 `─` 可最小化為右下角吉他浮動按鈕（FAB），點擊隨時還原。

---

## 6. 本地獨立互動式預覽 (Offline UI Preview)

無需安裝 Extension 或連線網路，即可在本機直接開啟獨立預覽器體驗 Coach Panel：

```bash
# 開啟 tests/ui_preview.html 於預設瀏覽器中
start tests/ui_preview.html
# 或 macOS
# open tests/ui_preview.html
```

---

## 7. 目前限制與技術邊界 (Current Limitations)

1. **播放同步尚未實作 (Phase 3.0 刻意排除)**：
   - 目前採手動按鈕（`Prev / Next Measure / Beat`）瀏覽驗證，播放器遊標自動跟隨將於 Phase 3.1 實現。
2. **拇指按弦 (Thumb Fret / T)**：
   - 目前指法推薦以 1 (Index) 到 4 (Pinky) 加上 0 (Open) 為主，暫未包含低音大拇指扣弦按法。
3. **特定調弦法指板映射**：
   - 預設支援標準 E Standard 與吉他降音調弦，特殊開放調弦暫依音高品格直接解析。

---

## 8. 下一步規劃 (Roadmap for Phase 3.1+)

- **Phase 3.1：播放同步 (Playback Cursor Synchronization)**：
  - 監聽 Songsterr 播放器音訊與游標 DOM 進度，即時驅動 Coach 面板小節與拍點自動前進高亮。
- **Phase 4：特定指型庫融合 (CAGED & Scale Shapes)**：
  - 結合五聲音階指型與和弦字典，使指法分析在遇見特定分解和弦時更加直覺。

