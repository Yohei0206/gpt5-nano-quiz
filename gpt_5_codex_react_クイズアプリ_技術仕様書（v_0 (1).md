# GPT‑5 Codex × React クイズアプリ 技術仕様書（v0.1）

最終更新: 2025-10-26
作成者: ChatGPT（仕様ドラフト）

---

## 1. 目的・スコープ
- **目的**: React フロントエンドのクイズアプリを短期間で開発・運用するための実装仕様を提示する。
- **スコープ**:
  - MVP: **`gpt-5-nano` で問題を事前生成し、Supabase(PostgreSQL) に永続化**。配信はDBから行う（= ランタイムは生成しない）。
  - 拡張: 一部ジャンルの品質向上や高度推論が必要な場合のみ管理者用バッチで `gpt‑5‑mini` / `gpt‑5` / `gpt‑5‑reasoning` を利用。ランキング、課金、A/B テスト等。
  - **Codex**: 開発支援（コード生成・修正・CI自動修復）用途で **Codex CLI / Codex Cloud / Agents SDK** を活用（本番出題はDB配信）。

---

## 2. 推奨アーキテクチャ
```
[React(Next.js 14/15 App Router, TS)] ──(HTTPS/Fetch)──> [API層: Next.js Route Handler]
                                               │                 │
                                               │                 ├─ Supabase (PostgreSQL) … 事前生成した問題/履歴/ユーザー
                                               │                 ├─ Supabase Auth … 認証（匿名/メール/OAuth）
                                               │                 ├─ Supabase Edge Functions（任意）… 管理者用バッチ/CRON
                                               │                 └─ OpenAI API (gpt‑5‑nano ほか) … 事前生成バッチ専用

[開発時]  開発者端末/CI ── Codex CLI / Codex Cloud ──(Agents SDK/MCP)──> リポジトリ/CI/CD
```
[React(Next.js 14/15 App Router, TS)] ──(HTTPS/Fetch)──> [API層: Next.js Route Handler or Express]
                                               │                 │
                                               │                 ├─ OpenAI API (gpt‑5‑nano / gpt‑5 / gpt‑5‑reasoning)
                                               │                 ├─ Redis (Upstash 等)  … キャッシュ & レート制御
                                               │                 └─ PostgreSQL (Neon/Supabase/RDS) … 問題/履歴/ユーザー

[開発時]  開発者端末/CI ── Codex CLI / Codex Cloud ──(Agents SDK/MCP)──> リポジトリ/CI/CD
```

### 2.1 フロントエンド（React）
- **Next.js 14/15 (App Router) + TypeScript + Vite(任意)**
- **UI**: Tailwind CSS + shadcn/ui（Card, Button, Dialog, Tabs, Progress 等）
- **状態管理/データ取得**: TanStack Query（SWRでも可）
- **フォーム**: React Hook Form + Zod（スキーマバリデーション）
- **i18n**: next-intl（日本語/英語対応を見据える）
- **ビルド/デプロイ**: Vercel（Edge Runtime対応のRoute Handlers推奨）

### 2.2 バックエンド/API
- **Next.js Route Handlers**（/app/api/**/route.ts）を基本。
- **データ永続化**: Supabase（PostgreSQL）。クライアントSDK or `@supabase/postgrest-js` をサーバ側で使用。
- **事前生成バッチ**: 管理者のみ実行。`gpt‑5‑nano` を呼び出し、生成結果を **JSON検証→重複排除→Supabaseへ挿入**。
  - 実行場所: Supabase Edge Functions（定期CRON）または Next.js の Admin API。
- **配信**: ランタイムでは **DBから問題を取得**（キャッシュ任意）。生成APIは公開しない。
- **レート制御**: 必要に応じてミドルウェア（IP/ユーザー）。
- **認証**: Supabase Auth（匿名→任意でメール/OAuth）。
- **監視**: Sentry（FE/BE）, Supabase Logs, OpenTelemetry（任意）。

### 2.3 開発支援（Codex 活用）（Codex 活用）
- **Codex CLI**: ローカルでコード生成・編集・テスト実行の自動化（/model `gpt‑5-codex` 推奨）
- **Codex Cloud**: リポジトリ連携＋サンドボックスでのバッチ修正/PR提案
- **Agents SDK + MCP**: Codexをツールとして呼び出し、タスク分割・並列実行・自動修復（CI連携）
- **Playwright + Codex**: テスト失敗時にCodexが修正PRを自動提案（Auto‑fix CI）

> **注**: Codexは「開発を加速するエージェント」。本番のクイズ生成は `gpt‑5‑nano`/`gpt‑5-mini`/`gpt‑5`/`gpt‑5‑reasoning` の **Responses/Chat** 経由で実行。

---

## 3. モデル選定ポリシー（生成バッチ）
- **既定（MVP）**: `gpt‑5‑nano`（低コスト・超高速）。出力は必ず **JSON** で受け、Zod/JSON Schemaで厳格検証。
- **品質向上**: 特定ジャンルのみ `gpt‑5‑mini` / `gpt‑5` / `gpt‑5‑reasoning` を **事前生成バッチ**に限定して使用。
- **ランタイム**: 本番配信時はAIを呼ばず **Supabaseから提供**。

---

## 4. データモデル（Supabase / SQL）
> Prismaを併用する場合もありますが、ここでは **Supabase(Postgres) のDDL** を示します。RLSを前提にします。

```sql
-- テーブル: users（Supabase Authのユーザーと紐付け。匿名も許容）
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique, -- supabase.auth.users.id（null可: 匿名）
  name text,
  created_at timestamptz default now()
);

