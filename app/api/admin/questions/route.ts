import { NextRequest } from "next/server";
import { z } from "zod";
import { serverSupabaseService, serverSupabaseAnon } from "@/lib/supabase";

export const runtime = "nodejs"; // サービスキー利用のためEdgeは避ける

const Item = z.object({
  id: z.string().min(1).optional(),
  prompt: z.string().min(5).max(200),
  choices: z.array(z.string().min(1)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().max(300).optional(),
  category: z.string().min(1),
  subgenre: z.string().optional(),
  difficulty: z.enum(["easy", "normal", "hard"]),
  source: z.string().min(1),
});

const BodySchema = z.object({ items: z.array(Item).min(1).max(100) });

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  // 簡易認可: 環境変数の管理用トークンがある場合のみ許可（任意）
  const adminToken = process.env.ADMIN_TOKEN;
  const header = req.headers.get("x-admin-token");
  if (adminToken && header !== adminToken) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return json(
      { error: "Invalid request", details: (e as Error).message },
      400
    );
  }

  const supabase = serverSupabaseService();
  const rows = body.items.map((q) => ({
    // id は送らず、DB の identity に任せる
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
    console.log("[admin-questions][POST] upsert begin: count=", rows.length);
  } catch {}

  const { data, error } = await supabase
    .from("questions")
    .insert(rows)
    .select("id");

  if (error) {
    try {
      console.log("[admin-questions][POST] upsert error:", error.message);
    } catch {}
    return json({ error: error.message }, 500);
  }

  try {
    console.log(
      "[admin-questions][POST] upsert success: inserted=",
      data?.length ?? 0
    );
  } catch {}
  return json({ inserted: data?.length ?? 0 }, 200);
}

// 確認用: 直近の問題を取得（読み取りは anon でOK）
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") || undefined;
  const limit = Math.min(
    100,
    Math.max(1, Number(searchParams.get("limit") || 20))
  );

  const supabase = serverSupabaseAnon();
  try {
    console.log("[admin-questions][GET] 取得を開始します", { category, limit });
  } catch {}
  let query = supabase
    .from("questions")
    .select("id,prompt,category,difficulty,source,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) {
    try {
      console.log("[admin-questions][GET] error:", error.message, {
        category,
        limit,
      });
    } catch {}
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    const items = data ?? [];
    const preview = items.slice(0, 3).map((x: any) => ({ id: x.id, prompt: x.prompt?.slice(0, 30), category: x.category, difficulty: x.difficulty }));
    console.log("[admin-questions][GET] success:", { category, limit, returned: items.length });
    console.log("[admin-questions][GET] レスポンスの中身 (先頭3件プレビュー):", preview);
  } catch {}
  return new Response(JSON.stringify({ items: data ?? [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
