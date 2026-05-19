# report-type-builder

レポートタイプ追加スキル。既存のアーキテクチャパターンに従い、新しいレポートタイプを追加する。

## Trigger

ユーザーが「レポート追加」「新しいレポート機能」「レポートタブ追加」などを依頼したとき。

## 既存レポートタイプ（参考パターン）

| タイプ | state key | Firebase path | ID prefix | アイコン | admin tab ID |
|--------|-----------|---------------|-----------|----------|-------------|
| トレンドレポート | `trendReports` | `trendReports/` | (なし) | 📊 | `trendReports` |
| 週次インテリジェンス | `newProductReports` | `newProductReports/` | `report-` | 🆕 | `newProductReport` |
| 新規商品調査 | `productResearchReports` | `productResearchReports/` | `research-` | 🔍 | `productResearch` |

## 実装チェックリスト

新しいレポートタイプ `[TYPE]` を追加する際、以下の全ステップを順に実施すること。

### Step 1: State 定義 (app.js)

`state` オブジェクト内（約 line 375-407）に配列を追加:

```javascript
[typeKey]: [], // [日本語名]
```

`loadData()` 関数（約 line 679-707）の `refs` 配列に追加:

```javascript
const refs = ['shifts', ..., '[typeKey]'];
```

同関数内のコールバックに render トリガーを追加:

```javascript
if (key === '[typeKey]') render[TypeName]();
```

### Step 2: Firebase セキュリティルール (firebase_rules.json)

既存ルールに倣い追加:

```json
"[typeKey]": {
  ".read": "auth != null",
  ".write": "auth != null"
}
```

### Step 3: ユーザー向けレンダリング関数 (app.js)

`renderTrendReports()` (約 line 7527) をテンプレートとして、以下を実装:

```javascript
function render[TypeName]() {
    const container = document.getElementById('[containerId]');
    const content = document.getElementById('[contentId]');
    if (!content) return;

    const reports = state.[typeKey];
    if (!reports || reports.length === 0) {
        content.innerHTML = '<p style="text-align: center; color: #94a3b8; padding: 20px;">レポートはまだありません</p>';
        return;
    }

    const sorted = [...reports].sort((a, b) =>
        new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );

    content.innerHTML = sorted.map(report => {
        const dateStr = report.updatedAt
            ? new Date(report.updatedAt).toLocaleDateString('ja-JP')
            : new Date(report.createdAt).toLocaleDateString('ja-JP');
        return `
            <div class="[cardClass]">
                <div class="report-header">
                    <span class="report-title">${report.title}</span>
                    <span class="report-date">📅 ${dateStr}</span>
                </div>
                <div class="report-content">${renderMarkdown(report.content)}</div>
                <div class="report-actions">
                    <button onclick="openEdit[TypeName]Modal('${report.id}')">✏️ 編集</button>
                    <button onclick="delete[TypeName]('${report.id}')">🗑️ 削除</button>
                </div>
            </div>`;
    }).join('');
}
```

### Step 4: トグル関数 (app.js)

```javascript
function init[TypeName]Toggle() {
    const section = document.getElementById('[containerId]');
    if (!section) return;
    const header = section.querySelector('.advisor-header');
    const content = section.querySelector('.advisor-content');
    const toggle = document.getElementById('[toggleId]');
    if (header && content) {
        header.onclick = () => {
            content.classList.toggle('collapsed');
            if (toggle) toggle.textContent = content.classList.contains('collapsed') ? '▼' : '▲';
        };
    }
}
```

`initApp()` または初期化セクションで呼び出すこと。

### Step 5: 管理パネルレンダリング (app.js)

`renderAdminPanel()` 内の if/else チェーン（約 line 3485-3493）の直後に追加:

```javascript
else if (state.activeAdminTab === '[adminTabId]') {
    render[TypeName]Admin(c);
}
```

管理パネル用関数:

```javascript
function render[TypeName]Admin(container) {
    container.innerHTML = '<div style="padding: 10px;"><button class="btn btn-primary" onclick="openAdd[TypeName]Modal()">➕ 新規追加</button></div>';
    const reports = state.[typeKey];
    if (!reports || reports.length === 0) {
        container.innerHTML += '<p style="text-align:center;color:#94a3b8;padding:20px;">レポートはまだありません</p>';
        return;
    }
    const sorted = [...reports].sort((a, b) =>
        new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );
    sorted.forEach(report => {
        const dateStr = new Date(report.updatedAt || report.createdAt).toLocaleDateString('ja-JP');
        const card = document.createElement('div');
        card.className = 'new-product-admin-card';
        card.innerHTML = `
            <div class="report-header">
                <span class="report-title">${report.title}</span>
                <span class="report-date">📅 ${dateStr}</span>
            </div>
            <div class="report-content">${renderMarkdown(report.content)}</div>
            <div class="report-actions">
                <button onclick="openEdit[TypeName]Modal('${report.id}')">✏️ 編集</button>
                <button onclick="delete[TypeName]('${report.id}')">🗑️ 削除</button>
            </div>`;
        container.appendChild(card);
    });
}
```

### Step 6: CRUD 関数 (app.js)

**追加モーダル:**

