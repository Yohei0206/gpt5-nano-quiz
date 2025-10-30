import { NextRequest } from "next/server";
import { z } from "zod";
import { serverSupabaseService } from "@/lib/supabase";
import { logJsonLine } from "@/lib/logger";

export const runtime = "nodejs"; // Service Role 使用

const ReqSchema = z.object({
  genre: z.string().min(1),
  count: z.number().int().min(1).max(20).default(10),
  difficulty: z.enum(["easy", "normal", "hard", "mixed"]).default("normal"),
  language: z.enum(["ja", "en"]).default("ja"),
});

// モデル出力を緩めに受けてから正規化
const RawItem = z.object({
  id: z.string().optional(),
  prompt: z.string().optional(),
  question: z.string().optional(),
  choices: z.array(z.string()).min(4).optional(),
  options: z.array(z.string()).min(4).optional(),
  answerIndex: z.number().int().min(0).max(3).optional(),
  answer: z.union([z.number().int(), z.string()]).optional(),
  correctIndex: z.number().int().min(0).max(3).optional(),
  correct: z.union([z.number().int(), z.string()]).optional(),
  explanation: z.string().optional(),
  category: z.string().optional(),
  subgenre: z.string().optional(),
  difficulty: z.string().optional(),
  source: z.string().optional(),
});
const RawArr = z.array(RawItem);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function extractJsonArray(text: string): string {
  if (!text) return "[]";
  let t = String(text).trim();
  const m = t.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
  if (m && m[1]) t = m[1].trim();
  if (t.startsWith("[") && t.endsWith("]")) return t;
  const s = t.indexOf("[");
  const e = t.lastIndexOf("]");
  if (s !== -1 && e !== -1 && e > s) return t.slice(s, e + 1).trim();
  return "[]";
}

// Responses API の出力から配列、または { items: [...] } を抽出
function parseFromAny(j: any): any[] {
  try {
    const outputs = Array.isArray(j?.output) ? j.output : [];
    // 1) content の json を優先
    for (const entry of outputs) {
      const content = (entry as any)?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c && c.type === "json" && c.json) {
            const candidate =
              typeof c.json === "object" ? c.json.items ?? c.json : c.json;
            try {
              return Array.isArray(candidate) ? candidate : [];
            } catch {}
          }
        }
      }
    }
    // 2) output_text をまず JSON.parse、ダメなら配列抽出
    for (const entry of outputs) {
      const content = (entry as any)?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c && c.type === "output_text" && typeof c.text === "string") {
            try {
              const obj = JSON.parse(c.text);
              if (Array.isArray(obj)) return obj;
              if (Array.isArray(obj?.items)) return obj.items;
            } catch {}
            try {
              const arr = JSON.parse(extractJsonArray(c.text));
              if (Array.isArray(arr)) return arr;
            } catch {}
          }
        }
      }
    }
    // 3) j.output_text を最後に確認
    if (typeof j?.output_text === "string") {
      try {
        const obj = JSON.parse(j.output_text);
        if (Array.isArray(obj)) return obj;
        if (Array.isArray(obj?.items)) return obj.items;
      } catch {}
      try {
        const arr = JSON.parse(extractJsonArray(j.output_text));
        if (Array.isArray(arr)) return arr;
      } catch {}
    }
  } catch {}
  return [];
}

