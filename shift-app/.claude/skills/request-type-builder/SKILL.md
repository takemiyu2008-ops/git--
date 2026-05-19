# request-type-builder

申請タイプ追加スキル。既存の changeRequests / swapRequests / leaveRequests / holidayRequests パターンに従い、新しい申請タイプを追加する。

## Trigger

ユーザーが「新しい申請機能」「残業申請追加」「早退申請追加」「申請タイプ追加」などを依頼したとき。

## 既存申請タイプ（参考パターン）

| タイプ | state key | Firebase path | アイコン | admin tab ID | ユーザーボタンID |
|--------|-----------|---------------|----------|-------------|----------------|
| シフト変更 | `changeRequests` | `changeRequests` | 🔄 | `shiftChanges` | `requestChangeBtn` |
| シフト交換 | `swapRequests` | `swapRequests` | 🤝 | `shiftSwaps` | `shiftSwapBtn` |
| 有給申請 | `leaveRequests` | `leaveRequests` | 🏖️ | `leaveRequests` | `requestLeaveBtn` |
| 休日申請 | `holidayRequests` | `holidayRequests` | 🏠 | `holidayRequests` | `requestHolidayBtn` |

## 共通データ構造

全申請タイプは以下の共通フィールドを持つ:

```javascript
{
    id: Date.now().toString(),
    status: 'pending',       // pending | approved | rejected
    createdAt: new Date().toISOString(),
    // 承認時に追加:
    approvedAt: '',          // ISO timestamp
    processedBy: '',         // 処理した管理者名
    // 却下時に追加:
    rejectedAt: '',          // ISO timestamp
    // ... タイプ固有のフィールド
}
```

## 実装チェックリスト

### Step 1: State 定義 (app.js)

`state` オブジェクト（約 line 375-407）に配列を追加:

```javascript
[requestKey]: [], // [日本語名]
```

`loadData()` の `refs` 配列（約 line 679-707）に追加:

```javascript
const refs = ['shifts', ..., '[requestKey]'];
```

### Step 2: Firebase セキュリティルール (firebase_rules.json)

```json
"[requestKey]": {
  ".read": "auth != null",
  ".write": "auth != null"
}
```

### Step 3: 申請送信関数 (app.js)

```javascript
function add[TypeName]Request(data) {
    const request = {
        id: Date.now().toString(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        ...data
    };
    state.[requestKey].push(request);
    saveToFirebase('[requestKey]', state.[requestKey]);
    trackUsage('request_[typeShort]', data.applicant || data.name);

    // 管理者への通知メッセージ
    const title = '[icon] [日本語名]';
    const content = `${data.applicant || data.name}さんから[日本語名]がありました。\n...`;
    state.messages.push({
        id: Date.now().toString() + '_admin',
        to: '管理者',
        from: data.applicant || data.name,
        title, content,
        createdAt: new Date().toISOString(),
        read: false
    });
    saveToFirebase('messages', state.messages);
}
```

### Step 4: フォームハンドラ (app.js)

イベントリスナー設定（約 line 4192-4291 付近の既存ハンドラの後）:

```javascript
document.getElementById('[formId]').onsubmit = e => {
    e.preventDefault();
    const applicant = document.getElementById('[applicantSelectId]').value;
    const data = {
        applicant,
        // ... タイプ固有のフィールドを収集
        reason: document.getElementById('[reasonId]').value.trim()
    };
    // バリデーション
    add[TypeName]Request(data);
    closeModal(document.getElementById('[modalOverlayId]'));
    document.getElementById('[formId]').reset();
    alert('[日本語名]を送信しました');
};
```

### Step 5: モーダル HTML (index.html)

既存モーダル（約 line 749-914）の後に追加:

```html
<div class="modal-overlay" id="[modalOverlayId]">
    <div class="modal">
        <div class="modal-header">
            <h2 class="modal-title">[icon] [日本語名]</h2>
            <button class="modal-close" id="[modalCloseId]">×</button>
        </div>
        <form id="[formId]" class="modal-body">
            <div class="form-group">
                <label for="[applicantSelectId]">申請者名</label>
                <select id="[applicantSelectId]" required></select>
            </div>
            <!-- タイプ固有のフォームフィールド -->
            <div class="form-group">
                <label for="[reasonId]">理由</label>
                <textarea id="[reasonId]" placeholder="例：..." rows="3" required></textarea>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" id="[cancelBtnId]">キャンセル</button>
                <button type="submit" class="btn btn-primary">申請</button>
            </div>
        </form>
    </div>
</div>
```

### Step 6: ユーザー向けボタン (index.html)

既存の申請ボタン群（約 line 32-37）に追加:

```html
<button id="[userBtnId]" class="btn btn-secondary">
    [icon] [日本語名]
</button>
```

ボタンのクリックハンドラ（app.js 約 line 3949-4014 付近）:

