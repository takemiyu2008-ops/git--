# markdown-content-pipeline

Markdown コンテンツ処理パイプラインの修正・拡張スキル。marked.js、Obsidian 記法、SVG ブロック処理を管理する。

## Trigger

ユーザーが「Markdown表示修正」「レポート表示がおかしい」「Obsidian記法対応」「SVG表示修正」などを依頼したとき。

## パイプライン構造

```
入力テキスト
  │
  ├── preprocessObsidian(text)
  │   ├── ==text== → <mark>text</mark>（ハイライト変換）
  │   ├── > [!type] title → callout div 変換
  │   └── callout 内コンテンツの > プレフィックス除去
  │
  └── marked.parse(preprocessedText)
      └── HTML 出力
```

### renderMarkdown() 関数 (app.js ~line 542-548)

```javascript
function renderMarkdown(text) {
    if (!text) return '';
    if (typeof marked !== 'undefined') {
        return marked.parse(preprocessObsidian(text));
    }
    return text.replace(/\n/g, '<br>');
}
```

- marked.js が読み込まれていない場合は `\n` → `<br>` のフォールバック
- marked.js はデフォルト設定で使用（カスタム設定なし）

### preprocessObsidian() 関数 (app.js ~line 491-539)

**処理順序:**

1. **ハイライト変換** (~line 492-493)
   ```javascript
   text = text.replace(/==(.*?)==/g, '<mark>$1</mark>');
   ```

2. **Callout ヘッダー変換** (~line 495-504)
   - パターン: `> [!type]+/- title`
   - CALLOUT_TYPES マップでアイコン・色を決定
   - `<div class="obsidian-callout callout-{type}">` に変換

3. **Callout コンテンツ処理** (~line 506-536)
   - `> ` プレフィックスの行をコンテンツとして連結
   - プレフィックスなしの行で callout ブロックを閉じる

### CALLOUT_TYPES マップ (~line 483-488)

```javascript
const CALLOUT_TYPES = {
    note:     { icon: '📝', color: '#3b82f6' },
    info:     { icon: 'ℹ️', color: '#06b6d4' },
    abstract: { icon: '📋', color: '#8b5cf6' },
    summary:  { icon: '📊', color: '#8b5cf6' },
    danger:   { icon: '⚠️', color: '#ef4444' },
    error:    { icon: '❌', color: '#ef4444' },
    bug:      { icon: '🐛', color: '#ff1744' },
    todo:     { icon: '☑️', color: '#448aff' },
};
```

## CSS スタイル (styles.css)

### .markdown-preview クラス

レポートコンテンツの Markdown 表示に使用。以下のスタイルが定義済み:

- 見出し (h1-h6)
- リスト (ul, ol)
- コードブロック
- テーブル
- 引用ブロック (blockquote)
- 画像

### .obsidian-callout クラス

Obsidian 形式のコールアウトボックス表示用。

### .report-content

`white-space: pre-wrap` が設定されている。Markdown レンダリングと競合する可能性があるため、Markdown 表示時はこのスタイルを上書きする必要がある場合がある。

## 既知のバグパターン

### 1. SVG ブロック内の空行問題 (#565-566, #653)

**症状**: SVG インフォグラフィックが表示されない
**原因**: marked.js は HTML ブロック内に空行があるとブロックを分割する
**対処**: `stripBlankLinesInSvg()` 前処理関数でSVG内の空行を除去

```javascript
function stripBlankLinesInSvg(text) {
    // <svg> ... </svg> の間の空行を除去するステートマシン
}
```

**注意**: インフォグラフィック機能は廃止済みだが、SVGを含むMarkdownコンテンツを扱う場合は同様の問題が発生しうる。

### 2. \n → <br> 変換の残存 (#261)

**症状**: Markdown レンダリングが効かない箇所がある
**原因**: `renderMarkdown()` を使わず直接 `text.replace(/\n/g, '<br>')` している箇所がある
**対処**: Markdown 表示が必要な箇所は全て `renderMarkdown()` を通すこと

app.js 内に5箇所の `\n → <br>` 変換が存在（#261で特定済み）。

### 3. white-space: pre-wrap との競合 (#259)

**症状**: Markdown の段落間余白やリスト表示が崩れる
**原因**: `.report-content` の `white-space: pre-wrap` が Markdown の HTML 出力と競合
**対処**: Markdown レンダリング済みコンテンツには `white-space: normal` を設定

## 拡張時の注意事項

### 新しい Obsidian 記法を追加する場合

1. `preprocessObsidian()` 関数内に変換ロジックを追加
2. 処理順序に注意（ハイライト → callout → 新記法）
3. marked.js の処理前に変換すること
4. 対応するCSS スタイルを追加

### marked.js の設定を変更する場合

- 現在はデフォルト設定
- `marked.setOptions()` でカスタマイズ可能
- GFM (GitHub Flavored Markdown) はデフォルトで有効

### 外部ライブラリ

- marked.js: CDN 経由 (`https://cdn.jsdelivr.net/npm/marked/marked.min.js`)
- index.html の `<script>` タグで読み込み（~line 20）
