# Songsterr Fingering Coach

🎸 **Songsterr Fingering Coach** 是一個針對 [Songsterr](https://www.songsterr.com/) 樂譜的 Chrome Extension (Manifest V3) 與**獨立左手吉他指法推薦引擎（Fingering Engine）**。

本專案現已完成 **Phase 1（資料讀取與逆向驗證）** 與 **Phase 2（解耦指法推薦演算法引擎）**。

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
                   │ Raw JSON
                   ▼
┌──────────────────────────────────────┐
│  Tab Normalizer (src/normalizer.js)  │
│  - 拍點聚合 (Same Beat Grouping)      │
│  - 弦、品、休止符、連音標準化          │
└──────────────────┬───────────────────┘
                   │ Normalized Tab Data
                   ▼
┌──────────────────────────────────────┐
│ Fingering Engine (fingering_engine)  │
│  - 人體工學狀態空間 (Ergonomics)      │
│  - 全域 Viterbi / DP 最佳路徑搜尋     │
│  - 跨小節平滑性與換把最小化           │
└──────────────────┬───────────────────┘
                   │ Fingering Analysis Result
                   ▼
┌──────────────────────────────────────┐
│  Formatter (src/formatter.js)        │
│  - Console Debug Block 格式化        │
│  - Structured JSON / 視覺化表格       │
└──────────────────────────────────────┘
```

> **重要原則**：`src/fingering_engine.js`、`src/normalizer.js`、`src/formatter.js` 完全不依賴瀏覽器 DOM、Songsterr API 或網路 Fetch，可於 Node.js 離線環境獨立執行並通過完整單元測試。

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

#### 3. Phase 2.5 真實歌曲全曲前 20 小節實測 (`tests/real_song_validation.js`)
- ✅ **Schoolgirl byebye - 傍晚去太子灣嗎**：
  - 執行指令：`node tests/real_song_validation.js`
  - 成功驗證前 20 小節（共 120 拍點）之主吉他（Lead Guitar）指法。
  - 完整解析 Cmaj7 / Fmaj7 / 主歌開放和弦分解之把位切換、同指跨弦躍遷、高把位三音橫按（Fret 10 mini-barre + Fret 12 pinky）、空弦換把窗口等細膩技巧。

---

## 5. Chrome Extension 載入與使用

1. 開啟 Chrome 瀏覽器，進入 `chrome://extensions/`。
2. 開啟右上角 **「開發人員模式」**。
3. 點擊 **「載入未封裝項目」**，選取此專案根目錄。
4. 開啟任何 Songsterr 樂譜頁面（例如 Enter Sandman、Smoke on the Water 等）。
5. 開啟 DevTools Console，擴充功能即會自動輸出：
   - Phase 1 原始音符 JSON 與 Note 摘要表
   - **Phase 2 指法引擎分析結果（包含推薦把位、手指代號、換把標記、視覺化表格）**。

---

## 6. 目前限制與技術邊界 (Current Limitations)

1. **拇指按弦 (Thumb Fret / T)**：
   - 目前指法推薦以 1 (Index) 到 4 (Pinky) 加上 0 (Open) 為主，暫未包含 Jimi Hendrix 風格的低音大拇指按法（Thumb over neck）。
2. **特定調弦法指板映射**：
   - 預設調弦法為標準 E Standard 與一般吉他降音調弦（如 D Standard）。對於開放調弦（Open D / Open G）目前僅依品格與音高計算，未套用特殊開放和弦指型資料庫。
3. **無 UI 互動層（本階段嚴格限制）**：
   - 遵照 Phase 2 開發規範，本階段無任何 DOM 浮動面板、指板視覺化或浮水印覆蓋。

---

## 7. 下一步規劃 (Roadmap for Phase 3+)

- **Phase 3：即時浮動指板 UI (Generative UI / SVG Fretboard)**：
  - 於 Songsterr 樂譜側邊或下方提供響應式向量吉他指板。
  - 即時同步 Songsterr 音訊播放進度，以高亮圓點顯示當前拍點之手指（1/2/3/4/0）與當前推薦把位框。
- **特定指型庫融合 (CAGED & Scale Shapes)**：
  - 結合常用五聲音階指型與和弦字典，使指法分析在遇見特定分解和弦時更加直覺。
