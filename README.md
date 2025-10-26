# GPT-5 Nano Quiz (Next.js)

React/Next.js クイズアプリのMVP実装です。仕様更新に合わせ、開発から Supabase を利用して問題を配信・保存します。

## セットアップ

1) 依存関係のインストール

```
npm install
```

2) Supabase 環境変数（.env）

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...  # 管理API用（サーバのみ）
# 任意: 管理APIに簡易トークンを付けたい場合
# ADMIN_TOKEN=some-secret
# NEXT_PUBLIC_ADMIN_TOKEN=some-secret   # フロントから渡す場合のみ
```

3) スキーマ作成（Supabase SQL Editor で実行）

```
-- ファイル: supabase/schema.sql の内容を実行
```

4) 開発起動

```
npm run dev
```

ブラウザで `http://localhost:3000` にアクセスします。

## 構成

- `app/api/generate-questions/route.ts` … Supabase から条件で取得し、シャッフルの上で所定件数返却。
- `app/api/questions/route.ts` … Supabase の質問をページングで返却。
- `app/api/admin/questions/route.ts` … 管理画面からの一括保存（service role使用・Node runtime）。
- `lib/supabase.ts` … サーバ用 Supabase クライアント（anon / service）。
- `app/page.tsx` … トップ（ジャンル/難易度/出題数の選択 → 生成 → /play へ）。
- `app/play/page.tsx` … 1問ずつ回答、進捗バー、最後に結果へ。
- `app/result/page.tsx` … 正答・解説を一覧表示、リスタート。
- `lib/store.tsx` … クイズ状態の簡易ストア（コンテキスト）。
- `lib/prompt.ts` … system/userプロンプトの組み立て。
- `lib/types.ts` … 型定義。

## 仕様メモ

- モデルは `gpt-5-nano` 固定。
- APIキーは `process.env.API_KEY`（または `OPENAI_API_KEY`）。クライアントへは一切送信しません。
- 出力は厳格に JSON 配列（各要素: id, prompt, choices(4), answerIndex, explanation?, category, difficulty, source）。
- 依存：Next.js 14 + TypeScript + Tailwind + Zod。

## 注意 / 拡張

- 本番では Edge ルートでは service role を使わず、書き込みは `runtime = 'nodejs'` の管理APIのみで行ってください。
- 参考の管理UI（/admin）は現在は簡易な認可です。必要に応じてAuth連携（Auth.js/Supabase Auth）へ切替可能です。