-- テーブル: questions（事前生成ストック）
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  choices text[] not null check (array_length(choices,1)=4),
  answer_index int not null check (answer_index between 0 and 3),
  explanation text,
  category text not null,
  subgenre text,
  difficulty text not null check (difficulty in ('easy','normal','hard')),
  source text not null, -- 'generated:nano' / 'curated:manual' など
  hash text unique not null, -- prompt+choices のハッシュ
  created_at timestamptz default now()
);

-- テーブル: sessions / attempts（履歴）
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  started_at timestamptz default now(),
  ended_at timestamptz,
  score int default 0
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) on delete cascade,
  question_id uuid references public.questions(id),
  chosen_index int not null,
  correct boolean not null,
  time_ms int default 0,
  created_at timestamptz default now()
);

-- RLS（例）
alter table public.sessions enable row level security;
alter table public.attempts enable row level security;

create policy "session_owner" on public.sessions using (
  auth.uid() is null or exists (
    select 1 from public.users u where u.id = sessions.user_id and (u.auth_user_id = auth.uid() or u.auth_user_id is null)
  )
);

create policy "attempts_by_session_owner" on public.attempts using (
  exists (select 1 from public.sessions s where s.id = attempts.session_id)
);
```

---

## 5. API 設計（Next.js Route Handlers）

### 5.1 エンドポイント一覧（公開）
| Method | Path              | 説明                                   |
|-------|-------------------|----------------------------------------|
| GET   | `/api/questions`  | 事前生成済みの問題をページング取得               |
| POST  | `/api/grade`      | 回答判定（正誤判定＋履歴をSupabaseへ記録）        |
| POST  | `/api/feedback`   | 問題への評価/通報を記録                         |

### 5.2 エンドポイント一覧（管理者）
| Method | Path                          | 説明                                   |
|-------|--------------------------------|----------------------------------------|
| POST  | `/api/admin/generate-batch`    | `gpt‑5‑nano`でバッチ生成→検証→Supabase登録 |
| POST  | `/api/admin/rebuild-indexes`   | 重複排除/メタ更新（任意）               |

-------|--------------------------|----------------------------------------|
| POST  | `/api/generate-question` | gptモデルでクイズを生成（バリデーション＆キャッシュ） |
| POST  | `/api/grade`             | 回答判定（サーバー側で正誤判定＋記録）           |
| GET   | `/api/questions`         | 事前生成済みの問題をページング取得               |
| POST  | `/api/feedback`          | 問題への評価/通報を記録                         |

### 5.2 リクエスト/レスポンス例
**POST** `/api/generate-question`
```json
// Request JSON
{
  "genre": "science",
  "difficulty": "normal",
  "count": 5,
  "language": "ja",
  "format": "mcq" // "binary" (○×) も可
}
```
**Response JSON**（配列）
```json
[
  {
    "id": "q_abc123",
    "prompt": "日本で最も高い山は？",
    "choices": ["富士山", "北岳", "奥穂高岳", "間ノ岳"],
    "answerIndex": 0,
    "explanation": "標高3,776m。",
    "category": "geography",
    "difficulty": "normal",
    "source": "generated:nano"
  }
]
```

---

## 6. 事前生成バッチ実装（Node.js / Next.js or Edge Function）
> **注意**: 生成は管理者のみ。公開ランタイムではAIを呼ばない。

```ts
// /app/api/admin/generate-batch/route.ts（管理者のみ）
import { NextRequest } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const Req = z.object({
  genre: z.string(),
  subgenre: z.string().optional(),
  difficulty: z.enum(["easy","normal","hard"]).default("normal"),
  count: z.number().min(1).max(50).default(10),
  language: z.enum(["ja","en"]).default("ja"),
});

