# admin-tab-scaffolder

管理パネルに新しいタブを追加するスキル。HTML タブ要素、renderAdminPanel() 分岐、タブコンテンツ実装を一貫して行う。

## Trigger

ユーザーが「管理画面にタブ追加」「管理パネル新機能」「管理者メニュー追加」などを依頼したとき。

## 現在の管理タブ一覧

index.html 約 line 422-442:

| # | data-tab | 表示名 | レンダリング方式 |
|---|----------|--------|----------------|
| 1 | userApproval | 👤 ユーザー承認 | インライン |
| 2 | shiftChanges | シフト変更 | インライン |
| 3 | shiftSwaps | シフト交換 | インライン |
| 4 | leaveRequests | 有給申請 | インライン |
| 5 | holidayRequests | 休日申請 | インライン |
| 6 | specialEvents | ⚡ 臨時シフト管理 | 関数呼出 |
| 7 | fixedShiftManage | 🔁 固定シフト管理 | 関数呼出 |
| 8 | dailyEvents | 📅 店舗スケジュール | インライン（複雑） |
| 9 | nonDailyAdvice | 📈 非デイリー参考情報 | 関数呼出 |
| 10 | feedbackStats | 📊 フィードバック集計 | 関数呼出 |
| 11 | productCategories | 📂 商品分類管理 | 関数呼出 |
| 12 | trendReports | 📊 コンビニ3社 新商品ヒット予測 | 関数呼出 |
| 13 | newProductReport | 🆕 週次インテリジェンス | 関数呼出 |
| 14 | productResearch | 🔍 新規商品調査レポート | 関数呼出 |
| 15 | usageStats | 📈 利用統計 | 関数呼出 |
| 16 | history | 📜 履歴 | 関数呼出 |
| 17 | employees | 従業員管理 | インライン |
| 18 | broadcast | 全員へ通知 | インライン |
| 19 | settings | 設定 | インライン |

## タブ切替の仕組み

app.js 約 line 3898:

```javascript
document.querySelectorAll('.admin-tab').forEach(t => t.onclick = () => {
    document.querySelectorAll('.admin-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    state.activeAdminTab = t.dataset.tab;
    renderAdminPanel();
});
```

- タブクリック → `state.activeAdminTab` を更新 → `renderAdminPanel()` を呼出
- `renderAdminPanel()` 内の if/else チェーン（約 line 3249-3498）で分岐

## 実装チェックリスト

### Step 1: HTML タブボタン追加 (index.html)

約 line 422-442 の `<div class="admin-tabs">` 内に追加:

```html
<button class="admin-tab" data-tab="[tabId]">[icon] [タブ名]</button>
```

**配置の目安:**
- 申請系 → line 424-427 の後
- データ管理系 → line 428-433 の後
- レポート系 → line 434-436 の後
- ユーティリティ系 → line 437-441 の後

### Step 2: renderAdminPanel() に分岐追加 (app.js)

約 line 3249-3498 の if/else チェーン内の適切な位置に追加。

**方式A: 関数呼出パターン（推奨）**

```javascript
else if (state.activeAdminTab === '[tabId]') {
    render[TabName]Admin(c);
}
```

別途レンダリング関数を定義:

```javascript
function render[TabName]Admin(container) {
    container.innerHTML = `
        <div style="padding: 10px;">
            <h3>[icon] [タブ名]</h3>
            <!-- コンテンツ -->
        </div>`;
}
```

**方式B: インラインパターン（シンプルな場合）**

```javascript
else if (state.activeAdminTab === '[tabId]') {
    c.innerHTML = `<div style="padding: 10px;">...</div>`;
}
```

### Step 3: max-height 除外設定（コンテンツが長い場合）

`renderAdminPanel()` 内（約 line 3249-3253）:

```javascript
if (['trendReports', 'newProductReport', 'productResearch', '[tabId]'].includes(state.activeAdminTab)) {
    c.style.maxHeight = 'none';
}
```

### Step 4: バッジ表示（申請系タブの場合）

バッジ更新処理（約 line 3036-3039）に追加:

```javascript
const [short]Count = state.[dataKey].filter(r => r.status === 'pending').length;
```

タブボタンへのバッジ反映処理にも追加。

## 2つのレンダリングパターン

### パターン1: CRUD管理型（レポート・マスタデータ）

- 「新規追加」ボタン
- カード一覧表示
- 編集・削除ボタン
- → `report-type-builder` スキルを参照

### パターン2: 承認ワークフロー型（申請）

- pending 状態のリスト表示
- 承認・却下ボタン
- バッジカウント
- → `request-type-builder` スキルを参照

### パターン3: 設定・表示型

- 入力フォーム or 統計情報表示
- 独自のレンダリングロジック

## 注意事項

- タブのクリックハンドラは `querySelectorAll('.admin-tab')` で自動バインドされるため、HTML にボタンを追加するだけでイベント処理は不要
- `renderAdminPanel()` のコンテナ `c` は `document.getElementById('adminContent')` で取得される
- 管理パネルは PIN 認証の後ろにあるため、一般ユーザーからはアクセス不可
