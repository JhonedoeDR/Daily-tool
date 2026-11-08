# Daily Tool

個人向けの静的な生活管理アプリです。ビルド工程やアプリ用サーバーはなく、HTML・CSS・ブラウザーJavaScriptをそのまま静的ホスティングに配置します。

## 構成

- `*.html`, `style.css`, 画像: 静的ページと表示素材
- `js/core/`: 共通データ、日付・計算ロジック、ページ共通UI
- `js/pages/`: ページごとの表示と操作
- `js/ui/`: 共通ナビゲーション
- `js/storage/`: IndexedDBを使う画像保存
- `js/services/`: Firebase連携
- `scripts/`: GitHub Actionsから動かすNode.js通知処理とそのテスト
- `sw.js`: オフラインキャッシュとプッシュ通知

ブラウザー内の主データは`localStorage`、ゲーム画像は`IndexedDB`に保存します。Firebaseには外部通知に必要なデータとFCMトークンのみを同期し、Firebase連携コードは同期や通知登録が必要な場合に読み込みます。ローカルデータの形式を変更するときは、既存データを残す移行処理と通知スクリプト側の読み取りを合わせて更新してください。

## 開発・確認

静的ファイルを配信できるローカルサーバーでページを開きます。Service Workerと通知を確認する場合はHTTPS（または`localhost`）が必要です。

通知処理の依存関係は`package.json`と`package-lock.json`で固定しています。

```sh
npm ci
npm test
```

GitHub ActionsはNode.js 24で依存関係を復元し、テスト後に5分間隔の通知チェックを実行します。Firebase Admin SDK用のサービスアカウントはActions Secret `FIREBASE_SERVICE_ACCOUNT`に設定してください。ブラウザー用Firebase設定は`js/services/firebase-sync.js`と`sw.js`で管理します。

静的アセットを追加・移動した場合は、`sw.js`の`ASSETS`も更新し、`CACHE_NAME`を新しい値にします。アプリ内のバックアップ機能でローカルデータを定期的に保存してください。