export async function POST(req: NextRequest) {
  // 1) 管理者チェック（省略）
  const params = Req.parse(await req.json());

  const system = `あなたは厳密なクイズ作成者です。短く明確、誤解のない日本語で出題します。`;
  const user = `ジャンル:${params.genre}
サブジャンル:${params.subgenre ?? ""}
難易度:${params.difficulty}
言語:${params.language}

要件:
- JSON配列で${params.count}問
- 各要素は {id,prompt,choices[4],answerIndex,explanation,category,subgenre,difficulty,source}`;

  const res = await client.chat.completions.create({
    model: "gpt-5-nano",
    messages: [ { role: "system", content: system }, { role: "user", content: user + "
出力はJSONのみ。" } ],
    temperature: 0.4,
    max_tokens: 220
  });

  const raw = res.choices?.[0]?.message?.content ?? "[]";
  const Item = z.object({
    id: z.string(), prompt: z.string(), choices: z.array(z.string()).length(4),
    answerIndex: z.number().int().min(0).max(3), explanation: z.string().optional(),
    category: z.string(), subgenre: z.string().optional(), difficulty: z.enum(["easy","normal","hard"]), source: z.string()
  });
  const Schema = z.array(Item);
  const items = Schema.parse(JSON.parse(raw));

  const rows = items.map((q) => ({
    prompt: q.prompt,
    choices: q.choices,
    answer_index: q.answerIndex,
    explanation: q.explanation ?? null,
    category: q.category,
    subgenre: q.subgenre ?? null,
    difficulty: q.difficulty,
    source: q.source || "generated:nano",
    hash: crypto.createHash("sha256").update(q.prompt + JSON.stringify(q.choices)).digest("hex"),
  }));

  // 重複除去: 既存hashの取得
  const hashes = rows.map(r => r.hash);
  const { data: existing } = await supabase.from("questions").select("hash").in("hash", hashes);
  const existingSet = new Set((existing ?? []).map(e => e.hash));
  const toInsert = rows.filter(r => !existingSet.has(r.hash));

  if (toInsert.length) {
    const { error } = await supabase.from("questions").insert(toInsert);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ inserted: toInsert.length, skipped: rows.length - toInsert.length }), { status: 200 });
}
```

---\n" + user).digest("hex");
  // TODO: Upstash/Redis から key で取得し、あれば返す

  const completion = await client.chat.completions.create({
    model: "gpt-5-nano",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: 0.4,
    max_tokens: 220
  });

  const raw = completion.choices?.[0]?.message?.content ?? "[]";

  // 厳格バリデーション
  const QuestionSchema = z.object({
    id: z.string(),
    prompt: z.string().max(200),
    choices: z.array(z.string()).length(4),
    answerIndex: z.number().int().min(0).max(3),
    explanation: z.string().max(300).optional(),
    category: z.string(),
    difficulty: z.enum(["easy","normal","hard"]),
    source: z.string()
  });

  const ArraySchema = z.array(QuestionSchema).max(params.count);
  let data;
  try {
    data = ArraySchema.parse(JSON.parse(raw));
  } catch (e) {
    // 再試行（プロンプトに"必ずJSONのみ"を追加）
    const retry = await client.chat.completions.create({
      model: "gpt-5-nano",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user + "\n出力はJSON配列のみ。前後に説明やマークダウンを入れない。" }
      ],
      temperature: 0.3,
      max_tokens: 220
    });
    data = ArraySchema.parse(JSON.parse(retry.choices?.[0]?.message?.content ?? "[]"));
  }

  // TODO: 生成結果に重複がないか検査（prompt+choicesのハッシュで判定）。
  // TODO: モデレーションポリシーに抵触する語句のフィルタリング。
  // TODO: DBへバルクUpsert（Question.hashで一意制約）し、IDを返す。
  // TODO: Upstash/Redis に key でキャッシュ。

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
```