```javascript
function openAdd[TypeName]Modal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay category-modal-overlay active';
    modal.innerHTML = `
        <div class="modal" style="max-width: 600px;">
            <div class="modal-header">
                <h2>[icon] [日本語名] 追加</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <form onsubmit="submit[TypeName](event, this)" class="modal-body">
                <div class="form-group">
                    <label>タイトル</label>
                    <input type="text" name="title" required placeholder="レポートタイトル">
                </div>
                <div class="form-group">
                    <label>内容（Markdown対応）</label>
                    <div class="markdown-tabs">
                        <button type="button" class="markdown-tab active" data-mode="edit"
                            onclick="toggleMarkdownPreview(this.closest('.form-group'), 'edit')">編集</button>
                        <button type="button" class="markdown-tab" data-mode="preview"
                            onclick="toggleMarkdownPreview(this.closest('.form-group'), 'preview')">プレビュー</button>
                    </div>
                    <textarea name="content" rows="12" required placeholder="Markdown記法が使えます"></textarea>
                    <div class="markdown-preview" style="display:none;"></div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">キャンセル</button>
                    <button type="submit" class="btn btn-primary">保存</button>
                </div>
            </form>
        </div>`;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}
```

**編集モーダル:**

```javascript
function openEdit[TypeName]Modal(reportId) {
    const report = state.[typeKey].find(r => r.id === reportId);
    if (!report) return;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay category-modal-overlay active';
    // ... 同じ構造、titleとcontentにreportの値をセット
    // form onsubmit="submit[TypeName](event, this, '${reportId}')"
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}
```

**送信処理:**

```javascript
function submit[TypeName](event, form, reportId = null) {
    event.preventDefault();
    const title = form.title.value.trim();
    const content = form.content.value.trim();

    if (reportId) {
        const report = state.[typeKey].find(r => r.id === reportId);
        if (report) {
            report.title = title;
            report.content = content;
            report.updatedAt = new Date().toISOString();
        }
        trackUsage('edit_[typeShort]', '管理者');
    } else {
        state.[typeKey].push({
            id: '[idPrefix]' + Date.now(),
            title, content,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        trackUsage('add_[typeShort]', '管理者');
    }

    saveToFirebase('[typeKey]', state.[typeKey]);
    form.closest('.modal-overlay').remove();
    render[TypeName]();
    renderAdminPanel();
    alert(reportId ? 'レポートを更新しました' : 'レポートを追加しました');
}
```

**削除処理:**

```javascript
function delete[TypeName](reportId) {
    if (!confirm('このレポートを削除しますか？')) return;
    state.[typeKey] = state.[typeKey].filter(r => r.id !== reportId);
    saveToFirebase('[typeKey]', state.[typeKey]);
    render[TypeName]();
    renderAdminPanel();
    trackUsage('delete_[typeShort]', '管理者');
}
```

### Step 7: HTML (index.html)

**レポート表示セクション（約 line 498 付近、既存レポートセクションの後）:**

```html
<div class="order-advisor [sectionClass] sub-report" id="[containerId]">
    <div class="advisor-header sub-header">
        <span class="advisor-icon">[icon]</span>
        <span class="advisor-title">[日本語名]</span>
        <button class="advisor-toggle collapsed" id="[toggleId]">▼</button>
    </div>
    <div class="advisor-content collapsed" id="[contentId]">
        <!-- JSで動的に生成 -->
    </div>
</div>
```

**管理パネルタブ（約 line 436 付近、既存レポートタブの後）:**

```html
<button class="admin-tab" data-tab="[adminTabId]">[icon] [日本語名]</button>
```

### Step 8: renderAdminPanel の max-height 除外設定

`renderAdminPanel()` 内（約 line 3249-3253）で、レポートタブの max-height 制限を除外する条件に追加:

```javascript
if (['trendReports', 'newProductReport', 'productResearch', '[adminTabId]'].includes(state.activeAdminTab)) {
    c.style.maxHeight = 'none';
}
```

## 変数置換テーブル

| 変数 | 説明 | 例 |
|------|------|-----|
| `[typeKey]` | state/Firebase キー | `weeklyAnalysis` |
| `[TypeName]` | PascalCase 関数名 | `WeeklyAnalysis` |
| `[adminTabId]` | data-tab 属性値 | `weeklyAnalysis` |
| `[containerId]` | セクション要素ID | `weeklyAnalysisSection` |
| `[contentId]` | コンテンツ要素ID | `weeklyAnalysisContent` |
| `[toggleId]` | トグルボタンID | `weeklyAnalysisToggle` |
| `[cardClass]` | カードCSS クラス | `weekly-analysis-card` |
| `[sectionClass]` | セクションCSSクラス | `weekly-analysis-section` |
| `[icon]` | 絵文字アイコン | 📈 |
| `[日本語名]` | 表示名 | `週次分析レポート` |
| `[idPrefix]` | ID 接頭辞 | `analysis-` |
| `[typeShort]` | trackUsage用短縮名 | `weekly_analysis` |

## 注意事項

- `saveToFirebase()` は配列をオブジェクトに変換して保存する（id をキーに使用）
- Markdown レンダリングは `renderMarkdown()` を使用（marked.js + Obsidian記法対応）
- モーダルは DOM に動的追加・背景クリックで閉じるパターン
- ソートは常に `updatedAt || createdAt` の降順
