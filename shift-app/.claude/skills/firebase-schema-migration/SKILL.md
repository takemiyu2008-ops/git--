# firebase-schema-migration

Firebase Realtime Database のスキーマ変更を安全に行うスキル。新しいデータパス追加、セキュリティルール更新、インデックス設定を管理する。

## Trigger

ユーザーが「Firebase設定変更」「データベース構造変更」「セキュリティルール更新」「新しいデータパス追加」などを依頼したとき。また、report-type-builder や request-type-builder スキルの実行中にも自動的に参照される。

## プロジェクト情報

- **Firebase Project ID**: `shift-app-956a0`
- **Database**: Firebase Realtime Database (JSON)
- **ルールファイル**: `firebase_rules.json`（プロジェクトルート）
- **設定ファイル**: `firebase.json`, `.firebaserc`
- **デプロイ**: GitHub Actions 経由で自動デプロイ（main ブランチ push 時）

## 現在のデータベース構造

```
root/
├── shifts/                  # 通常シフト
├── fixedShifts/             # 固定シフト
├── shiftOverrides/          # 固定シフト上書き
├── changeRequests/          # シフト変更申請
├── leaveRequests/           # 有給申請
├── holidayRequests/         # 休日申請
├── employees/               # 従業員マスタ
├── messages/                # 通知メッセージ
├── swapRequests/            # シフト交換依頼
├── dailyEvents/             # 店舗スケジュール
├── dailyChecklist/          # デイリーチェックリスト
├── nonDailyAdvice/          # 非デイリー参考情報
├── trendReports/            # トレンドレポート
├── newProductReports/       # 週次インテリジェンス
├── categoryMemos/           # カテゴリメモ
├── productCategories/       # 商品分類
├── specialEvents/           # 臨時シフト
├── infographics/            # インフォグラフィック（廃止済み・ルールのみ残存）
├── usageStats/              # 利用統計
├── productResearchReports/  # 新規商品調査レポート ※ルール未追加
├── users/                   # ユーザーアカウント（indexOn: status）
└── settings/                # アプリ設定
```

## セキュリティルールのパターン

### 標準パターン（データパス用）

```json
"[pathName]": {
  ".read": "auth != null",
  ".write": "auth != null"
}
```

### インデックス付きパターン（users のように検索が必要な場合）

```json
"[pathName]": {
  ".read": "auth != null",
  ".indexOn": ["[fieldName]"],
  "$child": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

### フォールバックルール（末尾に配置）

```json
"$other": {
  ".read": false,
  ".write": false
}
```

## 実装チェックリスト

### 新しいデータパスを追加する場合

1. **firebase_rules.json にルール追加**
   - `$other` ブロックの **前** に追加すること（重要）
   - 認証必須の標準パターンを使用
   - インデックスが必要なフィールドがあれば `.indexOn` を追加

2. **app.js の loadData() に追加**
   - `refs` 配列にキー名を追加（約 line 679-707）
   - コールバック内にレンダリングトリガーを追加

3. **app.js の state オブジェクトに追加**
   - 初期値として空配列 `[]` を設定（約 line 375-407）

4. **saveToFirebase() の確認**
   - 既存の `saveToFirebase(key, data)` 関数は配列→オブジェクト変換して保存
   - キーとして各要素の `id` フィールドを使用
   - 新しいデータ構造もこのパターンに従うこと

### データ構造を変更する場合

1. **後方互換性を考慮**
   - 既存データが新フィールドを持たない場合のフォールバック処理
   - 例: `r.selectedShifts && r.selectedShifts.length > 0` のように存在チェック

2. **マイグレーション関数の作成（必要に応じて）**
   ```javascript
   function migrate[DataType]() {
       state.[dataKey].forEach(item => {
           if (!item.newField) {
               item.newField = defaultValue;
           }
       });
       saveToFirebase('[dataKey]', state.[dataKey]);
   }
   ```

## 既知の問題と教訓

### Firebase クエリインデックスの問題 (#369)
- `users` パスで `.indexOn: ["status"]` が必要
- インデックスがないと `orderByChild('status')` クエリがクライアント側フィルタになりパフォーマンス低下

### 書き込み権限の問題 (#371)
- `users/$uid` の write ルールが厳しすぎると管理者による承認操作が失敗する
- 解決: `"auth != null"` で認証済みユーザーに書き込み許可

### productResearchReports のルール未追加
- `state.productResearchReports` は app.js で使用されているが、`firebase_rules.json` にルールが未追加
- `$other` のフォールバックで拒否される可能性あり
- 要修正: ルールの追加が必要

## ルール更新時の注意

- Firebase Hosting のデプロイではルールは **自動デプロイされない**
- ルールの反映には Firebase Console での手動設定、または `firebase deploy --only database` が必要
- GitHub Actions の現在のワークフローは Hosting のみデプロイ
