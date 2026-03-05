# MedCard AI — セットアップ手順書

## 全体の流れ（合計20〜30分）
1. Gemini APIキーを取得（5分）
2. GitHubにコードをアップロード（10分）
3. Vercelにデプロイ（5分）
4. 動作確認（5分）

---

## STEP 1：Gemini APIキーを取得する

1. https://aistudio.google.com にアクセス
2. Googleアカウントでログイン
3. 左メニューの「Get API key」をクリック
4. 「APIキーを作成」→「新しいプロジェクト」
5. 生成されたキー（`AIza...`）をコピーしてメモ帳に保存

> 無料で使えます（1分あたり15リクエストまで）

---

## STEP 2：GitHubにリポジトリを作る

1. https://github.com にログイン
2. 右上の「+」→「New repository」
3. Repository name: `medcard-ai`
4. Public または Private（どちらでもOK）
5. 「Create repository」をクリック

---

## STEP 3：コードをアップロードする

### 方法A：GitHub のWeb画面から直接アップロード（簡単）

1. 作成したリポジトリを開く
2. 「uploading an existing file」をクリック
3. 以下のファイル構成をまるごとドラッグ＆ドロップ：

```
medcard-app/
├── package.json
├── next.config.js
├── .gitignore
└── src/
    ├── app/
    │   ├── layout.js
    │   ├── page.js
    │   ├── globals.css
    │   └── api/
    │       └── ocr/
    │           └── route.js
    └── components/
        └── MedCardAI.js
```

4. 「Commit changes」をクリック

> ⚠️ `.env.local` はアップロードしないこと（APIキーが漏れます）

---

## STEP 4：Vercelにデプロイする

1. https://vercel.com にアクセス
2. 「Sign up」→「Continue with GitHub」でGitHubアカウントと連携
3. ダッシュボードの「Add New Project」
4. 先ほど作った `medcard-ai` リポジトリを選択
5. 「Import」をクリック
6. **「Environment Variables」セクションで以下を追加：**
   - Name: `GEMINI_API_KEY`
   - Value: STEP1でコピーしたキー（`AIza...`）
7. 「Deploy」をクリック
8. 1〜2分待つ → 完成！

デプロイ完了後、`https://medcard-ai-xxx.vercel.app` のようなURLが発行されます。

---

## STEP 5：動作確認

1. 発行されたURLをブラウザで開く
2. 「📷 画像から生成」タブを選択
3. 教科書の写真をアップロード
4. モードを選択して「✦ 生成する」

---

## トラブルシューティング

### 「GEMINI_API_KEY が設定されていません」と出る
→ Vercelの「Settings」→「Environment Variables」でキーを確認・追加後、再デプロイ

### 「Gemini API エラー: 400」と出る
→ APIキーが間違っている可能性。aistudio.google.com で再確認

### カードが0枚になる
→ OCRテキストタブを確認。テキストが読み取れていない場合、画像が暗い・ぼけている可能性あり

---

## ローカルで開発する場合（任意）

Node.js（v18以上）が必要です。

```bash
cd medcard-app
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開く

`.env.local` の `GEMINI_API_KEY=` の後ろに実際のキーを入れてください。
