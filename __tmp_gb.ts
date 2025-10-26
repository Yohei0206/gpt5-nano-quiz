import { NextRequest } from "next/server";
import { z } from "zod";
import { serverSupabaseService } from "@/lib/supabase";
import { text } from "stream/consumers";

export const runtime = "nodejs"; // Service Role 使用

const ReqSchema = z.object({
  genre: z.string().min(1),
  count: z.number().int().min(1).max(20).default(10),
  difficulty: z.enum(["easy", "normal", "hard", "mixed"]).default("normal"),
  language: z.enum(["ja", "en"]).default("ja"),
});

// モチE��出力�E緩めに受けてから正規化
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

// Responses API の出力かめEjson もしく�E text を走査して配�Eもしく�E {items: [...]} を取り�EぁEfunction parseFromAny(j: any): any[] {
  try {
    const outputs = Array.isArray(j?.output) ? j.output : [];
    // 1) content の json を優允E    for (const entry of outputs) {
      const content = (entry as any)?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c && c.type === "json" && c.json) {
            const candidate = typeof c.json === "object" ? (c.json.items ?? c.json) : c.json;
            try { return Array.isArray(candidate) ? candidate : []; } catch {}
          }
        }
      }
    }
    // 2) content の output_text ↁEまず�E斁EJSON.parse、ダメなら�E列抽出
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
    // 3) 最後に j.output_text を見る
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
    "あなた�E教育皁E��安�Eなクイズ作�Eアシスタントです、E,
    "- 出力�EJSON配�Eのみ。前後に説明や余計な斁E���Eコードフェンスを含めなぁE��E,
    "- 吁E��素は {id,prompt,choices(4),answerIndex,explanation?,category,subgenre?,difficulty,source}、E,
    "- choicesは重褁E��し�E妥当な候裁Eつ、E,
    "- 不適刁E�E差別皁E��現、医癁E法律助言は禁止、E,
  ].join("\n");

  const difficulty = body.difficulty === "mixed" ? "mixed" : body.difficulty;
  const user = [
    `ジャンル/Category: ${body.genre}`,
    `難易度/Difficulty: ${difficulty}`,
    `言誁ELanguage: ${body.language}`,
    `出題数/Count: ${body.count}`,
    "重要E 忁E�� Count 件の要素を持つ JSON 配�Eのみを返すこと。空配�EめE��足は禁止、E,
  ].join("\n");

  const url = "https://api.openai.com/v1/responses";
  const budget = 1800;

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
      console.log("[generate-batch] fetch response", { status: r.status, requestId: reqId });
      console.log("[generate-batch] raw response (first 2000 chars):\n", text.slice(0, 2000));
    } catch {}
    if (!r.ok) {
      const e = new Error(`OpenAI error ${r.status}: ${text}`) as any;
      (e as any).requestId = reqId;
      throw e;
    }
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    return { json, requestId: reqId, raw: text } as any;
  }

  try {
    // 1st attempt
    const res1 = await call(payload);
    const j1 = (res1 as any).json;
    try {
      console.log("[generate-batch] attempt1 response", {
        requestId: (res1 as any).requestId,
      });
    } catch {}

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
      // Fallback: try full JSON object with { items: [...] }
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
    try {
      console.log(
        "[generate-batch] after attempt1 items:",
        Array.isArray(items) ? items.length : 0
      );
    } catch {}

    // Retry with JSON-only enforcement if needed
    if (!Array.isArray(items) || items.length === 0) {
      const res2 = await call({
        ...payload,
        input: `${system}\n\n${user}\n出力�E忁E��JSON配�Eのみ。コードフェンスめE��明�E禁止。`,
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
      const schemaHint = `以下�E形式�EJSON配�Eのみで返してください。侁E\n[
  {"id":"q1","prompt":"...","choices":["A","B","C","D"],"answerIndex":1,"explanation":"...","category":"${body.genre}","difficulty":"normal","source":"generated:nano"}
]`;
      const res3 = await call({
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
      return json({
        error: "生�E結果が空でした。ジャンルめE��数を見直して再試行してください、E,
        attempted: true,
      }, 422);
    }

    // 追加試衁E 不足刁E��ある場合�E残り件数のみ再生成して補完（最大1回！E    if (Array.isArray(items) && items.length < body.count) {
      const remaining = Math.max(0, body.count - items.length);
      if (remaining > 0) {
        try {
          const resExtra = await call({
            ...payload,
            input: `${system}\n\nジャンル/Category: ${body.genre}\n難易度/Difficulty: ${difficulty}\n言誁ELanguage: ${body.language}\n出題数/Count: ${remaining}\n吁E��E��は簡潔に�E�Eromptは200字以冁E��explanationは100字以冁E��、En重要E 忁E�� Count 件の要素を持つ JSON 配�Eのみを返すこと。`,
            text: { verbosity: "low", format: buildJsonSchema() },
          });
          const jExtra = (resExtra as any).json;
          let extra: any[] = parseFromAny(jExtra) as any[];
          const f = jExtra?.output?.[0]?.content?.[0];
          if (f && f.type === "json" && f.json) {
            const cand = (typeof f.json === 'object') ? (f.json.items ?? f.json) : f.json;
            try { extra = RawArr.parse(cand) as any[]; } catch {}
          }
          if (!Array.isArray(extra) || extra.length === 0) {
            let t = jExtra?.output_text ?? jExtra?.output?.[0]?.content?.[0]?.text ?? "[]";
            t = extractJsonArray(t);
            try { extra = RawArr.parse(JSON.parse(t)) as any[]; } catch {}
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
      if (s.includes("easy") || s.includes("初紁E)) return "easy";
      if (s.includes("hard") || s.includes("上紁E) || s.includes("difficult"))
        return "hard";
      return "normal";
    }

    const out = items.map((q, idx) => {
      const promptRaw = q.prompt ?? q.question ?? "";
      const prompt = norm(promptRaw).slice(0, 200);
      const baseChoices = (q.choices ?? q.options ?? []).map((c) => norm(c));
      const choices = baseChoices.slice(0, 4);
      return {
        id: norm(q.id ?? `q_${Date.now()}_${idx}`),
        prompt,
        choices,
        answerIndex: Math.max(0, Math.min(3, toIndex({ ...q, choices }))),
        explanation: q.explanation
          ? norm(q.explanation).slice(0, 200)
          : undefined,
        category: body.genre,
        subgenre: q.subgenre ? norm(q.subgenre) : undefined,
        difficulty:
          difficulty === "mixed"
            ? toDifficulty(q.difficulty)
            : (difficulty as any),
        source: q.source ?? "generated:nano",
      };
    });

    if (dryRun) {
      try {
        console.log(
          "[generate-batch] dry-run items preview:",
          out
            .slice(0, 2)
            .map((q) => ({ id: q.id, prompt: q.prompt.slice(0, 30) }))
        );
      } catch {}
      return json(
        {
          items: out,
          ...(debugFlag ? { requestId: (res1 as any).requestId } : {}),
        },
        200
      );
    }

    // 保孁E    const supabase = serverSupabaseService();
    const rows = out.map((q) => ({
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
    try {
      console.log("[generate-batch] upsert begin", { rows: rows.length });
    } catch {}
    const { data, error } = await supabase
      .from("questions")
      .insert(rows)
      .select("id");
    if (error) {
      try {
        console.log("[generate-batch] upsert error:", error.message);
      } catch {}
      return json({ error: error.message }, 500);
    }

    try {
      console.log("[generate-batch] upsert success", {
        inserted: data?.length ?? 0,
      });
    } catch {}
    return json(
      {
        inserted: data?.length ?? 0,
        ids: data?.map((d: any) => d.id) ?? [],
        ...(debugFlag ? { requestId: (res1 as any).requestId } : {}),
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

