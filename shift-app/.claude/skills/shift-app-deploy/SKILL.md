# shift-app-deploy

Firebase Hosting へのデプロイと動作確認のスキル。

## Trigger

ユーザーが「デプロイ」「公開」「本番反映」「push」などを依頼したとき。

## デプロイ構成

- **Firebase Project ID**: `shift-app-956a0`
- **Hosting**: Firebase Hosting
- **デプロイ対象**: プロジェクトルートディレクトリ（`.` = index.html, app.js, styles.css 等）
- **除外**: `firebase.json`, `**/.*`, `**/node_modules/**`

## デプロイ方法

### 方法1: Git push（推奨・自動デプロイ）

```bash
git add <files>
git commit -m "メッセージ"
git push origin main
```

- `main` ブランチへの push で GitHub Actions が自動実行
- ワークフロー: `.github/workflows/firebase-hosting-merge.yml`
- Firebase Hosting の `live` チャネルにデプロイ

### 方法2: PR 経由（プレビュー）

- PR を作成すると `.github/workflows/firebase-hosting-pull-request.yml` が実行
- プレビューURLが生成される
- マージで本番反映

### 方法3: Firebase CLI（手動・緊急時）

```bash
firebase deploy --only hosting
```

**注意**: セキュリティルール (`firebase_rules.json`) のデプロイは別コマンド:

```bash
firebase deploy --only database
```

## デプロイ後の確認手順

### 1. GitHub Actions の状態確認

```bash
gh run list --limit 3
```

または特定の run を確認:

```bash
gh run view <run-id>
```

### 2. デプロイ反映の確認

- Firebase Hosting のキャッシュにより、反映に **数分かかる** 場合がある
- ブラウザのハードリフレッシュ (Cmd+Shift+R) が必要な場合も

### 3. 本番URL

Firebase Hosting のデフォルトURL（Firebase Console で確認可能）

## トラブルシューティング

### デプロイしたのに反映されない

1. **GitHub Actions の完了を確認**: `gh run list` でステータスが `completed` か確認
2. **キャッシュの問題**: ブラウザキャッシュをクリアして再読み込み
3. **デプロイ対象の確認**: `firebase.json` の `public` が `.` になっているか確認
4. **時間待ち**: CDN への反映に数分かかることがある（過去事例 #S220）

### セキュリティルールが反映されない

- GitHub Actions は **Hosting のみ** デプロイ
- Database ルールは `firebase deploy --only database` で手動デプロイが必要
- または Firebase Console で直接編集

### デプロイが失敗する

1. GitHub Actions のログを確認: `gh run view <run-id> --log`
2. Firebase サービスアカウントの秘密鍵（`FIREBASE_SERVICE_ACCOUNT_SHIFT_APP_956A0`）の有効期限を確認
3. `firebase.json` の構文エラーを確認

## デプロイ前チェックリスト

- [ ] `app.js` に構文エラーがないか（ブラウザコンソールで確認推奨）
- [ ] `index.html` の HTML が閉じタグ漏れなく正しいか
- [ ] `firebase_rules.json` を変更した場合、手動デプロイの準備はできているか
- [ ] 機密情報（APIキー等）がコミットに含まれていないか
- [ ] テスト用の `console.log` が残っていないか
