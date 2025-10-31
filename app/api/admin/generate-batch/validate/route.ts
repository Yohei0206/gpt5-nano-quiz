import { NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
const budget = 600;
const ReqSchema = z.object({
  genre: z.string().min(1),
  count: z.number().int().min(1).max(20).default(6),
  difficulty: z.enum(["easy", "normal", "hard", "mixed"]).default("normal"),
  language: z.enum(["ja", "en"]).default("ja"),
});

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

function parseFromAny(j: any): any[] {
  try {
    const outputs = Array.isArray(j?.output) ? j.output : [];
    for (const entry of outputs) {
      const content = (entry as any)?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c && c.type === "json" && c.json) {
            const candidate =
              typeof c.json === "object" ? c.json.items ?? c.json : c.json;
            return Array.isArray(candidate) ? candidate : [];
          }
        }
      }
    }
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

  const apiKey = process.env.API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return json({ error: "Missing OpenAI API key" }, 500);

  const difficulty = body.difficulty === "mixed" ? "mixed" : body.difficulty;
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
    return lower || "trivia";
  }
  const categorySlug = normalizeCategory(body.genre);
  const system = [
    "あなたは事実ベースの4択クイズ作成アシスタントです。",
    "- 出力はJSON配列のみ（前後の説明・コードフェンス禁止）。",
    "- {id,prompt,choices(4),answerIndex,explanation?,category,subgenre?,difficulty,source} を満たすこと。",
    "- 言語がjaのときは自然で読みやすい日本語（です・ます調）を用いる。",
    "- 1問1正解、曖昧/トリック禁止。choicesは重複・同義禁止。",
  ].join("\n");
  const user = [
    `ジャンル/Category: ${categorySlug}`,
    `難易度/Difficulty: ${difficulty}`,
    `言語/Language: ${body.language}`,
    `出題数/Count: ${body.count}`,
    "重要: JSON配列のみ、件数ぴったりを返す。",
  ].join("\n");

  const payload = {
    model: "gpt-5-nano",
    input: `${system}\n\n${user}`,
    max_output_tokens: budget,
    reasoning: { effort: "low" as const },
  } as const;

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const raw = await r.text();
  if (!r.ok) return json({ error: `OpenAI error ${r.status}`, raw }, 502);
  let j: any = null;
  try {
    j = JSON.parse(raw);
  } catch {}
  const items = parseFromAny(j);
  return json({ items, raw }, 200);
}
