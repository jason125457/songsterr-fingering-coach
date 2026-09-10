# Songsterr Fingering Coach

🎸 **Songsterr Fingering Coach** 是一個針對 [Songsterr](https://www.songsterr.com/) 樂譜的 Chrome Extension (Manifest V3) 與**獨立左手吉他指法推薦引擎（Fingering Engine）**。

本專案現已完成 **Phase 1（資料讀取與逆向驗證）**、**Phase 2（解耦指法推薦演算法引擎）**、**Phase 2.6（人性化指法演算法優化）**、**Phase 3.0（完整樂曲串接與 Fingering Coach UI 基礎建設）** 與 **Phase 3.0.1 QA Fix + Phase 3.1A Playback Cursor Feasibility**。

---

## 📌 專案里程碑與開發進度 (Milestones & Progress)

| 階段 (Phase) | 核心目標 (Milestone Objective) | 交付成果 (Key Deliverables) | 當前狀態 (Status) |
| :--- | :--- | :--- | :---: |
| **Phase 1: Songsterr Reader** | 逆向解析 Songsterr 樂譜公開音符資料與 CDN 封包 | `content.js`、資料正規化解析、無後端無付費 API 驗證 | **已完成 (Completed)** ✅ |
| **Phase 2: Decoupled Engine** | 架構解耦、人體工學狀態空間、Viterbi DP 全域最佳指法搜尋 | `src/fingering_engine.js`、`src/normalizer.js`、離線單元測試套件 | **已完成 (Completed)** ✅ |
| **Phase 2.5: Real-Song Validation** | 真實長曲目驗證（以《傍晚去太子灣嗎》前 20 小節 120 拍為基準） | 120 拍完整分析、換把/同指跨弦/橫按/拉伸標註、成本排序 | **已完成 (Completed)** ✅ |
| **Phase 2.6: Human Optimization** | 消除不自然提早換把、重複 Riff 指法一致性、開放手型聚合、可解釋成本 | 樂句邊界獎勵、重複動機記憶、開放和弦手型、成本透明化輸出 | **已完成 (Completed)** ✅ |
| **Phase 3.0: Full Pipeline & UI** | 完整樂曲串接、Session 快取、極速非阻塞運算、浮動指型 Coach 面板、Mini-Barre 向量圖 | `src/ui/coach_panel.js`、`shape_diagram.js`、`coach.css`、M1-M20 瀏覽 | **已完成 (Completed)** ✅ |
| **Phase 3.0.1: QA Fix** | 吉他弦編號校正（String 1=High E, String 6=Low E）、全動態調弦名稱解析（Drop D, D Std） | 修正 `coach_panel.js`、`shape_diagram.js`、動態 Tuning 回歸測試 | **已完成 (Completed)** ✅ |
| **Phase 3.1A.1: Multi-Voice & Playback Validation** | 有理數時間軸聚合（Rational Fraction Timeline）、Canonical 多聲部事件模型、PlaybackMapper 轉接器、多行五線譜座標隔離 | `src/normalizer.js`、`src/songsterr/playback_mapper.js`、`tests/multi_voice_acceptance.test.js` | **已完成 (Completed)** ✅ |
| **Phase 3.1B: Live Playback Sync UI** | 將 PlaybackObserver + PlaybackMapper 透過 PlaybackSyncController 正式連動 CoachPanel 實現即時播放跟隨 | `src/controller/playback_sync_controller.js`、雙模式切換、Multi-Voice 同步高亮、Pause/Seek/速度自適應 | **已完成 (Completed)** ✅ |
| **Phase 3.2A: Inline Measure Overlay Prototype** | 行內小節微型指法形狀懸浮層（Inline Measure Overlay）定位與生命週期驗證 | `src/ui/measure_overlay.js`、`src/ui/overlay_manager.js`、換把段落切換、Scroll/Resize 座標防飄移、零遮擋 | **已完成 (Completed)** ✅ |
| **Phase 3.2B: Every Visible Measure Shapes** | 視口驅動 2D 虛擬化（2D Viewport Virtualization）、所有可見小節預先算好指型、靜態多段換把全覽、播放高亮完全解耦 | 2D 視口判定、零點擊即時掛載、廣義多段並排/自適應、寬度自適應防碰撞、極低耗能 60 FPS | **已完成 (Completed)** ✅ |
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
┌────────────────────────────────────────────────────────┐
│ UI & Presentation Layer (src/ui/)                      │
│  - CoachPanel (src/ui/coach_panel.js) - 浮動指型面板   │
│  - OverlayManager (src/ui/overlay_manager.js) - 虛擬層 │
│  - MeasureOverlay (src/ui/measure_overlay.js) - 行內   │
│  - ShapeDiagram (src/ui/shape_diagram.js) - SVG 指型   │
│  - PlaybackSyncController - 播放同步控制器             │
│  - Scoped Dark Theme (coach.css)                       │
└────────────────────────────────────────────────────────┘
```

> **重要架構原則**：
> 1. `src/fingering_engine.js`、`src/normalizer.js` 完全純粹解耦，不依賴 DOM 或 UI。
> 2. UI 層（`CoachPanel`、`OverlayManager`、`MeasureOverlay`、`ShapeDiagram`）**僅以唯讀方式消費指法分析結果**，絕對不重新計算指法。
> 3. 全曲 Session 快取以 `songId-revisionId-partId` 為鍵值，全曲 146 小節分析耗時僅約 100ms，徹底杜絕 UI 阻塞。
> 4. 行內懸浮層實施嚴格視口虛擬化（Viewport Virtualization），全曲 150+ 小節在 DOM 中同時存在之 Overlay 節點數恆定為 4~6 個，徹底杜絕記憶體膨脹與掉幀。

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

#### 5. Phase 3.0.1 QA 修正與 Phase 3.1A 播放游標驗證 (`tests/playback_observer.test.js`)
- ✅ **吉他弦編號校正 (String Numbering Fix)**：
  - 嚴格落實吉他標準規範：`normalized string 0`（High E）$\rightarrow$ **第 1 弦 (Guitar String 1)**；`normalized string 5`（Low E）$\rightarrow$ **第 6 弦 (Guitar String 6)**。
- ✅ **全動態調弦名稱解析 (Dynamic Tuning)**：
  - UI 與 SVG 徹底摒除標準調弦假設，依據 Track Tuning MIDI 動態換算：
    - Standard (`[64, 59, 55, 50, 45, 40]`): `E A D G B e`
    - Drop D (`[64, 59, 55, 50, 45, 38]`): `D A D G B e`
    - D Standard (`[62, 57, 53, 48, 43, 38]`): `D G C F A d`
- ✅ **多聲部（Multi-Voice）時間軸對齊研究（以《Romanza》52 小節為例）**：
  - 驗證 Voice 0（三連音分解，9 個 1/12 拍）與 Voice 1（低音附點二分音符，1 個 3/4 拍）於時間軸 $t=0$ 同時發聲。
  - 明確區分 `musical beat`（小節拍號）與 `rhythm event`（小節內發聲事件順序 `eventIndex`）。
- ✅ **獨立 PlaybackObserver 轉接器 (`src/songsterr/playback_observer.js`)**：
  - 完全自 CoachPanel 解耦，具備多層檢測策略（React Store、`#root[data-playing]`、`#cursorMarker[data-cursor]`、`<use href^="#cursor-playhead">` 座標匹配 `[data-testid="tab-beat-target"]`）。
  - 對外發布標準事件流 `{ state, measureNumber, eventIndex, positionInMeasure, currentTime, confidence, source }` 並即時響應 Seek。

#### 6. Phase 3.1A.1 多聲部時間軸聚合與播放游標映射驗證 (`tests/multi_voice_acceptance.test.js`)
- ✅ **有理數分數時間軸聚合（Rational Fraction Timeline）**：
  - 各聲部（Voice）獨立累計時間偏移量，使用精確分數運算（`{ num, den, text, value }`）徹底杜絕浮點誤差。
  - 同一時間點不同 Voice 發聲自動聚合於同一個 **Canonical Event**。
  - 《Romanza》第 1 小節（3/4 拍）由 9 個三連音分解（Voice 0）與 1 個附點二分音符低音（Voice 1）組成，精準聚合為 **9 個 Canonical Events**，Event 1 同時包含高音旋律（第 1 弦 7 品）與低音（第 6 弦 0 品），徹底消除第 10 個虛假事件。
- ✅ **來源身分追溯保留（Preserved Source Identity）**：
  - 每個 Canonical Event 保留 `sources: [{ voiceIndex, beatIndex, duration, isRest }]`。
  - 每個音符標註 `note.source = { voiceIndex, beatIndex }`，實現 DOM 拍點與規範化事件雙向精準定位。
- ✅ **獨立 PlaybackMapper 轉接器 (`src/songsterr/playback_mapper.js`)**：
  - 提供 `mapPlaybackEventToCanonical(playbackEvent, normalizedTrack)`。
  - **Strategy 1（來源身分比對）**：精準將 `(measureNumber, voiceIndex, beatIndex)` 映射回 Canonical Event（例如 Voice 0 Beat 0 與 Voice 1 Beat 0 皆精確對應至 Event 1）。
  - **Strategy 2（小節內時間比例比對）**：依拍號換算小節總時長（如 3/4 換算為 0.75），精確將連續進度 `positionInMeasure`（0.0～1.0）映射至當前 Canonical Event。
  - **Strategy 3（小節降級比對）**：在游標信心度僅為 `measure-only` 時安全退回小節首事件。
- ✅ **多行五線譜座標隔離與訊號來源標記 (Multi-Line Staff Protection)**：
  - PlaybackObserver 支援解析 `<use href="#cursor-playhead-{group}-{line}">` 之 `lineIndex`，與各拍點 `<rect data-testid="tab-beat-target" data-line-index="...">` 進行行號隔離，並加入 2D 座標距離權重，徹底杜絕不同譜行間相同 X 座標的誤判。
  - 事件物件明確標註來源：`source: "dom-playhead" | "cursor-marker" | "measure-only"`。
  - 控制台 Debug 格式升級：`▶ M1 event 1 [dom-playhead]`。
- ✅ **Chrome MV3 執行環境隔離特徵確認**：
  - 確認 Content Script 於 Isolated World 執行，無法直接讀取頁面主世界的 `window.__store__`。系統以 DOM SVG 游標 (`dom-playhead`) 與 `#cursorMarker` 作為高可用核心策略，保證 100% 穩定擷取。

#### 7. Phase 3.1B 即時播放跟隨全功能驗證 (`tests/playback_sync_acceptance.test.js`)
- ✅ **解耦架構編排器 (`src/controller/playback_sync_controller.js`)**：
  - 嚴格維持 `PlaybackObserver ➔ PlaybackMapper ➔ Canonical Event ➔ CoachPanel` 之單向解耦管線。
  - CoachPanel 絕不讀取 Songsterr DOM，PlaybackObserver 亦不直接操控 UI，由控制器集中調度。
- ✅ **《傍晚去太子灣嗎》全曲播放跟隨 (Playback Follow)**：
  - Songsterr 播放時，面板小節（M1 ➔ M2 ➔ M3）自動平順前進。
  - **M3 內部把位段落自動切換**：前半段（Beats 1-5）高亮 Segment 0（Pos 8），第 6 拍換把時自動切換至 Segment 1（Pos 10）。
  - **M4 迷你橫按（Mini-Barre）高亮**：精準高亮食指橫跨 B/G 弦第 10 品膠囊，並同時呈現 12 品無名指。
- ✅ **Romanza 多聲部同時發聲視覺化 (Multi-Voice Dual-Voice Display)**：
  - M1 Event 1 同步完整呈現高音旋律（第 1 弦 7 品，指 1，`V0`）與低音根音（第 6 弦 0 品，指 0，`V1`），附帶清晰 Voice 標籤。
  - SVG 弦枕上方圓圈（空弦）與品格實心圓點同時綠色高亮發光。
- ✅ **Smoke On The Water 雙音（Double-Stop）即時同步**：
  - 同時發聲的四度雙音於 Event Details 卡片與指型圖中無縫同步高亮。
- ✅ **即時跳轉（Seek）與暫停/繼續（Pause & Resume）**：
  - 任意拖動進度條或點擊音符，面板瞬間同步至目標小節與 Canonical Event。
  - 播放器暫停時，面板精準凍結於當前 Event（絕不跳回小節第一拍），繼續播放時自暫停點無縫推進。
- ✅ **播放倍速自適應（0.5x / 1.25x Speed Invariance）**：
  - 依拍號與時間比例自適應解析，變更速度時時序毫不脫節。
- ✅ **手動瀏覽與防游標搶奪機制（Manual ➔ Resume Follow UX）**：
  - 播放中若使用者手動點擊 `Prev / Next`、某 Event 或某 Segment，面板自動轉為 **Manual 模式**，播放游標不再搶奪畫面。
  - 面板頂部即時顯示顯目的 **`▶ Resume Follow`** 按鈕，點擊後瞬間重新對齊最新播放進度並切回 Follow 模式。
- ✅ **效能與防閃爍控制 (Flicker Control & Dirty-Checking)**：
  - 實施嚴格狀態 Dirty-Checking，60ms 高頻取樣下，同小節同拍點完全不重繪 DOM（0 冗餘渲染），杜絕畫面閃爍與主執行緒卡頓。

---

## 4.3 行內小節微型指法懸浮層 (Phase 3.2A Inline Measure Overlays)

Phase 3.2A 將左手手型圖以小型 Overlay 形式，直接錨定於 Songsterr 樂譜對應小節上方：

- 🎯 **精準小節錨定 (Songsterr Anchor Discovery)**：
  - 自動偵測並鎖定 Songsterr 原生 DOM 錨點 `rect[data-testid="tab-measure-target"][data-measure-index]`。
  - 建立 `measureIndex ➔ DOM anchor` 映射，徹底免除猜測座標或文字辨識。
- ⚡ **視口虛擬化 (Viewport Virtualization 4-6 Overlays Limit)**：
  - 即使曲目長達 150+ 小節，畫面中同時存在的 Overlay 數量**嚴格限制在 4~6 個**（當前播放小節 + 前後 1~2 小節）。
  - 滑動視窗（Sliding Window）隨播放或捲動動態平移，超出範圍者立即銷毀 unmount，維持 $O(1)$ 恆定記憶體與 60 FPS 流暢度。
- 🖐️ **極致精簡外觀 (Compact ShapeDiagram)**：
  - 寬度約 84px，高度約 70px，置於小節線上緣空白處。
  - 具備 `pointer-events: none` 與安全邊界計算，**100% 杜絕遮擋 TAB 六線譜音符與點擊操作**。
  - 清楚顯示 Position 標籤、1/2/3/4 手指、空弦 'O'、以及迷你橫按（Mini-Barre）藥丸圓角邊框。
- 🔄 **換把小節動態切換 (Multi-Segment Switching)**：
  - 小節內若有換把（如 M3: Pos 8 ➔ Pos 10），標頭自動標記 `P8➔P10` 轉場晶片。
  - 播放走到下一個 segment 時，微型手型圖無縫動態切換為新把位手型。
- 🟢 **播放同步聯動 (Live Playback Integration)**：
  - 播放推進時，當前演奏小節 Overlay 自動施加祖母綠邊框光暈（`.sfc-overlay-active`）。
  - Compact SVG 內部即時高亮發聲音符或空弦圓點，多聲部（Romanza）與雙音（Smoke on the water）同步發光。
  - 視窗垂直捲動或視窗 Resize 時，透過 `requestAnimationFrame` 與 `ResizeObserver` 穩定重算座標，絕不飄移。

---

## 4.4 視口驅動所有可見小節指法全覽 (Phase 3.2B Every Visible Measure Shapes)

Phase 3.2B 實現了真正的視口驅動虛擬化，徹底擺脫播放器狀態對視覺手型的束縛：

> 🎯 **核心產品原則 (Core Product Principle)**：  
> **「只要進入視口的每一個 Songsterr 小節，都直接顯示預先算好的 Fingering Shape；播放器的功能僅負責高亮當前小節與 Event，絕不干涉或決定手型圖是否可見。」**  
> *(Every visible Songsterr measure gets its precomputed Fingering Shape. Playback only highlights the current measure/event; it never controls shape visibility.)*

- 🌐 **真 2D 視口虛擬化 (True 2D Viewport Virtualization)**：
  - 判定小節錨點是否處於當前瀏覽器視口之 X 與 Y 雙軸邊界內，並具備垂直 `overscanY = 350px` 與水平 `overscanX = 120px` 緩衝區。
  - 當視窗縮放（Zoom）、響應式斷點變更、或橫向捲動時，2D 邊界運算皆能精確判定。
  - 徹底移除 Phase 3.2A 固定 4~6 個的限制：只要小節在可見範圍內，12、16 甚至 20+ 個小節皆即時掛載對應 Shape，離開視口者立即自動 unmount。
- ⚡ **零點擊即刻開讀 (Zero-Click Upfront Display on Page Load)**：
  - 使用者載入 Songsterr 樂譜後，**無須點擊 Play 播放鍵**，首頁視口內的所有小節（如 M1~M16）立即全部呈現預先計算完畢的最佳左手手型圖。
- 📜 **使用者手動捲動完全解耦 (Decoupled Manual Scrolling)**：
  - 使用者可隨意向下捲動樂譜至中後段（如 M20~M30 或結尾 M140+）。
  - Viewport Reconciler 透過 RAF 節流監聽捲動，隨捲動即時掛載新進入的小節手型，並安全釋放離開視口的小節。
  - 即使背景播放游標停留在 M1 或停止播放，捲動視口絕不會被播放游標強制綁架或拉回。
- 💡 **播放高亮隔離 (Playback Highlight Only)**：
  - 當播放器運行時，`syncPlayback(measureIndex, eventIndex)` 僅對當前進行的小節添加祖母綠發光邊框（`.sfc-overlay-active`）與音符圓點脈衝。
  - 視口內其餘所有小節的指法圖案**保持常駐顯示，絕對不被隱藏或清空**。
  - 若播放器前進到視口以外的小節，OverlayManager 靜默更新內部指標，絕不強制捲動畫面，待使用者捲回該區域時立即可見高亮狀態。
- 🧩 **廣義任意 N 段換把靜態全覽 (Generalized Multi-Segment Static Preview)**：
  - 支援單小節任意 $N \ge 1$ 個換把段落：
    - $N=1$：單一精簡手型圖。
    - $N=2$：水平並排顯示（例如 M3：左側 `P8` ➔ 右側 `P10`，中間附帶動態箭頭 `➔`）。
    - $N \ge 3$：廣義多段水平流暢排列或空間不足時自動自適應降級。
  - **在播放開始之前，吉他手就能一眼看清全小節的換把走向與完整手型轉換。**
- 📐 **寬度自適應防碰撞邊界 (Adaptive Sizing Guard)**：
  - 依據 Songsterr 當前小節真實寬度（`anchorRect.width`）動態計算可用空間。
  - Overlay 絕對不會向右凸出超出小節線，徹底杜絕與相鄰小節發生視覺碰撞與遮擋。
- 📊 **極致效能基準實測 (Performance Benchmark Results)**：
  - **緊湊視口（Tight Viewport）**：掛載 12 個 Overlays。
  - **常規視口（Normal Viewport）**：掛載 16 個 Overlays。
  - **寬螢幕全展開視口（Expanded Viewport）**：掛載 20 個 Overlays。
  - **捲動重繪更新耗時**：平均每次捲動幀更新僅 **1.276 ms**（遠低於 60 FPS 的 16.6ms 門檻）。
  - **記憶體與 DOM 節點開銷**：全曲 146 小節僅常駐視口約 16 個節點（**0% DOM 膨脹**，杜絕一次塞入數千節點導致的瀏覽器掉幀）。

---

## 5. Chrome Extension 載入與使用

1. 開啟 Chrome 瀏覽器，進入 `chrome://extensions/`。
2. 開啟右上角 **「開發人員模式」**。
3. 點擊 **「載入未封裝項目」**，選取此專案根目錄。
4. 開啟任何 Songsterr 樂譜頁面（例如 [Schoolgirl byebye - 傍晚去太子灣嗎](https://www.songsterr.com/a/wsa/schoolgirl-byebye-tab-s6557798)）：
   - **無需播放**，畫面上每一個可見小節上方即刻呈現左手指法圖（包含 M3 的 P8➔P10 換把、M4 的 Mini-barre）！
   - 向下捲動樂譜，新進入畫面之小節自動出現指型圖，離開畫面者自動回收。
5. 點擊播放器播放按鈕（Space 鍵或 Play 鍵）：
   - 當前演奏的小節 Overlay 自動亮起綠色光暈與音符同步高亮。
   - 浮動 Coach 面板同時即時跟隨推進。
   - 手動研讀指法時，點擊浮動面板可隨時進入 Manual 研讀模式；點擊 `▶ Resume Follow` 隨時對齊最新進度。

---

## 6. 本地獨立互動式預覽 (Offline UI Preview)

無需安裝 Extension 或連線網路，即可在本機直接開啟獨立預覽器體驗 Coach Panel 與 Phase 3.2B 視口驅動虛擬化：

```bash
# 開啟 tests/ui_preview.html 於預設瀏覽器中
start tests/ui_preview.html
# 或 macOS
# open tests/ui_preview.html
```

---

## 7. 目前限制與技術邊界 (Current Limitations)

1. **拇指按弦 (Thumb Fret / T)**：
   - 目前指法推薦以 1 (Index) 到 4 (Pinky) 加上 0 (Open) 為主，暫未包含低音大拇指扣弦按法。
2. **特定調弦法指板映射**：
   - 預設支援標準 E Standard、Drop 調弦與全音/半音降音調弦，極端特殊開放調弦暫依音高品格直接解析。
3. **極小窄螢幕手機排版**：
   - 專注於桌面瀏覽器版面，極端窄螢幕（寬度小於 360px）若小節過窄，多段手型圖會自動降級為當前段手型。

---

## 8. 下一步規劃 (Roadmap)

- **Phase 4：特定指型庫融合 (CAGED & Scale Shapes)**：
  - 結合五聲音階指型與和弦字典，使指法分析在遇見特定分解和弦時更加直覺。
- **使用者偏好設定 (User Custom Preferences)**：
  - 提供緊湊度開關（Compact vs Detailed）、Overlay 垂直位置自訂、顯示/隱藏手型標籤。

