import { NextRequest } from "next/server";
import { z } from "zod";
import { serverSupabaseService, serverSupabaseAnon } from "@/lib/supabase";

export const runtime = "nodejs"; // サービスキー利用のためEdgeは避ける

const Item = z.object({
  id: z.string().min(1).optional(),
  prompt: z.string().min(5).max(200),
  choices: z.array(z.string().min(1)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  answerText: z.string().min(1).optional(),
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

  // カテゴリーをスラッグへ正規化（FK: categories.slug）
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
      "一般教養": "general",
      "理系・科学": "science",
      "理系": "science",
      "文化・エンタメ": "entertainment",
      "エンタメ": "entertainment",
      "雑学": "trivia",
      "日本": "japan",
      "世界": "world",
      "時事・社会": "society",
      "時事": "society",
      "アニメ・ゲーム・漫画": "entertainment",
      "アニメ": "entertainment",
      "ゲーム": "entertainment",
      "漫画": "entertainment",
    };
    if (raw in alias) return alias[raw];
    if (lower.includes("entertain")) return "entertainment";
    if (lower.includes("general")) return "general";
    if (lower.includes("science") || raw.includes("理系") || raw.includes("科学")) return "science";
    if (lower.includes("trivia") || raw.includes("雑学")) return "trivia";
    if (lower.includes("japan") || raw.includes("日本")) return "japan";
    if (lower.includes("world") || raw.includes("世界")) return "world";
    if (lower.includes("society") || raw.includes("時事") || raw.includes("社会")) return "society";
    // 収束せず、入力をそのまま小文字スラッグとして返す
    return lower || "trivia";
  }

  const supabase = serverSupabaseService();
  const rows = body.items.map((q) => {
    const directAnswer =
      typeof q.answerText === "string" && q.answerText.trim().length > 0
        ? q.answerText.trim()
        : null;
    const choiceAnswer = (() => {
      const choice = q.choices?.[q.answerIndex];
      if (typeof choice === "string" && choice.trim().length > 0) {
        return choice.trim();
      }
      return null;
    })();
    const answerText = directAnswer || choiceAnswer;
    return {
      // id は送らず、DB の identity に任せる
      prompt: q.prompt,
      choices: q.choices,
      answer_index: q.answerIndex,
      answer_text: answerText,
      explanation: q.explanation ?? null,
      category: normalizeCategory(q.category),
      subgenre: q.subgenre ?? null,
      difficulty: q.difficulty,
      source: q.source,
    };
  });
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
  const categoryParam = searchParams.get("category");
  const category =
    categoryParam && categoryParam !== "all" ? categoryParam : undefined;
  const difficultyParam = searchParams.get("difficulty");
  const difficulty =
    difficultyParam &&
    ["easy", "normal", "hard"].includes(difficultyParam.toLowerCase())
      ? (difficultyParam.toLowerCase() as "easy" | "normal" | "hard")
      : undefined;
  const search = (searchParams.get("q") || "").trim();
  const limitRaw = Number(searchParams.get("limit") || 20);
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));
  const pageRaw = Number(searchParams.get("page") || 1);
  const page = Math.max(1, Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = serverSupabaseAnon();
  try {
    console.log("[admin-questions][GET] 取得を開始します", {
      category,
      difficulty,
      search,
      limit,
      page,
    });
  } catch {}

  let query = supabase
    .from("questions")
    .select(
      "id,prompt,choices,answer_index,answer_text,explanation,category,difficulty,source,subgenre,created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (category) query = query.eq("category", category);
  if (difficulty) query = query.eq("difficulty", difficulty);
  if (search) {
    const sanitized = search.replace(/[%_]/g, "\\$&");
    const like = `%${sanitized}%`;
    const conditions = [`prompt.ilike.${like}`];
    if (/^\d+$/.test(search)) {
      conditions.push(`id.eq.${search}`);
    }
    query = query.or(conditions.join(","));
  }

  const { data, error, count } = await query;
  if (error) {
    try {
      console.log("[admin-questions][GET] error:", error.message, {
        category,
        difficulty,
        search,
        limit,
        page,
      });
    } catch {}
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  const items = (data ?? []).map((row: any) => ({
    id: row.id,
    prompt: row.prompt,
    choices: Array.isArray(row.choices) ? row.choices : [],
    answerIndex:
      typeof row.answer_index === "number" ? row.answer_index : null,
    answerText:
      typeof row.answer_text === "string" && row.answer_text.trim().length > 0
        ? row.answer_text
        : null,
    explanation: row.explanation ?? null,
    category: row.category,
    difficulty: row.difficulty,
    source: row.source,
    subgenre: row.subgenre ?? null,
    created_at: row.created_at,
  }));
  const total = typeof count === "number" ? count : items.length;
  const hasMore =
    typeof count === "number" ? total > to + 1 : items.length === limit;
  try {
    const preview = items.slice(0, 3).map((x: any) => ({
      id: x.id,
      prompt: x.prompt?.slice(0, 30),
      category: x.category,
      difficulty: x.difficulty,
    }));
    console.log("[admin-questions][GET] success:", {
      category,
      difficulty,
      search,
      limit,
      page,
      returned: items.length,
      total,
    });
    console.log("[admin-questions][GET] レスポンスの中身 (先頭3件プレビュー):", preview);
  } catch {}
  return new Response(
    JSON.stringify({ items, total, limit, page, hasMore }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
}
