# GPT-5 Nano Quiz (Next.js)

React/Next.js 製のクイズアプリです。Supabase をデータストアに採用し、事前生成した問題や GPT-5 Nano を使った検証フローを管理 API から扱えるようにしています。

## 主な機能

- **シングルプレイ**: ジャンル・サブジャンル・難易度・出題数を選択して `/api/generate-questions` から問題を取得し、1問ずつ回答します。
- **早押し対戦モード**: `/play/buzzer` で部屋作成・参加・解答を行うリアルタイム対戦。`matches` 系テーブルを用いたロック制御と効果音演出を備えています。
- **問題フィードバック**: 結果画面から問題修正リクエストを `/api/questions/report` に送信し、`question_reports` テーブルへ蓄積します。
- **管理 API**: カテゴリ・トピックの登録、問題バッチ生成、検証、自動修正、リバランスなどを `ADMIN_TOKEN` で保護された API 群から実行できます。

## 技術スタック

- Next.js 14 (App Router) + React 18 + TypeScript
- Supabase (PostgreSQL + Storage + Row Level Security)
- Tailwind CSS / カスタム UI コンポーネント
- Zod による入力バリデーション

## ディレクトリ構成

| パス | 説明 |
| --- | --- |
| `app/` | 画面と API ルート。`app/play` 配下にプレイ画面、`app/api` 配下に各種 API |
| `components/` | 再利用可能な UI コンポーネント |
| `lib/` | Supabase クライアント、状態管理、型、対戦モードのヘルパー |
| `docs/` | プロダクト/ロジックに関するドキュメント |
| `supabase/` | 本番/ローカルで適用する SQL スキーマ |
| `data/` | 初期データや検証向けスクリプト (必要に応じて利用) |

## セットアップ

1. 依存関係のインストール
   ```bash
   npm install
   ```
2. `.env` に環境変数を設定
   ```bash
   SUPABASE_URL=...                     # プロジェクトの URL
   SUPABASE_ANON_KEY=...                # anon key (フロント/Edge 用)
   SUPABASE_SERVICE_ROLE_KEY=...        # service role key (管理 API 用)
   ADMIN_TOKEN=...                      # 管理 API への保護トークン
   NEXT_PUBLIC_ADMIN_TOKEN=...          # 開発用: フロントから送る場合のみ
   API_KEY=...                          # OpenAI API key。OPENAI_API_KEY でも可
   # DEBUG_GENERATION=1                 # 任意: バッチ生成で詳細ログを出す
   ```
3. Supabase スキーマを適用
   - 一般クイズ/マスタ類: `supabase/schema.sql`
   - 早押し対戦モード: `supabase/buzzer.sql`
   - 既存問題のリセットが必要な場合は `supabase/clear_questions.sql`
4. 開発サーバーの起動
   ```bash
   npm run dev
   ```
   ブラウザで `http://localhost:3000` を開きます。
5. その他コマンド
   ```bash
   npm run build   # 本番ビルド
   npm run start   # 本番サーバー
   npm run lint    # Lint
   npm run test    # バリデーション関連の Node.js テスト
   ```

## 画面とロジックの流れ

### シングルプレイ
1. `app/page.tsx` でカテゴリ(`/api/categories`)とサブジャンル(`/api/topics`)を取得し、条件を選択。
2. スタートで `/api/generate-questions` を呼び出し、Supabase `questions` テーブルから条件に合う問題をシャッフル抽出します。
3. `lib/store.tsx` のコンテキストに問題と解答状態を保存し、`/play` (`app/play/page.tsx`) で 1 問ずつ回答。
4. `/result` (`app/result/page.tsx`) でスコアと解説を表示し、必要に応じて `ReportIssueButton` 経由でフィードバックを送信。

### 早押し対戦モード
1. `/play/buzzer` (`app/play/buzzer/page.tsx`) から部屋を作成。`POST /api/buzzer/matches` が `matches`/`match_players`/`match_questions` を初期化し、ホストトークンと参加コードを返します。
2. 参加者は `POST /api/buzzer/join` で合流し、トークンを受け取ります。
3. ホストが `POST /api/buzzer/start` を叩くと状態が `in_progress` になり、問題が順番に配信されます。
4. プレイヤーは `POST /api/buzzer/answer` (または `buzz`) を通じて回答。ロック制御とスコア加算が行われ、`/api/buzzer/state` のポーリングで進行状況を共有します。
5. 全問終了後は `state=finished` になり、履歴と最終スコアを表示。

## API サマリ

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/categories` | カテゴリ一覧 (`public.categories`) を返却 |
| GET | `/api/topics` | サブジャンル一覧 (`public.topics`) を返却 |
| GET | `/api/difficulties` | 難易度マスタ (`public.difficulties`) を返却 |
| POST | `/api/generate-questions` | 条件に応じて `questions` から問題を取得 |
| GET | `/api/questions` | 管理/一覧表示用のページング付き問題 API |
| POST | `/api/questions/report` | 問題修正リクエストを `question_reports` に保存 |
| POST | `/api/buzzer/*` | 早押しモードの部屋作成/参加/開始/解答エンドポイント |
| GET | `/api/buzzer/state` | 対戦状態・履歴を取得 |
| POST | `/api/admin/*` | 管理機能 (カテゴリ/トピック登録、バッチ生成、検証等)。`ADMIN_TOKEN` が必要 |

## Supabase テーブル

- `questions`: 4択問題本体。`category`, `difficulty`, `subgenre`, `franchise` などの列を持ちます。
- `categories` / `topics` / `difficulties`: フロントの選択肢を構成するマスタテーブル。
- `question_reports`: ユーザーからの修正リクエスト蓄積テーブル。
- `rejected_questions`: 検証で弾かれた問題の保管先。
- `matches` / `match_players` / `match_questions` / `match_events`: 早押し対戦モードで使用するテーブル群。

各テーブル定義は `supabase/schema.sql` および `supabase/buzzer.sql` を参照してください。

## ドキュメント

- `docs/logic-overview.md`: 画面/API/データベースのロジックを俯瞰した最新資料。
- `docs/flow_question_generation.md`: 問題生成フローの詳細ノート。

## 開発メモ

- モデルは `gpt-5-nano` を想定しています。API キーはサーバーサイドでのみ使用し、クライアントには渡しません。
- Edge ルートで書き込みが必要な場合は Node.js ランタイム (`runtime = 'nodejs'`) を利用してください。
- `/admin` の UI は簡易認証であり、`NODE_ENV !== 'production'` の環境でのみヘッダーにリンクを表示します。