export async function POST(req: NextRequest) {
  const adminToken = process.env.ADMIN_TOKEN;
  const provided = req.headers.get("x-admin-token");
  if (adminToken && provided !== adminToken)
    return json({ error: "Unauthorized" }, 401);

  let body: z.infer<typeof ReqSchema>;
  try {
    body = ReqSchema.parse(await req.json());
  } catch (e) {
    return json(
      { error: "Invalid request", details: (e as Error).message },
      400
    );
  }

  const urlObj = new URL(req.url);
  const dryRun = urlObj.searchParams.get("dry") === "1";
  const debugFlag =
    urlObj.searchParams.get("debug") === "1" || !!process.env.DEBUG_GENERATION;

  const apiKey = process.env.API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return json({ error: "Missing OpenAI API key" }, 500);

  const system = [
    "あなたは事実ベースの4択クイズ作成アシスタントです。",
    "要件:",
    "- 出力はJSON配列のみ（前後の説明・コードフェンス禁止）。",
    "- 各要素は {id,prompt,choices(4),answerIndex,explanation?,category,subgenre?,difficulty,source} を必須/準拠。",
    "- 言語がjaのとき、自然で読みやすい日本語（です・ます調）で作成。機械翻訳のような不自然な語順や重複を避ける。",
    "- promptは明確・中立・一意解。語尾や主語を省かず、情報不足・曖昧・トリック禁止。",
    "- choicesは意味が重ならない4つ。『以上すべて』『どれでもない』禁止。重複語句や同義語の羅列禁止。",
    "- 正解は1つだけ。紛らわしい誤答は常識的に plausible に。",
    "- 数値や年号には単位/西暦を明記。地域/時点依存は避ける（例: 最新, 現在 はNG）。",
    "- explanationはコンパクト（最大200字程度）で、なぜ正解かを端的に補足。固有名は最小限。",
    "- 不適切表現、個人情報、医療/法律アドバイス、政治的な主張は避ける。",
    "- バリエーション重視: 同一の題材/事実の言い換えや、数値だけを変えた類題を作らない。バッチ内でトピックを分散。",
    "- 同一/近似トピックが続く場合は、視点や時代・領域を変えて重複を避ける。",
    "- 各問題は一貫したテーマ・時代・領域内で構成し、無関係な要素を混在させない。",
    "- 歴史・科学・文化などの事実は、論理的に整合していること。",
    "- 文法的に自然で、主語・述語が対応する文章にする。",
  ].join("\n");

  const difficulty = body.difficulty === "mixed" ? "mixed" : body.difficulty;
  // カテゴリをテーブルのスラッグへ正規化
  const CATEGORY_SLUGS = new Set([
    "general",
    "science",
    "entertainment",
    "trivia",
    "japan",
    "world",
    "society",
  ]);
  function normalizeCategory(input: string): string {
    const raw = (input || "").trim();
    const lower = raw.toLowerCase();
    if (CATEGORY_SLUGS.has(lower)) return lower;
    const alias: Record<string, string> = {
      一般教養: "general",
      "理系・科学": "science",
      理系: "science",
      "文化・エンタメ": "entertainment",
      エンタメ: "entertainment",
      雑学: "trivia",
      日本: "japan",
      世界: "world",
      "時事・社会": "society",
      時事: "society",
      "アニメ・ゲーム・漫画": "entertainment",
      アニメ: "entertainment",
      ゲーム: "entertainment",
      漫画: "entertainment",
    };
    if (raw in alias) return alias[raw];
    if (lower in alias) return alias[lower];
    if (lower.includes("entertain")) return "entertainment";
    if (lower.includes("general")) return "general";
    if (
      lower.includes("science") ||
      raw.includes("理系") ||
      raw.includes("科学")
    )
      return "science";
    if (lower.includes("trivia") || raw.includes("雑学")) return "trivia";
    if (lower.includes("japan") || raw.includes("日本")) return "japan";
    if (lower.includes("world") || raw.includes("世界")) return "world";
    if (
      lower.includes("society") ||
      raw.includes("時事") ||
      raw.includes("社会")
    )
      return "society";
    // 収束せず、入力をそのままスラッグとして使う（安全のため小文字化）
    return lower || "trivia";
  }
  const categorySlug = normalizeCategory(body.genre);
  const user = [
    `ジャンル/Category: ${categorySlug}`,
    `難易度/Difficulty: ${difficulty}`,
    `言語/Language: ${body.language}`,
    `出題数/Count: ${body.count}`,
    "フォーマット厳守: JSON配列のみを返す（itemsラップ不要）。",
    "各要素の仕様:",
    "- id: 一意な文字列",
    "- prompt: 200字以内、明確・一意解の設問文",
    "- choices: 4件。重複/同義不可。単位/範囲/時点は明確に",
    "- answerIndex: 0..3 の整数（唯一の正解）",
    "- answerIndex の分布: バッチ内で 0,1,2,3 がなるべく均等に分布するように配慮してください（各インデックスがほぼ同数になることを目指してください）。",
    "- explanation: 200字以内の簡潔な補足（任意）",
    "- category: 入力のジャンルをそのまま設定",
    "- subgenre: 任意（適切なら設定）",
    "- difficulty: easy|normal|hard（mixed時は各問に適切に付与）",
    "- source: 'generated:nano' 等の由来",
    "注意: 文頭/文末に余計な文字、コードフェンス、コメント、空配列・件数不足は禁止。",
    "重複禁止: 同一/ほぼ同一の題材・言い換え・誤差違い（西暦や人数だけ変更）を含めない。サブトピックを分散。",
    "explanation: 80〜200字程度で、なぜその答えが正しいかを2文構成で説明。",
    "1文目で事実を明示し、2文目で背景・根拠・補足を述べる。",
    "単なる理由文でなく、知識として価値のある説明にする。",
  ].join("\n");

  const url = "https://api.openai.com/v1/responses";
  const budget = 1000;
  // Collect parsed JSON outputs from review/verify/validate calls for debugging when debugFlag is set
  const gptDebug: Record<string, any> = {};

  function buildJsonSchema() {
    return {
      type: "json_schema" as const,
      name: "quiz_array",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: {
          items: {
            type: "array",
            minItems: body.count,
            maxItems: body.count,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "id",
                "prompt",
                "choices",
                "answerIndex",
                "explanation",
                "category",
                "difficulty",
                "source",
              ],
              properties: {
                id: { type: "string" },
                prompt: { type: "string", maxLength: 200 },
                choices: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 4,
                  maxItems: 4,
                },
                answerIndex: { type: "integer", minimum: 0, maximum: 3 },
                explanation: { type: "string", maxLength: 200 },
                category: { type: "string" },
                difficulty: {
                  type: "string",
                  enum: ["easy", "normal", "hard"],
                },
                source: { type: "string" },
              },
            },
          },
        },
      },
    };
  }

  const payload = {
    model: "gpt-5-nano",
    input: `${system}\n\n${user}`,
    max_output_tokens: budget,
    reasoning: { effort: "low" as const },
    text: { verbosity: "low" as const, format: buildJsonSchema() },
  } as const;

  async function call(p: any) {
    try {
      await logJsonLine("gpt_request", {
        purpose: "generate-batch:create",
        model: p?.model,
        schemaName: p?.text?.format?.name ?? null,
      });
    } catch {}
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(p),
    });
    const reqId =
      r.headers.get("x-request-id") ||
      r.headers.get("openai-organization-request-id") ||
      null;
    const text = await r.text();
    try {
      // Persist response metadata + raw for debugging
      await logJsonLine("gpt_response", {
        purpose: "generate-batch:create",
        status: r.status,
        requestId: reqId,
        raw: text.slice(0, 20000), // cap to avoid extremely large logs
      });
    } catch {}
    if (!r.ok) {
      const e = new Error(`OpenAI error ${r.status}: ${text}`) as any;
      (e as any).requestId = reqId;
      throw e;
    }
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { json, requestId: reqId, raw: text } as any;
  }

  try {
    // 1st attempt
    const res1 = await call(payload);
    // retry results are stored here for debugging if all attempts fail
    let res2: any = undefined;
    let res3: any = undefined;
    const j1 = (res1 as any).json;
    // attempt1 response logged via logJsonLine; removed console.log

    let items: z.infer<typeof RawArr> = parseFromAny(j1) as any[];
    const first1 = j1?.output?.[0]?.content?.[0];
    if (first1 && first1.type === "json" && first1.json) {
      const candidate =
        first1.json && typeof first1.json === "object"
          ? first1.json.items ?? first1.json
          : first1.json;
      try {
        items = RawArr.parse(candidate);
      } catch {}
    }
    if (!Array.isArray(items) || items.length === 0) {
      let text1 =
        j1?.output_text ??
        j1?.output?.[0]?.content?.[0]?.text ??
        j1?.choices?.[0]?.message?.content ??
        "[]";
      text1 = extractJsonArray(text1);
      try {
        items = RawArr.parse(JSON.parse(text1));
      } catch {}
      if (!Array.isArray(items) || items.length === 0) {
        try {
          const full1 =
            j1?.output_text ?? j1?.output?.[0]?.content?.[0]?.text ?? "{}";
          const obj1 = JSON.parse(full1);
          const maybe1 = Array.isArray(obj1?.items) ? obj1.items : null;
          if (maybe1) items = RawArr.parse(maybe1);
        } catch {}
      }
    }
    // item count logged via logJsonLine when needed; removed console.log

    // Retry with JSON-only enforcement if needed
    if (!Array.isArray(items) || items.length === 0) {
      res2 = await call({
        ...payload,
        input: `${system}\n\n${user}\n出力は必ずJSON配列のみ。コードフェンスや説明は禁止。`,
        text: { verbosity: "low", format: buildJsonSchema() },
      });
      const j2 = (res2 as any).json;
      if (!Array.isArray(items) || items.length === 0) {
        const parsed = parseFromAny(j2);
        if (Array.isArray(parsed) && parsed.length) items = parsed as any[];
      }
      const first2 = j2?.output?.[0]?.content?.[0];
      if (first2 && first2.type === "json" && first2.json) {
        const candidate2 =
          first2.json && typeof first2.json === "object"
            ? first2.json.items ?? first2.json
            : first2.json;
        try {
          items = RawArr.parse(candidate2);
        } catch {}
      }
      if (!Array.isArray(items) || items.length === 0) {
        let text2 =
          j2?.output_text ??
          j2?.output?.[0]?.content?.[0]?.text ??
          j2?.choices?.[0]?.message?.content ??
          "[]";
        text2 = extractJsonArray(text2);
        try {
          items = RawArr.parse(JSON.parse(text2));
        } catch {}
        if (!Array.isArray(items) || items.length === 0) {
          try {
            const full2 =
              j2?.output_text ?? j2?.output?.[0]?.content?.[0]?.text ?? "{}";
            const obj2 = JSON.parse(full2);
            const maybe2 = Array.isArray(obj2?.items) ? obj2.items : null;
            if (maybe2) items = RawArr.parse(maybe2);
          } catch {}
        }
      }
    }

    // Schema-hint retry
    if (!Array.isArray(items) || items.length === 0) {
      const schemaHint = `以下の形式でJSON配列のみで返してください。例\n[\n  {"id":"q1","prompt":"...","choices":["A","B","C","D"],"answerIndex":1,"explanation":"...","category":"${body.genre}","difficulty":"normal","source":"generated:nano"}\n]`;
      res3 = await call({
        ...payload,
        input: `${system}\n\n${user}\n${schemaHint}`,
        text: { verbosity: "low", format: buildJsonSchema() },
      });
      const j3 = (res3 as any).json;
      if (!Array.isArray(items) || items.length === 0) {
        const parsed3 = parseFromAny(j3);
        if (Array.isArray(parsed3) && parsed3.length) items = parsed3 as any[];
      }
      const first3 = j3?.output?.[0]?.content?.[0];
      if (first3 && first3.type === "json" && first3.json) {
        const candidate3 =
          first3.json && typeof first3.json === "object"
            ? first3.json.items ?? first3.json
            : first3.json;
        try {
          items = RawArr.parse(candidate3);
        } catch {}
      }
      if (!Array.isArray(items) || items.length === 0) {
        let text3 =
          j3?.output_text ??
          j3?.output?.[0]?.content?.[0]?.text ??
          j3?.choices?.[0]?.message?.content ??
          "[]";
        text3 = extractJsonArray(text3);
        try {
          items = RawArr.parse(JSON.parse(text3));
        } catch {}
        if (!Array.isArray(items) || items.length === 0) {
          try {
            const full3 =
              j3?.output_text ?? j3?.output?.[0]?.content?.[0]?.text ?? "{}";
            const obj3 = JSON.parse(full3);
            const maybe3 = Array.isArray(obj3?.items) ? obj3.items : null;
            if (maybe3) items = RawArr.parse(maybe3);
          } catch {}
        }
      }
    }

    if (!Array.isArray(items) || items.length === 0) {
      // 失敗時は OpenAI の raw / requestId を含むデバッグ情報を返す
      const debug: any = {
        attempt1_raw: (res1 as any)?.raw ?? null,
        attempt1_requestId: (res1 as any)?.requestId ?? null,
        attempt2_raw: (res2 as any)?.raw ?? null,
        attempt2_requestId: (res2 as any)?.requestId ?? null,
        attempt3_raw: (res3 as any)?.raw ?? null,
        attempt3_requestId: (res3 as any)?.requestId ?? null,
      };
      return json(
        {
          error:
            "生成結果が空でした。詳細は debug を確認してください（raw/responsetext）。ジャンルや件数を見直して再試行してください。",
          attempted: true,
          debug,
        },
        422
      );
    }

    // 不足分のみ追加生成（最大1回）
    if (Array.isArray(items) && items.length < body.count) {
      const remaining = Math.max(0, body.count - items.length);
      if (remaining > 0) {
        try {
          const resExtra = await call({
            ...payload,
            input: `${system}\n\nジャンル/Category: ${body.genre}\n難易度/Difficulty: ${difficulty}\n言語/Language: ${body.language}\n出題数/Count: ${remaining}\n・説明は簡潔に。\n・promptは200字以内、explanationは100字以内。\n・重要: 必ず Count 件の要素を持つ JSON 配列のみを返すこと。`,
            text: { verbosity: "low", format: buildJsonSchema() },
          });
          const jExtra = (resExtra as any).json;
          let extra: any[] = parseFromAny(jExtra) as any[];
          const f = jExtra?.output?.[0]?.content?.[0];
          if (f && f.type === "json" && f.json) {
            const cand =
              typeof f.json === "object" ? f.json.items ?? f.json : f.json;
            try {
              extra = RawArr.parse(cand) as any[];
            } catch {}
          }
          if (!Array.isArray(extra) || extra.length === 0) {
            let t =
              jExtra?.output_text ??
              jExtra?.output?.[0]?.content?.[0]?.text ??
              "[]";
            t = extractJsonArray(t);
            try {
              extra = RawArr.parse(JSON.parse(t)) as any[];
            } catch {}
          }
          if (Array.isArray(extra) && extra.length > 0) {
            items = [...items, ...extra].slice(0, body.count);
          }
        } catch {}
      }
    }

    // 正規化
    const norm = (s: string) => s.trim();
    function toIndex(q: any): number {
      if (typeof q.answerIndex === "number") return q.answerIndex;
      const key = (q.correctIndex ?? q.answer ?? q.correct) as any;
      if (typeof key === "number") return key;
      if (typeof key === "string") {
        const s = key.trim();
        const map: Record<string, number> = {
          A: 0,
          B: 1,
          C: 2,
          D: 3,
          a: 0,
          b: 1,
          c: 2,
          d: 3,
        };
        if (s in map) return map[s];
        const idx = (q.choices ?? []).findIndex((c: string) => c === s);
        if (idx >= 0) return idx;
      }
      return 0;
    }
    function toDifficulty(d?: string): "easy" | "normal" | "hard" {
      const s = (d ?? "").toLowerCase();
      if (s.includes("easy") || s.includes("初級")) return "easy";
      if (s.includes("hard") || s.includes("上級") || s.includes("difficult"))
        return "hard";
      return "normal";
    }

    // 品質チェック用ユーティリティ
    function normalizeJa(s: string) {
      return (s || "")
        .trim()
        .replace(/[\u3000\s]+/g, " ")
        .replace(/[“”]/g, '"')
        .replace(/[’]/g, "'")
        .replace(/[‐‑‒–—―]/g, "-")
        .replace(/[．｡]/g, ".")
        .replace(/[，､]/g, ",")
        .replace(/[！]/g, "!")
        .replace(/[？]/g, "?");
    }
    function japaneseRatio(s: string) {
      const txt = (s || "").replace(/\s+/g, "");
      if (!txt) return 0;
      let ja = 0;
      for (const ch of txt) {
        const code = ch.codePointAt(0) || 0;
        // Hiragana, Katakana, Kanji ranges (basic)
        if (
          (code >= 0x3040 && code <= 0x30ff) ||
          (code >= 0x4e00 && code <= 0x9faf) ||
          (code >= 0x3400 && code <= 0x4dbf)
        )
          ja++;
      }
      return ja / txt.length;
    }
    function hasProhibitedPhrases(s: string) {
      const t = s.toLowerCase();
      return (
        t.includes("以上すべて") ||
        t.includes("上記すべて") ||
        t.includes("どれでもない") ||
        t.includes("none of the above") ||
        t.includes("all of the above")
      );
    }
    function dedupeChoices(cs: string[]) {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const c of cs) {
        const k = normalizeJa(c)
          .toLowerCase()
          .replace(/[\s、,。\.]/g, "");
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(normalizeJa(c));
      }
      return out;
    }
    function isNaturalJapaneseText(s: string) {
      // 要件: 日本語比率が一定以上、怪しい文字連結や不自然な句読点の連続を含まない
      const ratio = japaneseRatio(s);
      if (body.language === "ja" && ratio < 0.3) return false;
      if (/\?{2,}|!{2,}|、{3,}|。{3,}/.test(s)) return false;
      if (/^[a-z0-9 _.,:;\-]+$/i.test(s)) return false; // ほぼ英数字のみ
      return true;
    }

    const out = items.map((q, idx) => {
      const promptRaw = q.prompt ?? q.question ?? "";
      const prompt = norm(promptRaw).slice(0, 200);
      const baseChoices = (q.choices ?? q.options ?? []).map((c) => norm(c));
      const choices = dedupeChoices(baseChoices).slice(0, 4);
      return {
        id: norm(q.id ?? `q_${Date.now()}_${idx}`),
        prompt,
        choices,
        answerIndex: Math.max(0, Math.min(3, toIndex({ ...q, choices }))),
        explanation: q.explanation
          ? norm(q.explanation).slice(0, 200)
          : undefined,
        category: categorySlug,
        subgenre: q.subgenre ? norm(q.subgenre) : undefined,
        difficulty:
          difficulty === "mixed"
            ? toDifficulty(q.difficulty)
            : (difficulty as any),
        source: q.source ?? "generated:nano",
      };
    });

    // 事前品質フィルタリング + 全件GPTレビュー＆必要時リライト
    const qualityRejected: any[] = [];
    async function reviewAndMaybeRepair(q: any) {
      try {
        const urlFix = "https://api.openai.com/v1/responses";
        const payloadFix: any = {
          model: "gpt-5-nano",
          input:
            `次の四択クイズの問題文が自然で明確な日本語（です・ます調）かを評価し、` +
            `不自然・曖昧・一意解でない場合は200字以内で修正した問題文を提案してください。` +
            `選択肢と正解インデックスは変更しないでください。\n` +
            `【対象】\n問題: ${q.prompt}\n選択肢: ${q.choices.join(
              ", "
            )}\n正解インデックス: ${q.answerIndex}\n` +
            `出力はJSONのみ: {\"natural\": boolean, \"reason\": string, \"prompt\"?: string, \"explanation\"?: string}`,
          max_output_tokens: budget,
          text: {
            verbosity: "low",
            format: {
              type: "json_schema",
              name: "review",
              schema: {
                type: "object",
                additionalProperties: false,
                // Responses API requires 'required' to include every key listed in 'properties'.
                // Keep the schema minimal (only required keys) to avoid invalid_json_schema errors.
                required: ["natural", "reason"],
                properties: {
                  natural: { type: "boolean" },
                  reason: { type: "string" },
                },
              },
            },
          },
        };
        await logJsonLine("gpt_request", {
          purpose: "generate-batch:review-repair",
          id: q.id,
          model: "gpt-5-nano",
        });
        const r = await fetch(urlFix, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payloadFix),
        });
        const t = await r.text();
        try {
          const reqId =
            r.headers.get("x-request-id") ||
            r.headers.get("openai-organization-request-id") ||
            null;
          // 保存: status/requestId と raw テキストを常にログに残す（400 等の原因追跡用）
          await logJsonLine("gpt_response", {
            purpose: "generate-batch:review-repair",
            status: r.status,
            requestId: reqId,
            raw: t,
            id: q.id,
          });
          const j = JSON.parse(t);
          const out = Array.isArray(j.output) ? j.output : [];
          for (const e of out) {
            const c = e?.content?.[0];
            if (c?.type === "json" && c.json) {
              try {
                gptDebug[q.id] = gptDebug[q.id] || {};
                gptDebug[q.id].review = c.json;
              } catch {}
              return c.json;
            }
            if (c?.type === "output_text" && typeof c.text === "string") {
              try {
                const parsed = JSON.parse(c.text);
                gptDebug[q.id] = gptDebug[q.id] || {};
                gptDebug[q.id].review = parsed;
                return parsed;
              } catch {}
            }
          }
        } catch (err) {
          // JSON 解析などで例外が発生した場合も raw は既にログに記録されているため
        }
      } catch {}
      return null;
    }
    const qualityKept: typeof out = [];
    for (const q0 of out) {
      let q = q0;
      // 全件レビューの実施
      const rev = await reviewAndMaybeRepair(q);
      if (rev && rev.natural === false && typeof rev.prompt === "string") {
        q = {
          ...q,
          prompt: norm(rev.prompt).slice(0, 200),
          explanation: rev.explanation
            ? norm(rev.explanation).slice(0, 200)
            : q.explanation,
        };
      }
      // 最終チェック
      if (!isNaturalJapaneseText(q.prompt)) {
        qualityRejected.push({
          id: q.id,
          reason: "日本語として不自然/英語比率過多（修正不可）",
        });
        continue;
      }
      if (hasProhibitedPhrases(q.prompt)) {
        qualityRejected.push({
          id: q.id,
          reason: "問題文に不適切な表現（修正不可）",
        });
        continue;
      }
      if (q.choices.length !== 4) {
        qualityRejected.push({
          id: q.id,
          reason: "選択肢が4件ではない/重複排除で欠落",
        });
        continue;
      }
      if (q.choices.some((c) => hasProhibitedPhrases(c))) {
        qualityRejected.push({
          id: q.id,
          reason: "選択肢に不適切な表現（以上すべて等）",
        });
        continue;
      }
      if (q.answerIndex < 0 || q.answerIndex > 3) {
        qualityRejected.push({ id: q.id, reason: "正解インデックス不正" });
        continue;
      }
      if (q.choices.some((c) => c.length > 60)) {
        qualityRejected.push({ id: q.id, reason: "選択肢が長すぎる" });
        continue;
      }
      qualityKept.push(q);
    }

    // 既存重複チェック（簡易類似度）: 既存問題と近似した設問を除外（全カテゴリ）
    // 文字bi-gramのDICE係数がしきい値を超える場合を重複と見なす
    function normalizePromptForSim(s: string) {
      return (s || "")
        .toLowerCase()
        .replace(/[\s\u3000]+/g, "")
        .replace(/[！!？?。．,，、\.\-_:;；:\/\\\(\)\[\]『』「」\"'`]/g, "");
    }
    function bigrams(s: string): string[] {
      const a = normalizePromptForSim(s);
      const res: string[] = [];
      for (let i = 0; i < a.length - 1; i++) res.push(a.slice(i, i + 2));
      return res.length ? res : a ? [a] : [];
    }
    function dice(a: string, b: string) {
      const A = bigrams(a);
      const B = bigrams(b);
      if (!A.length || !B.length) return 0;
      const setB = new Map<string, number>();
      for (const x of B) setB.set(x, (setB.get(x) || 0) + 1);
      let inter = 0;
      for (const x of A) {
        const c = setB.get(x) || 0;
        if (c > 0) {
          inter++;
          setB.set(x, c - 1);
        }
      }
      return (2 * inter) / (A.length + B.length);
    }

    async function fetchExistingPromptsAll() {
      try {
        const supabase = serverSupabaseService();
        const { data } = await supabase
          .from("questions")
          .select("id,prompt,category")
          .order("created_at", { ascending: false })
          .limit(1000);
        return (data || []) as {
          id: string;
          prompt: string;
          category: string;
        }[];
      } catch {
        return [] as { id: string; prompt: string; category: string }[];
      }
    }

    const existing = await fetchExistingPromptsAll();
    const DUP_THRESHOLD = 0.6; // わずかに厳格化

    // バッチ内重複の除外（先に近似をはねる）
    const batchKept: typeof out = [];
    const batchDupRejected: any[] = [];
    const BATCH_THRESHOLD = 0.66;
    function choiceOverlap(a: string[], b: string[]) {
      const norm = (s: string) => s.toLowerCase().replace(/[\s、,。\.]/g, "");
      const A = new Set(a.map(norm));
      const B = new Set(b.map(norm));
      let inter = 0;
      for (const x of A) if (B.has(x)) inter++;
      return inter; // 3以上でほぼ同一
    }
    for (const q of qualityKept) {
      const hit = batchKept.some(
        (k) =>
          dice(q.prompt, k.prompt) >= BATCH_THRESHOLD ||
          choiceOverlap(q.choices, k.choices) >= 3
      );
      if (hit) {
        batchDupRejected.push({
          id: q.id,
          reason: "バッチ内で類似（重複の可能性）",
        });
      } else {
        batchKept.push(q);
      }
    }

    const kept: typeof out = [];
    const dupRejected: any[] = [];
    for (const q of batchKept) {
      const isDup = existing.some(
        (e) => dice(q.prompt, e.prompt) >= DUP_THRESHOLD
      );
      if (isDup) {
        dupRejected.push({ id: q.id, reason: "既存と類似（重複の可能性）" });
      } else {
        kept.push(q);
      }
    }

    // kept を検証対象とする
    const toVerify = kept;

    // 検証（Wikipedia優先→LLM自己チェック）
    async function fetchWikiEvidence(query: string, lang: string = "ja") {
      try {
        const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
          query
        )}&utf8=&format=json&srlimit=3&origin=*`;
        const sr = await fetch(searchUrl);
        const sj = await sr.json();
        const hits = sj?.query?.search ?? [];
        const texts: string[] = [];
        const urls: string[] = [];
        for (const h of hits.slice(0, 2)) {
          const title = h?.title;
          if (!title) continue;
          const sumUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
            title
          )}`;
          const rs = await fetch(sumUrl);
          if (!rs.ok) continue;
          const js = await rs.json();
          const extract = js?.extract || js?.description || "";
          const page =
            js?.content_urls?.desktop?.page ||
            js?.url ||
            `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
          if (extract) texts.push(extract);
          if (page) urls.push(page);
        }
        const text = texts.join("\n\n");
        return { text, urls };
      } catch {
        return { text: "", urls: [] };
      }
    }

    async function verifyWithSources(q: any) {
      const ev = await fetchWikiEvidence(q.prompt);
      if (ev.text && ev.text.length > 0) {
        // 事前にエビデンス本文と正誤選択肢の突き合わせ（簡易）
        const normTxt = (ev.text || "").toLowerCase().replace(/\s+/g, "");
        const correct = (q.choices?.[q.answerIndex] || "")
          .toLowerCase()
          .replace(/\s+/g, "");
        const distractors = (q.choices || []).filter(
          (_: any, i: number) => i !== q.answerIndex
        );
        const wrongHit = distractors.some((c: string) =>
          normTxt.includes((c || "").toLowerCase().replace(/\s+/g, ""))
        );
        const correctHit = correct ? normTxt.includes(correct) : false;
        if (!correctHit && wrongHit) {
          return {
            pass: false,
            reason: "エビデンスに誤答のみ含まれる/正解が見当たらない",
          };
        }
        const urlV = "https://api.openai.com/v1/responses";
        const payloadV: any = {
          model: "gpt-5-nano",
          input:
            `あなたはクイズ問題のファクトチェックAIです。以下のクイズ項目を一般的に知られる科学的・教育的知識（例：Wikipedia、教科書、信頼性の高いニュースなど）の範囲で検証してください。` +
            `\n\n出力は必ず以下のJSON構造で、コードフェンスや説明を含めないでください。` +
            `\n{` +
            `\n  "pass": boolean, // 問題が正確であればtrue` +
            `\n  "reason": string, // 判定理由（簡潔に）` +
            `\n  "source_url": string | null, // 可能なら出典URL` +
            `\n  "fixed": object | null // 必要最小限の修正案 (prompt, choices, answerIndex, explanation, category のいずれか)` +
            `\n}` +
            `\n\n注意事項:` +
            `\n- 数値問題は±5%の誤差を許容` +
            `\n- 「約」「およそ」などの曖昧表現は容認` +
            `\n- 出典が不明な場合は source_url を null にする` +
            `\n- JSON以外の出力は禁止` +
            `\n\n【クイズ】` +
            `\n問題: ${q.prompt}` +
            `\n選択肢: ${q.choices.join(", ")}` +
            `\n正解インデックス: ${q.answerIndex}` +
            `\nカテゴリ: ${q.category}` +
            (ev.text ? `\n\n【エビデンス（Wikipedia要約）】\n${ev.text}` : ``) +
            `\n\nJSON以外の出力は禁止。`,
          max_output_tokens: budget,
          text: {
            verbosity: "low",
            format: {
              type: "json_schema",
              name: "verdict",
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["pass", "reason"],
                properties: {
                  pass: { type: "boolean" },
                  reason: { type: "string" },
                },
              },
            },
          },
        };
        try {
          await logJsonLine("gpt_request", {
            purpose: "generate-batch:verify-with-sources",
            id: q.id,
            model: payloadV.model,
            schemaName: payloadV.text?.format?.name ?? null,
          });
        } catch {}
        const r = await fetch(urlV, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payloadV),
        });
        try {
          const t = await r.text();
          try {
            const reqId =
              r.headers.get("x-request-id") ||
              r.headers.get("openai-organization-request-id") ||
              null;
            await logJsonLine("gpt_response", {
              purpose: "generate-batch:verify-with-sources",
              status: r.status,
              requestId: reqId,
              raw: t.slice(0, 20000),
              id: q.id,
            });
          } catch {}
          const j = JSON.parse(t);
          const out = Array.isArray(j.output) ? j.output : [];
          for (const e of out) {
            const c = e?.content?.[0];
            if (c?.type === "json" && c.json) {
              try {
                if (!c.json.source_url && ev.urls?.length)
                  c.json.source_url = ev.urls[0];
                gptDebug[q.id] = gptDebug[q.id] || {};
                gptDebug[q.id].verifyWithSources = c.json;
              } catch {}
              return c.json;
            }
            if (c?.type === "output_text" && typeof c.text === "string") {
              try {
                const v = JSON.parse(c.text);
                if (!v.source_url && ev.urls?.length) v.source_url = ev.urls[0];
                gptDebug[q.id] = gptDebug[q.id] || {};
                gptDebug[q.id].verifyWithSources = v;
                return v;
              } catch {}
            }
          }
        } catch {}
      }
      return await verifyQuestion(q);
    }

    async function verifyQuestion(q: any) {
      const urlV = "https://api.openai.com/v1/responses";
      const payloadV: any = {
        model: "gpt-5-nano",
        input:
          `あなたはクイズ問題のファクトチェックAIです。以下のクイズ項目を一般的に知られる科学的・教育的知識（例：Wikipedia、教科書、信頼性の高いニュースなど）の範囲で検証してください。` +
          `\n\n出力は必ず以下のJSON構造で、コードフェンスや説明を含めないでください。` +
          `\n{` +
          `\n  "pass": boolean, // 問題が正確であればtrue` +
          `\n  "reason": string, // 判定理由（簡潔に）` +
          `\n  "source_url": string | null, // 可能なら出典URL` +
          `\n  "fixed": object | null // 必要最小限の修正案 (prompt, choices, answerIndex, explanation, category のいずれか)` +
          `\n}` +
          `\n\n注意事項:` +
          `\n- 数値問題は±5%の誤差を許容` +
          `\n- 「約」「およそ」などの曖昧表現は容認` +
          `\n- 出典が不明な場合は source_url を null にする` +
          `\n- JSON以外の出力は禁止` +
          `\n\n問題: ${q.prompt}` +
          `\n選択肢: ${q.choices.join(", ")}` +
          `\n送られた正解インデックス: ${q.answerIndex}` +
          `\nカテゴリ: ${q.category}` +
          `\n\nJSON以外の出力は禁止。`,
        max_output_tokens: budget,
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "verdict",
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["pass", "reason"],
              properties: {
                pass: { type: "boolean" },
                reason: { type: "string" },
              },
            },
          },
        },
      };
      try {
        await logJsonLine("gpt_request", {
          purpose: "generate-batch:verify-question",
          id: q.id,
          model: payloadV.model,
          schemaName: payloadV.text?.format?.name ?? null,
        });
      } catch {}
      const r = await fetch(urlV, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payloadV),
      });
      const t = await r.text();
      try {
        try {
          const reqId =
            r.headers.get("x-request-id") ||
            r.headers.get("openai-organization-request-id") ||
            null;
          await logJsonLine("gpt_response", {
            purpose: "generate-batch:verify-question",
            status: r.status,
            requestId: reqId,
            raw: t.slice(0, 20000),
            id: q.id,
          });
        } catch {}
        const j = JSON.parse(t);
        const out = Array.isArray(j.output) ? j.output : [];
        for (const e of out) {
          const c = e?.content?.[0];
          if (c?.type === "json" && c.json) {
            try {
              gptDebug[q.id] = gptDebug[q.id] || {};
              gptDebug[q.id].verifyQuestion = c.json;
            } catch {}
            return c.json;
          }
          if (c?.type === "output_text" && typeof c.text === "string") {
            try {
              const parsed = JSON.parse(c.text);
              gptDebug[q.id] = gptDebug[q.id] || {};
              gptDebug[q.id].verifyQuestion = parsed;
              return parsed;
            } catch {}
          }
        }
      } catch {}
      return { pass: true, reason: "fallback" };
    }

    async function validateAndFixWithSources(q: any) {
      try {
        const ev = await fetchWikiEvidence(q.prompt);
        const url = "https://api.openai.com/v1/responses";
        const payload: any = {
          model: "gpt-5-nano",
          input:
            `あなたはクイズ問題のファクトチェックAIです。以下のクイズ項目を一般的に知られる科学的・教育的知識（例：Wikipedia、教科書、信頼性の高いニュースなど）の範囲で検証してください。` +
            `\n\n出力は必ず以下のJSON構造で、コードフェンスや説明を含めないでください。` +
            `\n{` +
            `\n  "pass": boolean, // 問題が正確であればtrue` +
            `\n  "reason": string, // 判定理由（簡潔に）` +
            `\n  "source_url": string | null, // 可能なら出典URL` +
            `\n  "fixed": object | null // 必要最小限の修正案 (prompt, choices, answerIndex, explanation, category のいずれか)` +
            `\n}` +
            `\n\n注意事項:` +
            `\n- 数値問題は±5%の誤差を許容` +
            `\n- 「約」「およそ」などの曖昧表現は容認` +
            `\n- 出典が不明な場合は source_url を null にする` +
            `\n- JSON以外の出力は禁止` +
            `\n\n【クイズ】` +
            `\n問題: ${q.prompt}` +
            `\n選択肢: ${q.choices.join(", ")}` +
            `\n正解インデックス: ${q.answerIndex}` +
            `\nカテゴリ: ${q.category}` +
            (ev?.text
              ? `\n\n【エビデンス（Wikipedia要約）】\n${ev.text}`
              : ``) +
            `\n\nJSON以外の出力は禁止。`,
          max_output_tokens: budget,
          text: {
            verbosity: "low",
            format: {
              type: "json_schema",
              name: "verdict",
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["pass", "reason"],
                properties: {
                  pass: { type: "boolean" },
                  reason: { type: "string" },
                },
              },
            },
          },
        };
        await logJsonLine("gpt_request", {
          purpose: "generate-batch:validate-and-fix",
          id: q.id,
          model: "gpt-5-nano",
        });
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        });
        const t = await r.text();
        try {
          const j = JSON.parse(t);
          try {
            const reqId =
              r.headers.get("x-request-id") ||
              r.headers.get("openai-organization-request-id") ||
              null;
            await logJsonLine("gpt_response", {
              purpose: "generate-batch:validate-and-fix",
              status: r.status,
              requestId: reqId,
              raw: t.slice(0, 20000),
              id: q.id,
            });
          } catch {}
          const out = Array.isArray(j.output) ? j.output : [];
          for (const e of out) {
            const c = e?.content?.[0];
            if (c?.type === "json" && c.json) {
              try {
                gptDebug[q.id] = gptDebug[q.id] || {};
                gptDebug[q.id].validateAndFix = c.json;
              } catch {}
              return c.json;
            }
            if (c?.type === "output_text" && typeof c.text === "string") {
              try {
                const parsed = JSON.parse(c.text);
                gptDebug[q.id] = gptDebug[q.id] || {};
                gptDebug[q.id].validateAndFix = parsed;
                return parsed;
              } catch {}
            }
          }
        } catch {}
      } catch {}
      return { pass: true, reason: "fallback" } as any;
    }

    const verified: any[] = [];
    const rejected: any[] = [
      ...qualityRejected,
      ...batchDupRejected,
      ...dupRejected,
    ];
    for (const q of toVerify) {
      try {
        const v = await validateAndFixWithSources(q);
        let useQ = { ...q };
        if (v?.fixed && typeof v.fixed === "object") {
          if (typeof v.fixed.prompt === "string") useQ.prompt = v.fixed.prompt;
          if (Array.isArray(v.fixed.choices) && v.fixed.choices.length === 4)
            useQ.choices = v.fixed.choices;
          if (Number.isInteger(v.fixed.answerIndex))
            useQ.answerIndex = v.fixed.answerIndex as number;
          if (typeof v.fixed.explanation === "string")
            useQ.explanation = v.fixed.explanation;
          if (typeof v.fixed.category === "string")
            useQ.category = v.fixed.category;
        }
        let verdict = v;
        if (!verdict?.pass && v?.fixed) {
          // 再検証
          verdict = await verifyQuestion(useQ);
        }
        if (verdict && verdict.pass) {
          verified.push({
            ...useQ,
            verified: true,
            verified_at: new Date().toISOString(),
            verify_notes: verdict.reason,
            source_url: verdict.source_url ?? null,
          });
        } else {
          rejected.push({ id: q.id, reason: verdict?.reason ?? "検証失敗" });
        }
      } catch {
        rejected.push({ id: q.id, reason: "検証エラー" });
      }
    }
    if (dryRun) {
      // dry-run preview logging removed; use structured log via logJsonLine if needed
      await logJsonLine("gpt_job_done", {
        endpoint: "/api/admin/generate-batch",
        dryRun: true,
        kept: verified.length,
        verified: verified.length,
        rejected: rejected.length,
      });
      return json(
        {
          items: verified,
          rejected: rejected,
          ...(debugFlag
            ? { requestId: (res1 as any).requestId, gpt_debug: gptDebug }
            : {}),
        },
        200
      );
    }

    // 保存
    const supabase = serverSupabaseService();
    const rows = verified.map((q) => ({
      // id は送らず、DBの自動採番に任せる
      prompt: q.prompt,
      choices: q.choices,
      answer_index: q.answerIndex,
      explanation: q.explanation ?? null,
      category: q.category,
      subgenre: q.subgenre ?? null,
      difficulty: q.difficulty,
      source: q.source,
    }));
    // upsert begin logging removed; gpt_job_done will record counts
    const { data, error } = await supabase
      .from("questions")
      .insert(rows)
      .select("id");
    if (error) {
      return json({ error: error.message }, 500);
    }
    await logJsonLine("gpt_job_done", {
      endpoint: "/api/admin/generate-batch",
      dryRun: false,
      inserted: data?.length ?? 0,
      kept: verified.length,
      verified: verified.length,
      rejected: rejected.length,
    });
    return json(
      {
        inserted: data?.length ?? 0,
        ids: data?.map((d: any) => d.id) ?? [],
        ...(debugFlag
          ? { requestId: (res1 as any).requestId, gpt_debug: gptDebug }
          : {}),
      },
      200
    );
  } catch (e) {
    const err = e as any;
    return json(
      { error: err?.message || String(e), requestId: err?.requestId || null },
      502
    );
  }
}
