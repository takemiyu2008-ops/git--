# gantt-chart-modifier

ガントチャート（シフト表）の修正・機能追加に特化したスキル。CSS/JS の複雑な相互作用を理解した上で安全に変更を行う。

## Trigger

ユーザーが「ガントチャート修正」「シフト表の見た目変更」「シフトバーの修正」「カレンダー表示修正」などを依頼したとき。

## ガントチャートのアーキテクチャ

### 主要関数 (app.js)

| 関数 | 行番号(目安) | 役割 |
|------|------------|------|
| `renderGanttBody()` | ~line 801 | メインレンダリング。7日分の行を生成 |
| `calculateShiftLevels(shifts)` | ~line 750 | 重なるシフトの垂直レベル計算 |
| `createShiftBar(s, lvl)` | ~line 1359 | 個別シフトバーのDOM要素生成 |
| `showShiftPopover()` | 別途定義 | シフト詳細ポップオーバー表示 |
| `getJapaneseHoliday(date)` | 別途定義 | 日本の祝日判定 |
| `getPayDayInfo(date)` | 別途定義 | 給料日/年金日判定 |
| `getSpecialEvent(dateStr)` | 別途定義 | 臨時イベント判定 |

### レンダリングフロー

```
renderGanttBody()
  ├── 7日分のループ
  │   ├── 日付ラベル生成（曜日色分け、祝日マーク）
  │   ├── 給料日マーク表示
  │   ├── 臨時イベントマーク表示
  │   ├── デイリーイベントアイコン表示
  │   ├── 固定シフト収集（臨時イベント日は除外）
  │   ├── 通常シフト収集
  │   ├── 有給/休日申請による非表示処理
  │   ├── calculateShiftLevels() でレベル計算
  │   └── createShiftBar() で各シフトバー生成
  └── トグル初期化
```

### CSS クラス構造 (styles.css)

| クラス | 行番号(目安) | 用途 |
|--------|------------|------|
| `.gantt-container` | ~line 672 | ガラスモーフィズムの外枠 |
| `.gantt-body` | ~line 734 | 行コンテナ |
| `.gantt-row` | ~line 738 | 各日の行 |
| `.gantt-date-label` | ~line 820 | 左側の日付表示 |
| `.gantt-timeline` | ~line 790 | タイムライン軸 |
| `.shift-bar` | ~line 811 | シフトバー基本スタイル |
| `.shift-bar.fixed` | ~line 840 | 固定シフト（点線ボーダー） |
| `.shift-bar.overnight` | ~line 844 | 夜勤シフト（左ボーダー） |
| `.shift-bar.changed` | ~line 874 | 変更済みシフト（アニメーション） |
| `.shift-bar.swapped` | ~line 892 | 交換済みシフト（アニメーション） |
| `.shift-bar.temporary-shift` | ~line 6960 | 臨時シフト |
| `.shift-bar.has-tasks` | ~line 7009 | タスク付きシフト |

### z-index レイヤー構造

```
z-index: 1000  → .modal-overlay, .event-popover
z-index: 6     → .shift-bar:hover
z-index: 未設定 → 通常のシフトバー、日付ラベル
```

## 既知のバグパターンと対処法

### 1. z-index の重なり問題 (#235-237)

**症状**: 祝日ラベルやイベントマークがシフトバーの下に隠れる
**原因**: `.gantt-date-label` の z-index が `.shift-bar` より低い
**対処**: 適切な z-index の階層設定。ただし `.shift-bar:hover` (z-index: 6) との兼ね合いに注意

### 2. 祝日ラベル背景の透過問題 (#236)

**症状**: 祝日ラベルの背景が透過してシフトバーと重なって読みにくい
**対処**: `.holiday-mark` の背景に不透明度を設定

### 3. overflow: hidden によるクリッピング

**症状**: ポップオーバーやツールチップが親要素の境界で切れる
**対処**: `overflow: visible` を適切な階層に設定。ただしスクロール動作への影響に注意

## 変更時の注意事項

### CSS 変更時

1. **z-index を変更する場合**: 上記レイヤー構造全体を確認すること
2. **position を変更する場合**: シフトバーの配置は `position: absolute` + `left/width` で計算されている
3. **overflow を変更する場合**: スクロール動作とポップオーバー表示の両方をテストすること
4. **アニメーション追加時**: `.changed` と `.swapped` の既存アニメーションと競合しないこと

### JS 変更時

1. **`calculateShiftLevels()` を変更する場合**: 夜勤シフトの特殊処理（24:00まで表示）を壊さないこと
2. **`createShiftBar()` を変更する場合**: 固定シフト/通常シフト/夜勤/タスク付き の全パターンでテストすること
3. **`renderGanttBody()` を変更する場合**:
   - 臨時イベント日の固定シフト除外ロジック
   - 有給/休日承認済みシフトの非表示ロジック
   - これらの条件分岐を壊さないこと

### テスト項目

変更後は以下を確認:

- [ ] 通常シフトの表示
- [ ] 固定シフトの表示（点線ボーダー）
- [ ] 夜勤シフトの表示
- [ ] シフトが重なった場合のレベル分け
- [ ] 祝日の表示とマーク
- [ ] 臨時イベント日の表示
- [ ] シフトバー hover 時の z-index
- [ ] ポップオーバーの表示位置
- [ ] モバイル表示での動作
