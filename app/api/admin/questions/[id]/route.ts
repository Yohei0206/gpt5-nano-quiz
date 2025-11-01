import { NextRequest } from "next/server";
import { z } from "zod";
import { serverSupabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const BodySchema = z.object({
  prompt: z.string().min(5).max(400),
  choices: z.array(z.string().min(1)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().max(500).optional().nullable(),
  category: z.string().min(1),
  difficulty: z.enum(["easy", "normal", "hard"]),
  source: z.string().min(1).optional(),
  subgenre: z.string().optional().nullable(),
});

function normalizeCategory(input: string): string {
  const raw = (input || "").trim();
  const lower = raw.toLowerCase();
  const known = new Set([
    "general",
    "science",
    "entertainment",
    "trivia",
    "japan",
    "world",
    "society",
  ]);
  if (known.has(lower)) return lower;
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
  if (lower.includes("science") || raw.includes("理系") || raw.includes("科学"))
    return "science";
  if (lower.includes("trivia") || raw.includes("雑学")) return "trivia";
  if (lower.includes("japan") || raw.includes("日本")) return "japan";
  if (lower.includes("world") || raw.includes("世界")) return "world";
  if (lower.includes("society") || raw.includes("時事") || raw.includes("社会"))
    return "society";
  return lower || "trivia";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id?: string } }
) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken) {
    const provided = req.headers.get("x-admin-token");
    if (provided !== adminToken) return json({ error: "Unauthorized" }, 401);
  }

  const idParam = params?.id;
  if (!idParam) return json({ error: "Missing question id" }, 400);
  const idValue = /^\d+$/.test(idParam) ? Number(idParam) : idParam;

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
  const payload: Record<string, unknown> = {
    prompt: body.prompt,
    choices: body.choices,
    answer_index: body.answerIndex,
    explanation: body.explanation ?? null,
    category: normalizeCategory(body.category),
    difficulty: body.difficulty,
    subgenre: body.subgenre ?? null,
  };
  if (body.source) payload.source = body.source;

  const { data, error } = await supabase
    .from("questions")
    .update(payload)
    .eq("id", idValue)
    .select(
      "id,prompt,choices,answer_index,explanation,category,difficulty,source,subgenre,created_at"
    )
    .single();

  if (error)
    return json({ error: error.message || "Failed to update question" }, 500);
  if (!data)
    return json({ error: "Question not found or no changes applied" }, 404);

  return json({
    item: {
      id: data.id,
      prompt: data.prompt,
      choices: Array.isArray(data.choices) ? data.choices : [],
      answerIndex:
        typeof data.answer_index === "number" ? data.answer_index : null,
      explanation: data.explanation ?? null,
      category: data.category,
      difficulty: data.difficulty,
      source: data.source,
      subgenre: data.subgenre ?? null,
      created_at: data.created_at,
    },
  });
}