> **代替**: 高品質が必要な一部ルートだけ `model: "gpt-5-mini" | "gpt-5" | "gpt-5-reasoning"` に差し替える（ハイブリッド）。

---

## 7. フロントエンドUI（Next.js + React）
- 配信は `/api/questions` → Supabase から取得。
- UI/状態管理・アクセシビリティは従来どおり。管理者UIに「事前生成バッチ実行」ボタンを追加しても良い。

---

## 8. プロンプト設計ガイド
- **system**: 役割・出力制約（JSONのみ・フォーマット厳守・禁止事項）
- **user**: パラメータ（ジャンル/難易度/言語/形式/出題数）を明示
- **出力フォーマット**（JSON Schema例）
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["id","prompt","choices","answerIndex","category","difficulty","source"],
    "properties": {
      "id": {"type": "string"},
      "prompt": {"type": "string", "maxLength": 200},
      "choices": {"type": "array", "items": {"type": "string"}, "minItems": 4, "maxItems": 4},
      "answerIndex": {"type": "integer", "minimum": 0, "maximum": 3},
      "explanation": {"type": "string"},
      "category": {"type": "string"},
      "difficulty": {"type": "string", "enum": ["easy","normal","hard"]},
      "source": {"type": "string"}
    }
  }
}
```
- **バイアス/安全**: 不適切トピック、誤情報、差別表現、医療/法律助言は避ける指示を常に含める。

---

## 9. エラーハンドリング & リトライ
- ネットワーク/5xx: **指数バックオフ**（例: 0.5s, 1s, 2s, 4s… 最大 4回）
- 429（Rate limit）: `Retry-After` を尊重、キューに再投入
- JSON失敗: 再プロンプトで「JSONのみ」強制、Zodで検証、再失敗時はフォールバック（事前生成問題を返す）
- 監査ログ: 入出力トークン数、レイテンシ、プロンプトハッシュ、モデル名、HTTPステータス

---

## 10. セキュリティ & プライバシ
- **APIキーはサーバー側で保管**（`.env` / Secret Manager）。クライアントへ渡さない。
- **CORS**: 必要なオリジンのみ許可
- **PII**: ユーザーの個人情報をプロンプト/ログに含めない設計
- **データ保護設定**: OpenAIダッシュボードの Data controls を確認し、必要なら送信データの学習利用をオプトアウト
- **Web セキュリティ**: Helmet/CSP、HTTPS強制、依存パッケージの自動監査

---

## 11. テスト & 品質保証
- **ユニットテスト**: Zodスキーマ、採点ロジック、ユーティリティ（Jest/Vitest）
- **E2E**: Playwright（CIでHeadless実行）。主要フロー（出題→回答→結果）を自動化
- **コントラクトテスト**: APIレスポンスのJSON構造検証
- **Codex連携**:
  - 開発: Codex CLI で「テスト追加」「バグ修正パッチ」生成
  - CI: GitHub Actionsでテスト失敗時にCodexに自動タスクを送信し、修正PRを提案させる（Auto‑fix CI）

---

## 12. 運用・デプロイ
- **Vercel**: フロント＋Serverless Route Handlers（Edge推奨）
- **環境変数**: `OPENAI_API_KEY`, `DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET` など
- **監視/アラート**: Sentry / OpenTelemetry / Vercel Analytics
- **コスト管理**: OpenAI BillingのUsage上限設定（MVPはクレジット前払い＋上限監視）
- **ログ/メトリクス**: レイテンシ、トークン使用量、生成失敗率、キャッシュHIT率、1ユーザーあたり呼び出し回数

---

## 13. 事前生成パイプライン（Supabase 運用）
1. 管理画面またはEdge Function/CRONから、ジャンル/難易度/件数を指定してバッチ実行（`gpt‑5‑nano`）。
2. Zod/JSON Schemaで検証 → 既存ハッシュと重複排除。
3. Supabase `questions` に保存（`hash` 一意制約）。
4. フロントは `/api/questions` でページング取得。**ランタイム生成なし**。

---

## 14. 開発者ワークフロー（Codex活用）
- **ローカルでの加速**
  - `npm i -g @openai/codex` → `codex` 起動 → `/model gpt-5-codex` に切替
  - 「このコンポーネントをTailwindで実装」「Playwrightテストを書き直して」などを自然言語で指示
  - Approvals: 最初は `Read Only` → 差分確認 → `Auto` 運用へ移行
- **Codex Cloud + GitHub 連携**
  - 失敗したCIをトリガにCodexが修正案PRを自動作成（Auto‑fix CI）
  - 大規模置換・コード整形・依存更新をバッチでオフロード
- **MCP/Agents**
  - CodexをMCPサーバ化 → Agents SDKから `codex()`／`codex-reply()` をツール呼び出し
  - 「テストを書いて→落ちたら直して→再実行→PR作成」までをワークフロー化

---

## 15. サンプル: フロントからの呼び出し（React + TanStack Query）
```tsx
// app/play/page.tsx (Next.js)
"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