```javascript
document.getElementById('[userBtnId]').onclick = () => {
    // 申請者セレクトの選択肢を更新
    populateEmployeeSelect('[applicantSelectId]');
    document.getElementById('[modalOverlayId]').classList.add('active');
};
```

### Step 7: 管理パネルタブ (index.html)

管理タブ（約 line 422-442）に追加:

```html
<button class="admin-tab" data-tab="[adminTabId]">[icon] [日本語名]</button>
```

### Step 8: 管理パネルレンダリング (app.js)

`renderAdminPanel()` の if/else チェーン（約 line 3280-3498）に追加:

```javascript
else if (state.activeAdminTab === '[adminTabId]') {
    const reqs = state.[requestKey].filter(r => r.status === 'pending');
    if (!reqs.length) {
        c.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px;">保留中の申請はありません</p>';
        return;
    }
    reqs.forEach(r => {
        const card = document.createElement('div');
        card.className = 'request-card';
        card.innerHTML = `
            <div class="request-info">
                <h4>[icon] ${r.applicant || r.name} - [日本語名]</h4>
                <!-- タイプ固有の情報表示 -->
                <p>理由: ${r.reason}</p>
            </div>
            <div class="request-actions">
                <button class="btn btn-success btn-sm" onclick="approveRequest('[typeId]','${r.id}')">承認</button>
                <button class="btn btn-danger btn-sm" onclick="rejectRequest('[typeId]','${r.id}')">却下</button>
            </div>`;
        c.appendChild(card);
    });
}
```

### Step 9: 承認処理 (app.js)

`approveRequest()` 関数内（約 line 2713-2967）に分岐を追加:

```javascript
else if (type === '[typeId]') {
    const r = state.[requestKey].find(x => x.id === id);
    if (r) {
        r.status = 'approved';
        r.approvedAt = new Date().toISOString();
        r.processedBy = processedBy;
        // タイプ固有の承認後処理（シフトの変更等）
        saveToFirebase('[requestKey]', state.[requestKey]);
    }
}
```

### Step 10: 却下処理 (app.js)

`rejectRequest()` 関数内（約 line 2970-2997）に分岐を追加:

```javascript
else if (type === '[typeId]') {
    const r = state.[requestKey].find(x => x.id === id);
    if (r) {
        r.status = 'rejected';
        r.rejectedAt = new Date().toISOString();
        r.processedBy = processedBy;
        saveToFirebase('[requestKey]', state.[requestKey]);
    }
}
```

### Step 11: バッジカウント (app.js)

バッジ更新処理（約 line 3036-3039）に追加:

```javascript
const [typeShort]Count = state.[requestKey].filter(r => r.status === 'pending').length;
```

タブのバッジ表示処理にも追加すること。

### Step 12: モーダル開閉ハンドラ (app.js)

```javascript
document.getElementById('[modalCloseId]').onclick = () => closeModal(document.getElementById('[modalOverlayId]'));
document.getElementById('[cancelBtnId]').onclick = () => closeModal(document.getElementById('[modalOverlayId]'));
```

## 変数置換テーブル

| 変数 | 説明 | 例 |
|------|------|-----|
| `[requestKey]` | state/Firebase キー | `overtimeRequests` |
| `[TypeName]` | PascalCase 関数名 | `Overtime` |
| `[typeId]` | approveRequest/rejectRequest の type 引数 | `overtime` |
| `[typeShort]` | trackUsage 用短縮名 | `overtime` |
| `[adminTabId]` | data-tab 属性値 | `overtimeRequests` |
| `[icon]` | 絵文字アイコン | ⏰ |
| `[日本語名]` | 表示名 | `残業申請` |
| `[formId]` | フォーム要素ID | `overtimeForm` |
| `[modalOverlayId]` | モーダルオーバーレイID | `overtimeModalOverlay` |
| `[modalCloseId]` | 閉じるボタンID | `overtimeModalClose` |
| `[cancelBtnId]` | キャンセルボタンID | `overtimeCancelBtn` |
| `[applicantSelectId]` | 申請者セレクトID | `overtimeApplicant` |
| `[reasonId]` | 理由テキストエリアID | `overtimeReason` |
| `[userBtnId]` | ユーザー向けボタンID | `requestOvertimeBtn` |

## 注意事項

- 有給申請・休日申請はシフト選択UI（`getEmployeeShiftsForPeriod()`）を使用。新タイプでもシフト連携が必要な場合はこのパターンを参考にする
- 承認時にシフトデータを変更する場合は `saveToFirebase('shifts', state.shifts)` も忘れずに
- 通知メッセージは `state.messages` に追加して `saveToFirebase('messages', state.messages)` で保存
- `closeModal()` は既存のユーティリティ関数を使用
- `populateEmployeeSelect()` で従業員セレクトボックスの選択肢を動的生成
