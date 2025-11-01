# ロジック概要

アプリ全体の画面遷移・API・データストアのつながりを俯瞰できるように、主なロジックをまとめています。

## 1. シングルプレイ体験

### 1.1 問題取得までの流れ
- ホーム (`app/page.tsx`) は初回レンダリング時に `/api/categories` と `/api/topics` を `fetch` し、カテゴリ・サブジャンルのプルダウンを構築します。失敗時には UI でエラーを表示します。
- ユーザーが難易度や出題数を選んで「スタート」を押すと、`/api/generate-questions` に POST を送信します。ボディには `category`, `difficulty`, `count`, `title`（サブジャンル）などが含まれます。
- API (`app/api/generate-questions/route.ts`) は Zod で入力を検証し、Supabase `questions` テーブルから条件に合う問題を最大 200 件取得します。足りない場合はカテゴリなしのプールも併用し、シャッフル後に `count` 件を返します。

### 1.2 プレイ中の状態管理
- 取得した問題は `lib/store.tsx` の `QuizProvider` が保持するコンテキストに保存されます。`setQuestions` 呼び出し時に回答配列を `-1` で初期化し、回答ごとに `setAnswer` が選択インデックスを更新します。
- `/play` (`app/play/page.tsx`) は現在の質問インデックスをローカルステートで管理し、各回答後に自動で次の問題へ進みます。進捗バーは回答済み数から算出しています。

### 1.3 結果とフィードバック
- `/result` (`app/result/page.tsx`) ではコンテキストからスコアを計算し、各問題ごとに正誤と解説を表示します。
- `ReportIssueButton` (`components/ReportIssueButton.tsx`) 経由で `/api/questions/report` に POST すると、Supabase `question_reports` テーブルにレポートが追加されます（`app/api/questions/report/route.ts`）。

## 2. 早押し対戦モード

### 2.1 部屋の作成と参加
- `/play/buzzer` (`app/play/buzzer/page.tsx`) では「作成」と「参加」タブを持ち、作成時には `/api/buzzer/matches` を呼んで部屋を生成します。レスポンスには `matchId`, `joinCode`, `hostToken` が含まれ、画面に表示されます。
- 参加者は参加コードと名前を指定して `/api/buzzer/join` を叩き、`playerId` と `token` を受け取ります。いずれも Node.js ランタイムの管理 API で、service role キーを使用します。

### 2.2 進行管理
- ホストが `/api/buzzer/start` を呼ぶと `matches` の状態が `in_progress` に更新され、最初の問題が `match_events` に追加されます。
- 各プレイヤーは `/api/buzzer/answer` で回答し、初回回答者にはロックが設定されます。正解ならスコアが加算され、次の問題が `match_events` に追加されます。不正解や終了時には状態や履歴を更新します。
- クライアントは 1 秒間隔で `/api/buzzer/state` をポーリングし、現在の問題・ロック状態・履歴（終了後）を取得します。効果音やタイプライタ演出は `app/play/buzzer/page.tsx` 内の状態で制御されています。

### 2.3 データベース連携
- 対戦モードは `matches`, `match_players`, `match_questions`, `match_events` テーブルを利用します（`supabase/buzzer.sql`）。部屋作成時に問題一覧を `match_questions` に書き込み、進行に合わせて `match_events` を追記します。

## 3. 公開 API

- `GET /api/categories` / `GET /api/topics` / `GET /api/difficulties`: それぞれ `categories`, `topics`, `difficulties` のマスタを返却します。いずれも Edge または Node.js ランタイムで、レスポンスを `items` プロパティに収めています。
- `GET /api/questions`: 管理画面などで利用するページング付き問題一覧。クエリに応じてカテゴリ・難易度のフィルタが可能です。
- `POST /api/questions/report`: 問題フィードバックの受付。クライアントから渡された問題情報と任意の文脈を JSON で保存します。

## 4. Supabase スキーマ

- `supabase/schema.sql` には `questions` と補助テーブル（`rejected_questions`, `question_reports`, `categories`, `topics`, `difficulties` など）が定義されています。RLS が有効化され、service role での書き込みポリシーを設定済みです。
- `supabase/buzzer.sql` には対戦モード専用のテーブルを定義し、`matches` とそれに紐づくプレイヤー・問題・イベントを管理します。

## 5. 管理 API と自動検証

- 管理系エンドポイント (`app/api/admin/*`) は `ADMIN_TOKEN` ヘッダーで保護されており、service role の Supabase クライアントを使用します。
- 代表的な処理:
  - `app/api/admin/generate-batch/route.ts`: GPT-5 Nano を呼び出して問題をまとめて生成し、検証・重複チェックを行った上で `questions` に保存します。
  - `app/api/admin/validate-question/route.ts`: Wikipedia サマリをエビデンスに自動検証し、必要に応じて修正案を返します。
  - `app/api/admin/validate-question-fix/route.ts`: 検証結果の `fixed` を反映し、問題を更新または却下テーブルに移動します。
  - `app/api/admin/rebalance/route.ts`: カテゴリ別の分布を確認し、不足カテゴリへ再生成を促すためのユーティリティです。
- 詳細なプロンプト設計は `docs/flow_question_generation.md` も参照してください。

## 6. 環境変数と運用

- Supabase 接続には `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` が必須です。
- OpenAI 呼び出しには `API_KEY`（または `OPENAI_API_KEY`）を使用し、クライアントには露出しません。
- 管理 UI から API を呼び出す場合は、`.env` に `NEXT_PUBLIC_ADMIN_TOKEN` を設定するとリクエストヘッダーに付与されます。
