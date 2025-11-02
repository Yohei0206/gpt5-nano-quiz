import { NextRequest } from "next/server";
import { serverSupabaseAnon } from "@/lib/supabase";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category")?.trim();
  const difficulty = searchParams.get("difficulty") as "easy" | "normal" | "hard" | null;
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") || 10)));

  const supabase = serverSupabaseAnon();

  let query = supabase
    .from("questions")
    .select(
      "id,prompt,choices,answer_index,answer_text,explanation,category,subgenre,difficulty,source,created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (category) query = query.eq("category", category);
  if (difficulty && ["easy","normal","hard"].includes(difficulty)) query = query.eq("difficulty", difficulty);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await query.range(from, to);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "content-type": "application/json" } });
  }

  const list = (data || []).map((r: any) => ({
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
    createdAt: r.created_at,
  }));

  return new Response(JSON.stringify({ total: count ?? list.length, page, pageSize, data: list }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
