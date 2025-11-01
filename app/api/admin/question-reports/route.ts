import { NextRequest } from "next/server";
import { serverSupabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function GET(req: NextRequest) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken) {
    const provided = req.headers.get("x-admin-token");
    if (provided !== adminToken) return json({ error: "Unauthorized" }, 401);
  }

  const { searchParams } = new URL(req.url);
  const modeParam = searchParams.get("mode");
  const mode =
    modeParam && ["single", "versus"].includes(modeParam)
      ? (modeParam as "single" | "versus")
      : undefined;
  const search = (searchParams.get("q") || "").trim();
  const limitRaw = Number(searchParams.get("limit") || 20);
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));
  const pageRaw = Number(searchParams.get("page") || 1);
  const page = Math.max(1, Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = serverSupabaseService();
  let query = supabase
    .from("question_reports")
    .select(
      "id,question_id,prompt,choices,answer_index,explanation,category,mode,context,created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (mode) query = query.eq("mode", mode);
  if (search) {
    const sanitized = search.replace(/[%_]/g, "\\$&");
    const like = `%${sanitized}%`;
    const conditions = [
      `prompt.ilike.${like}`,
      `question_id.ilike.${like}`,
    ];
    query = query.or(conditions.join(","));
  }

  const { data, error, count } = await query;
  if (error) return json({ error: error.message }, 500);

  const items = (data ?? []).map((row: any) => ({
    id: row.id,
    questionId: row.question_id ?? null,
    prompt: row.prompt,
    choices: Array.isArray(row.choices) ? row.choices : [],
    answerIndex:
      typeof row.answer_index === "number" ? row.answer_index : null,
    explanation: row.explanation ?? null,
    category: row.category ?? null,
    mode: row.mode,
    context: row.context ?? null,
    created_at: row.created_at,
  }));
  const total = typeof count === "number" ? count : items.length;
  const hasMore =
    typeof count === "number" ? total > to + 1 : items.length === limit;

  return json({ items, total, limit, page, hasMore });
}

