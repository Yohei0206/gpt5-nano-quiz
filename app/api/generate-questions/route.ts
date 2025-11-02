import { NextRequest } from "next/server";
import { z } from "zod";
import { serverSupabaseAnon } from "@/lib/supabase";

export const runtime = "edge";

const BodySchema = z.object({
  category: z.string().max(50).optional(),
  difficulty: z.enum(["easy", "normal", "hard"]).default("normal"),
  count: z.number().int().min(1).max(10).default(4),
  language: z.enum(["ja", "en"]).default("ja"),
  title: z.string().max(100).optional(),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return json({ error: "Invalid request", details: (e as Error).message }, 400);
  }

  const supabase = serverSupabaseAnon();
  const hasCategory = !!(body.category && body.category.trim().length > 0);
  const hasTitle = !!(body as any).title && String((body as any).title).trim().length > 0;

  let query = supabase
    .from("questions")
    .select(
      "id,prompt,choices,answer_index,answer_text,explanation,category,subgenre,difficulty,source"
    )
    .eq("difficulty", body.difficulty);
  if (hasCategory) query = query.eq("category", body.category!.trim());
  if (hasTitle) query = query.eq("franchise", String((body as any).title).trim());
  const { data, error } = await query.limit(200);

  if (error) return json({ error: error.message }, 500);
  const rows = Array.isArray(data) ? data : [];

  let pool = rows;
  if (pool.length < body.count) {
    if (hasCategory || hasTitle) {
      let q1 = supabase
        .from("questions")
        .select(
          "id,prompt,choices,answer_index,answer_text,explanation,category,subgenre,difficulty,source"
        )
        .limit(200);
      if (hasCategory) q1 = q1.eq("category", body.category!.trim());
      if (hasTitle) q1 = q1.eq("franchise", String((body as any).title).trim());
      const { data: more1 } = await q1;
      if (more1) pool = uniqueById([...pool, ...more1]);
    }
    // タイトル指定がある場合はそれ以外を混ぜない
    if (pool.length < body.count && !hasTitle) {
      const { data: more2 } = await supabase
        .from("questions")
        .select(
          "id,prompt,choices,answer_index,answer_text,explanation,category,subgenre,difficulty,source"
        )
        .limit(500);
      if (more2) pool = uniqueById([...pool, ...more2]);
    }
  }

  const picked = shuffle(pool).slice(0, body.count).map((r: any) => ({
    id: r.id,
    prompt: r.prompt,
    choices: r.choices as string[],
    answerIndex: r.answer_index as number,
    answerText:
      typeof r.answer_text === "string" && r.answer_text.trim().length > 0
        ? r.answer_text
        : undefined,
    explanation: r.explanation ?? undefined,
    category: r.category,
    subgenre: r.subgenre ?? undefined,
    difficulty: r.difficulty,
    source: r.source ?? "db",
  }));

  if (picked.length === 0) return json({ error: "指定条件で問題を用意できませんでした" }, 404);
  return json(picked, 200);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uniqueById<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    if (!seen.has(x.id)) {
      seen.add(x.id);
      out.push(x);
    }
  }
  return out;
}