export default function PlayPage() {
  const [params, setParams] = useState({ genre: "general", difficulty: "normal", count: 5, language: "ja", format: "mcq"});

  const { data, isLoading, refetch, isError } = useQuery({
    queryKey: ["quiz", params],
    queryFn: async () => {
      const res = await fetch("/api/generate-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params)
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    }
  });

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">クイズに挑戦</h1>
      <button onClick={() => refetch()} className="px-4 py-2 rounded bg-black text-white">出題する</button>
      {isLoading && <p>生成中...</p>}
      {isError && <p>エラーが発生しました。しばらくして再試行してください。</p>}
      {data && data.map((q: any, i: number) => (
        <div key={q.id} className="border rounded-2xl p-4">
          <div className="font-semibold mb-2">Q{i+1}. {q.prompt}</div>
          <ul className="space-y-2">
            {q.choices.map((c: string, idx: number) => (
              <li key={idx} className="p-2 border rounded cursor-pointer hover:opacity-80">
                {String.fromCharCode(65+idx)}) {c}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

---

## 16. 環境変数例（.env）
```
# OpenAI
OPENAI_API_KEY=sk-********************************

# Supabase
SUPABASE_URL=https://xxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...  # フロント/クライアント用
SUPABASE_SERVICE_ROLE_KEY=eyJ... # サーバ/管理者バッチ用（厳重管理）
```

---

## 17. 主要ユースケースと切替戦略
- **MVP（低コスト/高速）**: `gpt‑5‑nano` で動的生成＋事前生成のハイブリッド
- **品質向上フェーズ**: 苦手ジャンルのみ `gpt‑5-mini` / `gpt‑5` にルーティング
- **高度推論クイズ**: `gpt‑5‑reasoning` をオンデマンドで使用（高コストにつき1問あたりのみ）
- **多言語展開**: `language` パラメータで出題言語を切替。UIは next-intl でローカライズ
- **画像/音声クイズ（拡張）**: gpt‑5‑vision / gpt‑5‑audio を `/api/generate-question-media` として追加

---

## 18. 既知のリスクと対策
- **生成品質の揺らぎ**: Zod検証＋再プロンプト＋人手レビュー（低評価フィードバックで除外）。
- **コスト上振れ**: 事前生成のみ・重複排除・CRONの上限・Usage上限設定。
- **依存の変化（API仕様更新）**: SDKバージョン固定、CIで型崩れ検知、Codex Auto‑fix CIで追従。
- **モデレーション**: 辞書フィルタ＋管理者審査。NGは `archived` フラグで配信除外。
- **スケール**: Supabaseのインデックス/パーティション、キャッシュ（任意）、Edge Functions利用。

---

## 19. 開発チェックリスト
- [ ] OpenAI APIキーを発行し `.env` 設定
- [ ] Billing に前払いクレジット / Usage上限設定
- [ ] Next.js + Tailwind + shadcn/ui + TanStack Query + RHF + Zod セットアップ
- [ ] DB（Postgres）& Prisma マイグレーション
- [ ] `/api/generate-question` 実装（gpt‑5‑nano + Zod 検証 + キャッシュ）
- [ ] E2E（Playwright）基本シナリオ追加
- [ ] Codex CLI 導入（`/model gpt-5-codex` で開発効率化）
- [ ] GitHub Actions + Codex Auto‑fix CI 連携（任意）
- [ ] デプロイ（Vercel）／監視（Sentry）／Usageモニタ

---

## 20. 付録A: 事前生成用スクリプト骨子（Node.js）
```ts
import OpenAI from "openai";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const prisma = new PrismaClient();

const QuestionSchema = z.object({ /* 6章と同じ */ });

export async function generateBatch({ genre, difficulty, count, language }: any) {
  const system = `あなたは厳密なクイズ作成者です...`;
  const user = `ジャンル:${genre} ... count:${count}`;
  const res = await client.chat.completions.create({
    model: "gpt-5-nano",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: 0.4,
    max_tokens: 220
  });
  const items = JSON.parse(res.choices[0].message.content || "[]");
  const valid = z.array(QuestionSchema).parse(items);
  for (const q of valid) {
    const hash = crypto.createHash("sha256").update(q.prompt + JSON.stringify(q.choices)).digest("hex");
    await prisma.question.upsert({
      where: { hash },
      update: {},
      create: { ...q, hash }
    });
  }
}
```

---

## 21. 付録B: ランタイムでCodexを使うか？
- 本仕様では **開発効率化** のために Codex（CLI/Cloud/Agents）を利用。
- 本番クイズ生成は `gpt‑5‑nano` 等を **直接API呼び出し**。Codexは「実行環境でコードを触るエージェント」であり、ユーザーのリクエストに対するクイズ生成には必須ではない。

---

## 22. Q&A（よくある質問）
- **Q. React 以外に必須は？** → サーバ側でOpenAIを呼ぶための **API層（Next.js Route/Express）**、**DB(Postgres+Prisma)**、**キャッシュ/レート制御(Upstash等)**、**認証(Auth.js/Clerk)**、**監視(Sentry)**、**デプロイ先(Vercel等)**。
- **Q. 事前生成と動的生成はどちらが良い？** → MVPは動的に`gpt‑5‑nano`、徐々に事前生成も導入する**ハイブリッド**がおすすめ。
- **Q. `gpt‑5‑codex` は必須？** → いいえ。開発支援には有効だが、出題APIは `gpt‑5‑nano/mini/5/5‑reasoning` でOK。
- **Q. コスト最適化は？** → `nano`優先、キャッシュ・レート制御、バッチ事前生成、Usage上限設定、短いプロンプト/出力、重い問のみ上位モデルにフォールバック。

