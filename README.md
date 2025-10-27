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
-- 1) 基本スキーマ
-- ファイル: supabase/schema.sql の内容を実行

-- 2) 早押し対戦モード用スキーマ
-- ファイル: supabase/buzzer.sql の内容も実行
```

4) 開発起動

```
npm run dev
```

ブラウザで `http://localhost:3000` にアクセスします。

## 構成

- `app/api/generate-questions/route.ts` … Supabase から条件で取得し、シャッフルの上で所定件数返却。
- `app/api/questions/route.ts` … Supabase の質問をページングで返却。
- `app/api/categories/route.ts` … カテゴリー一覧（DBの `public.categories`）を返却。
- `app/api/admin/categories/route.ts` … 管理用カテゴリー作成（service role・Node runtime）。
- `app/api/admin/questions/route.ts` … 管理画面からの一括保存（service role使用・Node runtime）。
- `app/api/buzzer/*` … 早押し対戦モードのAPI群（部屋作成/参加/開始/解答/状態）。
- `lib/supabase.ts` … サーバ用 Supabase クライアント（anon / service）。
- `app/page.tsx` … トップ（ジャンル/難易度/出題数の選択 → 生成 → /play へ）。
- `app/play/page.tsx` … 1問ずつ回答、進捗バー、最後に結果へ。
- `app/play/buzzer/page.tsx` … 早押し対戦画面（ポーリングで同期、効果音、タイプライタ演出）。
- `app/result/page.tsx` … 正答・解説を一覧表示、リスタート。
- `lib/store.tsx` … クイズ状態の簡易ストア（コンテキスト）。
- `lib/prompt.ts` … system/userプロンプトの組み立て。
- `lib/types.ts` … 型定義。
- `lib/buzzer/types.ts` … 対戦モード用の型。
- `lib/buzzer/constants.ts` … 対戦モードのカテゴリ定数（UI用ラベル）。
- `lib/buzzer/audio.ts` … ブラウザでのオーディオ解放ユーティリティ。

## 仕様メモ

- モデルは `gpt-5-nano` 固定。
- APIキーは `process.env.API_KEY`（または `OPENAI_API_KEY`）。クライアントへは一切送信しません。
- 出力は厳格に JSON 配列（各要素: id, prompt, choices(4), answerIndex, explanation?, category, difficulty, source）。
- 依存：Next.js 14 + TypeScript + Tailwind + Zod。

## 注意 / 拡張

- 本番では Edge ルートでは service role を使わず、書き込みは `runtime = 'nodejs'` の管理APIのみで行ってください。
- 参考の管理UI（/admin）は現在は簡易な認可です。必要に応じてAuth連携（Auth.js/Supabase Auth）へ切替可能です。
- ヘッダーの「管理」リンクはローカル環境（`NODE_ENV !== 'production'`）のみ表示します。

## 変更点（最近）

- シングルプレイのジャンル選択をプルダウン化し、DBのカテゴリーを `/api/categories` から取得。
- カテゴリーに「ドラえもん」を追加（`supabase/schema.sql` のシードにも追加済み）。
- 管理APIにカテゴリー作成エンドポイントを追加（`POST /api/admin/categories`）。
- 早押し対戦の問題文エリアに最小3行分の高さを確保してレイアウトのズレを抑制。
- 対戦ページの型・タイマー/オーディオの型周りを整理（`lib/buzzer/*` へ切り出し、TypeScriptエラー解消）。

## 早押し対戦モード（概要）

- スキーマ: `supabase/buzzer.sql` を適用（matches, match_players, match_questions, match_events）。
- フロー: ルーム作成 → 参加 → 開始 → 状態ポーリング → 解答。
- 主なAPI:
  - ルーム作成: `POST /api/buzzer/matches`（body: `{ category, difficulty, questionCount, hostName }`）
  - 参加: `POST /api/buzzer/join`（`{ joinCode, name }` または `{ matchId, name }`）
  - 開始: `POST /api/buzzer/start`（ホストのトークン必要）
  - 解答: `POST /api/buzzer/answer`（プレイヤートークン・インデックス指定）
  - 状態: `GET /api/buzzer/state?matchId=...`

効果音は `app/public/*.mp3` を参照（import不要）。

## カテゴリー管理

- 一覧取得: `GET /api/categories`（`public.categories` から返却）。
- 追加（管理者）: `POST /api/admin/categories` with `x-admin-token`（任意の簡易保護）。
- 既定のカテゴリーは `supabase/schema.sql` のシードを参照（再実行で追加入り）。
